/**
 * AI助手模块
 * 负责AI功能的管理和交互
 */
import { I18n } from './i18n.js';
import { Utils } from './utils.js';
import { Menu } from './menu.js';
import { Notification } from './notification.js';
// AI配置相关变量
let aiConfig = {
    enabled: false,
    providers: [
        {
            name: 'OpenAI',
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            isDefault: true
        }
    ],
    currentProvider: null,
    quickPrompts: [
        '帮我总结这段内容',
        '翻译成中文',
        '优化这段文字',
        '写一个关于这个主题的大纲'
    ],
    systemPrompt: '你是一个智能助手，请用简洁友好的语言回答用户的问题。'
};

// 对话历史记录,
let conversationHistory = [];
let currentConversationId = null;

// 存储键名常量,
const STORAGE_KEYS = {
    AI_CONFIG: 'aiConfig',
    AI_CONVERSATIONS: 'aiConversations'
};

/**
 * AI模块API命名空间
 * @namespace
 */
export const AI = {
    /**
     * 初始化AI模块
     * @returns {Promise<void>}
     */
    async initialize() {
        // 从存储加载AI配置和对话历史
        await loadAIConfig();
        await loadConversationHistory();
        
        // 创建AI UI元素
        createAIUI();
        
        // 设置事件监听
        setupAIEvents();
        
        // 监听搜索表单变化，确保AI按钮始终有效
        observeSearchForm();
    },

    /**
     * 获取AI配置
     * @returns {Object} - AI配置对象
     */
    getConfig() {
        return { ...aiConfig };
    },

    /**
     * 更新AI配置
     * @param {Object} newConfig - 新的配置
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async updateConfig(newConfig) {
        try {
            aiConfig = { ...aiConfig, ...newConfig };
            await chrome.storage.local.set({ [STORAGE_KEYS.AI_CONFIG]: aiConfig });
            
            // 更新UI状态
            updateAIButtonVisibility();
            
            return true;
        } catch (error) {
            console.error('保存AI配置失败:', error);
            return false;
        }
    },

    /**
     * 获取可用的AI模型列表
     * @param {string} apiUrl - API地址
     * @param {string} apiKey - API密钥
     * @returns {Promise<Array<string>>} - 模型列表
     */
    async getModels(apiUrl, apiKey) {
        if (!apiUrl || !apiKey) {
            throw new Error(I18n.getMessage('aiConfigIncomplete', 'API配置不完整'));
        }

        try {
            // 构建模型列表API URL
            const baseUrl = new URL(apiUrl);
            const modelsUrl = new URL('/v1/models', baseUrl.origin);

            // 发送请求获取模型列表
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // 处理返回的模型数据
            if (Array.isArray(data.data)) {
                return data.data
                    .map(model => model.id)
                    .filter(id => id.includes('gpt') || id.includes('claude') || id.includes('deepseek')); // 只返回主要的聊天模型
            }

            return [];
            
        } catch (error) {
            console.error('获取模型列表失败:', error);
            throw new Error(I18n.getMessage('modelListFetchFailed', '获取模型列表失败: ') + error.message);
        }
    },

    /**
     * 发送消息到AI（支持多轮对话）
     * @param {string} message - 用户消息
     * @param {string} conversationId - 对话ID（可选，不传则创建新对话）
     * @returns {Promise<Object>} - 包含AI回复和对话ID的对象
     */
    async sendMessage(message, conversationId = null) {
        // 检查网络连接
        if (!navigator.onLine) {
            throw new Error('网络连接异常，请检查网络设置');
        }
        
        console.log('AI配置状态:', aiConfig); // 调试日志
        
        if (!aiConfig.enabled) {
            console.error('AI功能未启用');
            throw new Error(I18n.getMessage('aiNotEnabled', 'AI功能未启用'));
        }

        const currentProvider = aiConfig.currentProvider || aiConfig.providers[0];
        console.log('当前提供商:', currentProvider); // 调试日志
        
        if (!currentProvider || !currentProvider.apiUrl || !currentProvider.apiKey) {
            console.error('AI配置不完整:', currentProvider);
            throw new Error(I18n.getMessage('aiConfigIncomplete', 'AI配置不完整'));
        }

        try {
            // 获取或创建对话
            let conversation = null;
            if (conversationId) {
                conversation = conversationHistory.find(c => c.id === conversationId);
            }
            
            if (!conversation) {
                // 创建新对话
                conversation = createNewConversation(message);
                conversationHistory.unshift(conversation);
            }

            // 添加用户消息到对话历史
            const userMessage = {
                role: 'user',
                content: message,
                timestamp: Date.now()
            };
            conversation.messages.push(userMessage);

            // 构建要发送给API的消息列表
            const apiMessages = [
                {
                    role: 'system',
                    content: aiConfig.systemPrompt
                },
                ...conversation.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ];
            
            // 修改构建聊天完成端点URL的逻辑
            try {
                // 构建聊天完成端点URL
                let chatUrl;
                const apiUrl = currentProvider.apiUrl.trim();
                
                // 如果URL已经是完整的chat/completions端点，直接使用
                if (apiUrl.includes('/chat/completions')) {
                    chatUrl = apiUrl;
                } else if (apiUrl.includes('/v1')) {
                    // 如果包含v1但没有chat/completions，添加chat/completions
                    chatUrl = apiUrl.endsWith('/') ? apiUrl + 'chat/completions' : apiUrl + '/chat/completions';
                } else {
                    // 标准OpenAI格式
                    const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
                    chatUrl = baseUrl + '/v1/chat/completions';
                }
                
                console.log('使用的API URL:', chatUrl); // 调试日志
                
                const response = await fetch(chatUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentProvider.apiKey}`
                    },
                    body: JSON.stringify({
                        model: currentProvider.model,
                        messages: apiMessages,
                        max_tokens: 1000,
                        temperature: 0.7
                    })
                });

                console.log('API响应状态:', response.status); // 调试日志
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('API错误响应:', errorText);
                    
                    if (response.status === 404) {
                        throw new Error(`API地址未找到（404）。使用的URL: ${chatUrl}。请检查API地址配置。`);
                    } else if (response.status === 401) {
                        throw new Error('API密钥无效（401）。请检查您的API密钥。');
                    } else if (response.status === 429) {
                        throw new Error('请求过于频繁（429）。请稍后再试。');
                    } else {
                        throw new Error(`API请求失败: ${response.status} - ${response.statusText}. 响应: ${errorText}`);
                    }
                }

                const data = await response.json();
                console.log('API响应数据:', data); // 调试日志
                const aiReply = data.choices?.[0]?.message?.content || I18n.getMessage('aiNoResponse', '暂无回复');
                
                // 添加AI回复到对话历史
                const aiMessage = {
                    role: 'assistant',
                    content: aiReply,
                    timestamp: Date.now()
                };
                conversation.messages.push(aiMessage);
                
                // 更新对话的最后更新时间和标题
                conversation.lastUpdated = Date.now();
                if (conversation.messages.length === 2) {
                    // 如果是第一轮对话，用用户的问题作为标题
                    conversation.title = message.length > 50 ? message.substring(0, 50) + '...' : message;
                }

                // 保存对话历史
                await saveConversationHistory();
                
                return {
                    reply: aiReply,
                    conversationId: conversation.id,
                    conversation: conversation
                };
                
            } catch (error) {
                console.error('AI请求详细错误:', error);
                throw new Error(I18n.getMessage('aiRequestFailed', 'AI请求失败: ') + error.message);
            }
        } catch (error) {
            console.error('AI请求失败:', error);
            throw new Error(I18n.getMessage('aiRequestFailed', 'AI请求失败: ') + error.message);
        }
    },

    /**
     * 获取对话历史列表
     * @returns {Array} 对话历史列表
     */
    getConversationHistory() {
        return conversationHistory.map(conv => ({
            id: conv.id,
            title: conv.title,
            lastUpdated: conv.lastUpdated,
            messageCount: conv.messages.length
        }));
    },

    /**
     * 获取特定对话的详细信息
     * @param {string} conversationId - 对话ID
     * @returns {Object|null} 对话详细信息
     */
    getConversation(conversationId) {
        return conversationHistory.find(c => c.id === conversationId) || null;
    },

    /**
     * 删除对话
     * @param {string} conversationId - 对话ID
     * @returns {Promise<boolean>} 删除是否成功
     */
    async deleteConversation(conversationId) {
        try {
            const index = conversationHistory.findIndex(c => c.id === conversationId);
            if (index !== -1) {
                conversationHistory.splice(index, 1);
                await saveConversationHistory();
                return true;
            }
            return false;
        } catch (error) {
            console.error('删除对话失败:', error);
            return false;
        }
    },

    /**
     * 清空所有对话历史
     * @returns {Promise<boolean>} 清空是否成功
     */
    async clearAllConversations() {
        try {
            conversationHistory = [];
            await saveConversationHistory();
            return true;
        } catch (error) {
            console.error('清空对话历史失败:', error);
            return false;
        }
    },

    /**
     * 显示AI对话框
     * @param {string} initialMessage - 初始消息（可选）
     * @param {string} conversationId - 要继续的对话ID（可选）
     */
    showAIDialog(initialMessage = '', conversationId = null) {
        showAIModal(initialMessage, conversationId);
    },

    /**
     * 检查AI是否启用
     * @returns {boolean} - 是否启用
     */
    isEnabled() {
        return aiConfig.enabled;
    },

    /**
     * 重新初始化AI按钮事件（用于表单替换后重新绑定事件）
     */
    reinitializeButton() {
        setupAIEvents();
    }
};

/**
 * 创建新对话
 * @param {string} firstMessage - 第一条消息
 * @returns {Object} 新对话对象
 */
function createNewConversation(firstMessage) {
    return {
        id: generateConversationId(),
        title: I18n.getMessage('newConversation', '新对话'),
        messages: [],
        createdAt: Date.now(),
        lastUpdated: Date.now()
    };
}

/**
 * 生成对话ID
 * @returns {string} 唯一对话ID
 */
function generateConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 从存储加载AI配置
 * @returns {Promise<void>}
 */
async function loadAIConfig() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEYS.AI_CONFIG]);
        if (result[STORAGE_KEYS.AI_CONFIG]) {
            aiConfig = { ...aiConfig, ...result[STORAGE_KEYS.AI_CONFIG] };
        }
    } catch (error) {
        console.error('加载AI配置失败:', error);
    }
}

/**
 * 从存储加载对话历史
 * @returns {Promise<void>}
 */
async function loadConversationHistory() {
    try {
        const result = await chrome.storage.local.get([STORAGE_KEYS.AI_CONVERSATIONS]);
        if (result[STORAGE_KEYS.AI_CONVERSATIONS]) {
            conversationHistory = result[STORAGE_KEYS.AI_CONVERSATIONS];
        }
    } catch (error) {
        console.error('加载对话历史失败:', error);
    }
}

/**
 * 保存对话历史到存储
 * @returns {Promise<void>}
 */
async function saveConversationHistory() {
    try {
        // 只保留最近的100个对话
        const maxConversations = 100;
        if (conversationHistory.length > maxConversations) {
            conversationHistory = conversationHistory
                .sort((a, b) => b.lastUpdated - a.lastUpdated)
                .slice(0, maxConversations);
        }
        
        await chrome.storage.local.set({ 
            [STORAGE_KEYS.AI_CONVERSATIONS]: conversationHistory 
        });
    } catch (error) {
        console.error('保存对话历史失败:', error);
    }
}

/**
 * 创建AI UI元素
 */
function createAIUI() {
    const searchBox = document.getElementById('search-box');
    if (!searchBox || document.getElementById('ai-button')) return;

    // 创建AI按钮
    const aiButton = createAIButton();
    if (!aiButton) return;

    // 将AI按钮添加到搜索框内
    const searchForm = searchBox.querySelector('.search-form-container');
    if (searchForm) {
        searchForm.appendChild(aiButton);
    }

    // 初始设置按钮可见性
    updateAIButtonVisibility();
}

/**
 * 设置AI事件监听
 */
function setupAIEvents() {
    const aiButton = document.getElementById('ai-button');
    if (!aiButton) return;

    setupAIButtonEvents(aiButton);
}

/**
 * 更新AI按钮可见性
 */
function updateAIButtonVisibility() {
    const aiButton = document.getElementById('ai-button');
    if (!aiButton) return;

    if (aiConfig.enabled) {
        aiButton.style.display = 'flex';
    } else {
        aiButton.style.display = 'none';
    }
}

/**
 * 显示AI对话模态框
 * @param {string} initialMessage - 初始消息
 * @param {string} conversationId - 要继续的对话ID
 */
function showAIModal(initialMessage = '', conversationId = null) {
    const modalId = 'ai-modal';
    
    // 删除旧的模态框
    const oldModal = document.getElementById(modalId);
    if (oldModal) {
        oldModal.remove();
    }

    // 使用Menu模块创建模态框
    const modal = Utils.createElement('div', 'modal ai-modal', { id: modalId });
    const modalContent = Utils.createElement('div', 'modal-content ai-modal-content');

    // 创建主布局容器
    const mainLayout = Utils.createElement('div', 'ai-main-layout');
    
    // 左侧边栏 - 历史记录
    const sidebar = Utils.createElement('div', 'ai-sidebar');
    const sidebarHeader = Utils.createElement('div', 'ai-sidebar-header');
    const sidebarTitle = Utils.createElement('h3', 'ai-sidebar-title', {}, I18n.getMessage('conversationHistory', '对话历史'));
    const newChatBtn = Utils.createElement('button', 'ai-new-chat-btn', { 
        type: 'button',
        title: I18n.getMessage('newConversation', '新对话')
    }, '+');
    sidebarHeader.append(sidebarTitle, newChatBtn);
    
    const conversationsList = Utils.createElement('div', 'ai-conversations-list');
    const sidebarFooter = Utils.createElement('div', 'ai-sidebar-footer');
    const clearAllBtn = Utils.createElement('button', 'ai-clear-all-btn btn btn-sm btn-danger', {}, 
        I18n.getMessage('clearAll', '清空全部'));
    sidebarFooter.appendChild(clearAllBtn);
    
    sidebar.append(sidebarHeader, conversationsList, sidebarFooter);

    // 右侧对话区域
    const chatArea = Utils.createElement('div', 'ai-chat-area');
    
    // 对话头部
    const chatHeader = Utils.createElement('div', 'ai-chat-header');
    const chatTitle = Utils.createElement('h2', 'ai-chat-title', {}, I18n.getMessage('aiAssistant', 'AI助手'));
    const closeBtn = Utils.createElement('span', 'modal-close', {}, '&times;');
    chatHeader.append(chatTitle, closeBtn);
    
    // 对话内容区域
    const chatContainer = Utils.createElement('div', 'ai-chat-container');
    const chatHistory = Utils.createElement('div', 'ai-chat-history', { id: 'ai-chat-history' });
    
    // 底部输入区域
    const inputArea = Utils.createElement('div', 'ai-input-area');
    
    // 快速提示词
    const quickPromptsContainer = Utils.createElement('div', 'ai-quick-prompts');
    aiConfig.quickPrompts.forEach(prompt => {
        const promptBtn = Utils.createElement('button', 'ai-quick-prompt-btn', {}, prompt);
        promptBtn.addEventListener('click', () => {
            const inputTextarea = document.getElementById('ai-input');
            const currentValue = inputTextarea.value.trim();
            
            if (currentValue) {
                inputTextarea.value = prompt + ': ' + currentValue;
            } else {
                inputTextarea.value = prompt;
            }
            
            inputTextarea.focus();
            inputTextarea.setSelectionRange(inputTextarea.value.length, inputTextarea.value.length);
        });
        quickPromptsContainer.appendChild(promptBtn);
    });
    
    // 输入框容器
    const inputContainer = Utils.createElement('div', 'ai-input-container');
    const inputTextarea = Utils.createElement('textarea', 'ai-input', {
        id: 'ai-input',
        placeholder: I18n.getMessage('aiInputPlaceholder', '输入您的问题...'),
        rows: 1
    });
    
    const sendButton = Utils.createElement('button', 'ai-send-btn', {
        type: 'button',
        title: I18n.getMessage('send', '发送')
    }, '⬆️');
    
    inputContainer.append(inputTextarea, sendButton);
    inputArea.append(quickPromptsContainer, inputContainer);
    
    // 组装对话区域
    chatContainer.appendChild(chatHistory);
    chatArea.append(chatHeader, chatContainer, inputArea);
    
    // 组装主布局
    mainLayout.append(sidebar, chatArea);
    modalContent.appendChild(mainLayout);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // 当前对话ID
    let currentConversationId = conversationId;
    
    // 如果有初始消息，设置到输入框
    if (initialMessage) {
        inputTextarea.value = initialMessage;
    }
    
    // 加载对话历史列表
    loadConversationsList(conversationsList, chatHistory, chatTitle, () => currentConversationId, (id) => { currentConversationId = id; });
    
    // 如果有指定的对话ID，加载对话历史
    if (conversationId) {
        const conversation = AI.getConversation(conversationId);
        if (conversation) {
            loadConversationMessages(chatHistory, conversation);
            chatTitle.textContent = conversation.title;
        }
    }

    // 使用Menu模块的拖拽和居中功能
    Menu._makeModalDraggable(modal, modalContent);
    Menu._centerModal(modal, modalContent);

    // 显示模态框
    Menu.Modal.show(modalId);
    
    // 聚焦输入框
    setTimeout(() => {
        inputTextarea.focus();
        autoResizeTextarea(inputTextarea);
    }, 100);

    // 设置事件监听
    setupAIModalEvents(modal, inputTextarea, chatHistory, chatTitle, sendButton, newChatBtn, clearAllBtn, conversationsList, () => currentConversationId, (id) => { currentConversationId = id; });
}

/**
 * 加载对话列表到侧边栏
 */
function loadConversationsList(conversationsList, chatHistory, chatTitle, getCurrentConversationId, setCurrentConversationId) {
    conversationsList.innerHTML = '';
    
    const conversations = AI.getConversationHistory();
    
    if (conversations.length === 0) {
        const emptyMsg = Utils.createElement('div', 'ai-empty-conversations', {}, 
            I18n.getMessage('noConversationHistory', '暂无对话历史'));
        conversationsList.appendChild(emptyMsg);
        return;
    }
    
    conversations.forEach(conv => {
        const convItem = Utils.createElement('div', 'ai-conversation-item');
        if (conv.id === getCurrentConversationId()) {
            convItem.classList.add('active');
        }
        
        const convTitle = Utils.createElement('div', 'ai-conversation-title', {}, conv.title);
        const convMeta = Utils.createElement('div', 'ai-conversation-meta');
        const lastUpdated = new Date(conv.lastUpdated).toLocaleDateString();
        convMeta.textContent = `${lastUpdated} · ${Math.max(0, Math.floor(conv.messageCount/2))}条`;
        
        const deleteBtn = Utils.createElement('button', 'ai-conversation-delete', { 
            title: I18n.getMessage('delete', '删除')
        }, '🗑️');
        
        convItem.append(convTitle, convMeta, deleteBtn);
        
        // 点击切换对话
        convItem.addEventListener('click', (e) => {
            if (e.target === deleteBtn) return;
            
            // 移除其他active状态
            conversationsList.querySelectorAll('.ai-conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            convItem.classList.add('active');
            
            // 加载对话内容
            const fullConversation = AI.getConversation(conv.id);
            if (fullConversation) {
                loadConversationMessages(chatHistory, fullConversation);
                chatTitle.textContent = fullConversation.title;
                setCurrentConversationId(conv.id);
            }
        });
        
        // 删除对话
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            if (confirm(I18n.getMessage('confirmDeleteConversation', '确定要删除这个对话吗？'))) {
                const success = await AI.deleteConversation(conv.id);
                if (success) {
                    // 如果删除的是当前对话，清空聊天区域
                    if (conv.id === getCurrentConversationId()) {
                        chatHistory.innerHTML = '';
                        chatTitle.textContent = I18n.getMessage('aiAssistant', 'AI助手');
                        setCurrentConversationId(null);
                    }
                    
                    // 重新加载对话列表
                    loadConversationsList(conversationsList, chatHistory, chatTitle, getCurrentConversationId, setCurrentConversationId);
                    
                    Notification.notify({
                        title: I18n.getMessage('success', '成功'),
                        message: I18n.getMessage('conversationDeleted', '对话已删除'),
                        type: 'success',
                        duration: 2000
                    });
                }
            }
        });
        
        conversationsList.appendChild(convItem);
    });
}

/**
 * 加载对话消息到聊天区域
 */
function loadConversationMessages(chatHistory, conversation) {
    chatHistory.innerHTML = '';
    
    conversation.messages.forEach(msg => {
        addMessageToHistory(chatHistory, msg.content, msg.role === 'user' ? 'user' : 'ai');
    });
}

/**
 * 自动调整文本框高度
 */
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

/**
 * 设置AI模态框事件
 */
function setupAIModalEvents(modal, inputTextarea, chatHistory, chatTitle, sendButton, newChatBtn, clearAllBtn, conversationsList, getCurrentConversationId, setCurrentConversationId) {
    // 关闭按钮
    modal.querySelector('.modal-close').addEventListener('click', () => {
        Menu.Modal.hide(modal.id);
    });

    // 点击外部关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            Menu.Modal.hide(modal.id);
        }
    });

    // 新对话按钮
    newChatBtn.addEventListener('click', () => {
        // 清空聊天历史显示
        chatHistory.innerHTML = '';
        // 重置对话ID
        setCurrentConversationId(null);
        // 更新标题
        chatTitle.textContent = I18n.getMessage('aiAssistant', 'AI助手');
        // 移除active状态
        conversationsList.querySelectorAll('.ai-conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        // 聚焦输入框
        inputTextarea.focus();
    });

    // 清空全部按钮
    clearAllBtn.addEventListener('click', async () => {
        if (confirm(I18n.getMessage('confirmClearAllConversations', '确定要清空所有对话历史吗？此操作不可撤销。'))) {
            const success = await AI.clearAllConversations();
            if (success) {
                // 清空聊天区域
                chatHistory.innerHTML = '';
                chatTitle.textContent = I18n.getMessage('aiAssistant', 'AI助手');
                setCurrentConversationId(null);
                
                // 重新加载对话列表
                loadConversationsList(conversationsList, chatHistory, chatTitle, getCurrentConversationId, setCurrentConversationId);
                
                Notification.notify({
                    title: I18n.getMessage('success', '成功'),
                    message: I18n.getMessage('conversationHistoryCleared', '对话历史已清空'),
                    type: 'success',
                    duration: 3000
                });
            }
        }
    });

    // 输入框自动调整高度
    inputTextarea.addEventListener('input', () => {
        autoResizeTextarea(inputTextarea);
    });

    // 发送消息函数
    const sendMessage = async () => {
        const message = inputTextarea.value.trim();
        if (!message) return;

        // 添加用户消息到聊天历史显示
        addMessageToHistory(chatHistory, message, 'user');
        
        // 清空输入框并重置高度
        inputTextarea.value = '';
        autoResizeTextarea(inputTextarea);
        
        // 禁用发送按钮并显示加载状态
        sendButton.disabled = true;
        sendButton.innerHTML = '⏳';

        try {
            if (!AI.isEnabled()) {
                throw new Error('AI功能未启用，请在设置中启用AI功能');
            }
            
            // 发送到AI
            const result = await AI.sendMessage(message, getCurrentConversationId());
            
            // 更新当前对话ID
            setCurrentConversationId(result.conversationId);
            
            // 添加AI回复到聊天历史显示
            addMessageToHistory(chatHistory, result.reply, 'ai');
            
            // 更新标题
            if (result.conversation && result.conversation.title !== I18n.getMessage('newConversation', '新对话')) {
                chatTitle.textContent = result.conversation.title;
            }
            
            // 重新加载对话列表以更新侧边栏
            loadConversationsList(conversationsList, chatHistory, chatTitle, getCurrentConversationId, setCurrentConversationId);
            
        } catch (error) {
            console.error('发送消息失败:', error);
            
            // 添加错误消息到聊天历史
            addMessageToHistory(chatHistory, error.message || 'Unknown error occurred', 'error');
            
            Notification.notify({
                title: '发送失败',
                message: error.message,
                type: 'error',
                duration: 5000
            });
            
        } finally {
            // 恢复发送按钮
            sendButton.disabled = false;
            sendButton.innerHTML = '⬆️';
            inputTextarea.focus();
        }
    };

    // 发送按钮点击
    sendButton.addEventListener('click', sendMessage);

    // 输入框回车发送
    inputTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

/**
 * 添加消息到聊天历史（支持Markdown渲染）
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型（user、ai、error）
 */
function addMessageToHistory(chatHistory, message, type) {
    const messageElement = Utils.createElement('div', `ai-message ai-message-${type}`);
    
    // 消息内容容器
    const messageContent = Utils.createElement('div', 'ai-message-content');
    
    if (type === 'ai') {
        // AI消息支持Markdown渲染
        messageContent.innerHTML = renderMarkdown(message);
    } else {
        // 用户消息和错误消息直接显示文本
        messageContent.textContent = message;
    }
    
    messageElement.appendChild(messageContent);
    chatHistory.appendChild(messageElement);
    
    // 滚动到底部
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * 简单的Markdown渲染器 - 使用marked库
 * @param {string} text - 要渲染的文本
 * @returns {string} 渲染后的HTML
 */
function renderMarkdown(text) {
    // 检查marked库是否可用
    if (typeof marked === 'undefined') {
        console.warn('marked库未加载，使用简单渲染器');
        return renderSimpleMarkdown(text);
    }

    try {
        // 配置marked选项 - 使用新版本的API
        const renderer = new marked.Renderer();
        
        // 自定义代码块渲染
        renderer.code = function(code, language) {
            const validLanguage = language && typeof hljs !== 'undefined' && hljs.getLanguage(language);
            
            if (validLanguage) {
                try {
                    const highlighted = hljs.highlight(code, {language: language}).value;
                    return `<pre class="ai-code-block"><code class="language-${language}">${highlighted}</code></pre>`;
                } catch (err) {
                    console.warn('代码高亮失败:', err);
                }
            }
            
            return `<pre class="ai-code-block"><code>${code}</code></pre>`;
        };

        // 自定义行内代码渲染
        renderer.codespan = function(code) {
            return `<code class="ai-inline-code">${code}</code>`;
        };

        // 配置marked选项
        marked.setOptions({
            renderer: renderer,
            gfm: true,           // 启用GitHub风格Markdown
            tables: true,        // 启用表格支持
            breaks: true,        // 将换行符转换为<br>
            pedantic: false,     // 不使用原始markdown.pl的怪异部分
            sanitize: false,     // 不清理HTML（我们信任AI的输出）
            smartLists: true,    // 使用比原始markdown更智能的列表行为
            smartypants: false   // 不使用智能标点
        });

        // 使用marked渲染
        return marked.parse(text);
    } catch (error) {
        console.error('marked渲染失败，使用简单渲染器:', error);
        return renderSimpleMarkdown(text);
    }
}

/**
 * 简单的Markdown渲染器（备用方案）
 * @param {string} text - 要渲染的文本
 * @returns {string} 渲染后的HTML
 */
function renderSimpleMarkdown(text) {
    // 转义HTML特殊字符
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // 代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || '';
        return `<pre class="ai-code-block"><code class="language-${language}">${code.trim()}</code></pre>`;
    });
    
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    
    // 粗体
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // 斜体
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    
    // 换行
    html = html.replace(/\n/g, '<br>');
    
    // 列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    
    return html;
}

// 将AI模块挂载到全局，便于其他模块调用
if (typeof window !== 'undefined') {
    window.AI = AI;
}

/**
 * 监听搜索表单变化，确保AI按钮始终有效
 */
function observeSearchForm() {
    // 使用MutationObserver监听DOM变化
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // 检查是否有节点被添加或移除
            if (mutation.type === 'childList') {
                // 检查搜索表单是否被替换
                const searchForm = document.getElementById('search-form');
                if (searchForm && !searchForm.querySelector('#ai-button') && aiConfig.enabled) {
                    // 如果表单存在但AI按钮不存在，且AI启用，则重新添加
                    const aiButton = createAIButton();
                    if (aiButton) {
                        searchForm.appendChild(aiButton);
                        setupAIButtonEvents(aiButton);
                    }
                }
            }
        });
    });

    // 开始观察整个文档的变化
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * 创建AI按钮元素
 * @returns {HTMLElement|null} AI按钮元素
 */
function createAIButton() {
    if (document.getElementById('ai-button')) return null;

    const aiButton = Utils.createElement('button', 'ai-button', {
        id: 'ai-button',
        type: 'button',
        title: I18n.getMessage('aiAssistant', 'AI助手'),
        'data-i18n-title': 'aiAssistant'
    });

    // AI图标SVG
    aiButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1H5C3.89 1 3 1.89 3 3V21C3 22.1 3.89 23 5 23H19C20.1 23 21 22.1 21 21V9M19 21H5V3H14V9H19Z"/>
            <circle cx="12" cy="15" r="3"/>
            <path d="M8 15L9.5 13.5L12 16L14.5 13.5L16 15"/>
        </svg>
    `;

    return aiButton;
}

/**
 * 为AI按钮设置事件监听
 * @param {HTMLElement} aiButton - AI按钮元素
 */
function setupAIButtonEvents(aiButton) {
    if (!aiButton) return;

    aiButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!aiConfig.enabled) {
            Notification.notify({
                title: I18n.getMessage('aiNotEnabled', 'AI功能未启用'),
                message: I18n.getMessage('enableAIInSettings', '请在设置中启用AI功能'),
                type: 'warning',
                duration: 3000
            });
            return;
        }

        // 获取搜索框内容
        const searchInput = document.getElementById('search-input');
        const searchText = searchInput ? searchInput.value.trim() : '';
        
        // 显示AI对话框
        AI.showAIDialog(searchText);
    });
}

/**
 * 显示AI配置模态框
 */
function showAIConfigModal() {
    // 当前表单状态
    const currentFormState = {
        enabled: aiConfig.enabled,
        url: aiConfig.currentProvider?.apiUrl || 'https://api.openai.com/v1/chat/completions',
        key: aiConfig.currentProvider?.apiKey || '',
        model: aiConfig.currentProvider?.model || 'gpt-3.5-turbo',
        models: [],
        fetching: false,
        error: null
    };

    // 表单项配置
    const formItems = [
        {
            id: 'ai-enabled',
            label: I18n.getMessage('enableAI', '启用AI功能'),
            type: 'checkbox',
            value: currentFormState.enabled
        },
        {
            id: 'api-url',
            label: I18n.getMessage('apiUrl', 'API地址'),
            type: 'url',
            placeholder: 'https://api.openai.com/v1/chat/completions',
            value: currentFormState.url,
            required: true,
            onchange: function(e) {
                // 当API地址输入后，如果密钥也有值，自动尝试获取模型列表
                const apiUrl = e.target.value.trim();
                const apiKey = document.getElementById('api-key').value.trim();
                if (apiUrl && apiKey) {
                    // 触发自动获取模型列表，但需要短暂延迟以避免频繁请求
                    setTimeout(() => {
                        document.querySelector('.fetch-models-btn')?.click();
                    }, 500);
                }
            }
        },
        {
            id: 'api-key',
            label: I18n.getMessage('apiKey', 'API密钥'),
            type: 'password',
            placeholder: 'sk-...',
            value: currentFormState.key,
            required: true,
            onchange: (e) => {
                // 当API密钥输入后，如果URL也有值，自动尝试获取模型列表
                const apiUrl = document.getElementById('api-url').value.trim();
                const apiKey = e.target.value.trim();
                if (apiUrl && apiKey) {
                    // 触发自动获取模型列表，但需要短暂延迟以避免频繁请求
                    setTimeout(() => {
                        document.querySelector('.fetch-models-btn')?.click();
                    }, 500);
                }
            }
        },
        {
            id: 'fetch-models-btn',
            type: 'custom',
            render: (container) => {
                const btnContainer = Utils.createElement('div', 'fetch-models-container');
                
                // 创建获取模型按钮
                const fetchBtn = Utils.createElement('button', 'fetch-models-btn btn btn-secondary', {
                    type: 'button'
                }, I18n.getMessage('fetchModels', '获取可用模型'));
                
                // 状态显示
                const statusContainer = Utils.createElement('div', 'fetch-models-status');
                
                btnContainer.appendChild(fetchBtn);
                btnContainer.appendChild(statusContainer);
                container.appendChild(btnContainer);
                
                // 绑定获取模型事件
                fetchBtn.addEventListener('click', async () => {
                    const urlInput = document.getElementById('api-url');
                    const keyInput = document.getElementById('api-key');
                    const modelSelect = document.getElementById('model');
                    
                    const apiUrl = urlInput.value.trim();
                    const apiKey = keyInput.value.trim();
                    
                    if (!apiUrl || !apiKey) {
                        statusContainer.textContent = I18n.getMessage('pleaseProvideApiInfo', '请先填写API地址和密钥');
                        statusContainer.className = 'fetch-models-status error';
                        return;
                    }
                    
                    // 更新状态
                    statusContainer.textContent = I18n.getMessage('fetchingModels', '正在获取模型列表...');
                    statusContainer.className = 'fetch-models-status loading';
                    fetchBtn.disabled = true;
                    currentFormState.fetching = true;
                    currentFormState.error = null;
                    
                    try {
                        // 调用获取模型API
                        const models = await AI.getModels(apiUrl, apiKey);
                        
                        // 更新状态
                        currentFormState.models = models;
                        currentFormState.fetching = false;
                        
                        // 更新下拉框
                        modelSelect.innerHTML = '';
                        models.forEach(model => {
                            const option = document.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            modelSelect.appendChild(option);
                        });
                        
                        // 如果有当前模型，选中它
                        if (currentFormState.model && models.includes(currentFormState.model)) {
                            modelSelect.value = currentFormState.model;
                        } else if (models.length > 0) {
                            // 选择第一个可用模型
                            modelSelect.value = models[0];
                            currentFormState.model = models[0];
                        }
                        
                        // 启用选择框
                        modelSelect.disabled = false;
                        
                        // 更新状态提示
                        statusContainer.textContent = I18n.getMessage('modelsLoaded', '已加载 ' + models.length + ' 个模型');
                        statusContainer.className = 'fetch-models-status success';
                    } catch (error) {
                        // 处理错误
                        currentFormState.error = error.message;
                        currentFormState.fetching = false;
                        
                        // 更新状态提示并添加重试按钮
                        statusContainer.innerHTML = '';
                        
                        // 错误信息
                        const errorText = Utils.createElement('span', '', {}, error.message);
                        statusContainer.appendChild(errorText);
                        
                        // 添加重试按钮
                        const retryBtn = Utils.createElement('button', 'fetch-models-retry-btn', {}, I18n.getMessage('retry', '重试'));
                        retryBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // 重新触发获取模型
                            fetchBtn.click();
                        });
                        statusContainer.appendChild(retryBtn);
                        
                        statusContainer.className = 'fetch-models-status error';
                        
                        console.error('获取模型失败:', error);
                    } finally {
                        // 恢复按钮状态
                        fetchBtn.disabled = false;
                    }
                });
            }
        },
        {
            id: 'model',
            label: I18n.getMessage('model', '模型'),
            type: 'select',
            options: [{ value: currentFormState.model, label: currentFormState.model }],
            value: currentFormState.model,
            disabled: true, // 初始禁用，直到获取模型列表
            description: I18n.getMessage('modelSelectDescription', '点击上方的"获取可用模型"按钮加载可选项'),
            required: true
        },
        {
            id: 'system-prompt',
            label: I18n.getMessage('systemPrompt', '系统提示'),
            type: 'textarea',
            placeholder: I18n.getMessage('systemPromptPlaceholder', '设置AI的行为和角色...'),
            value: aiConfig.systemPrompt
        }
    ];

    return Menu.showFormModal(
        I18n.getMessage('aiSettings', 'AI设置'),
        formItems,
        (formData) => {
            // 更新AI配置
            const newConfig = {
                enabled: formData['ai-enabled'],
                systemPrompt: formData['system-prompt'] || aiConfig.systemPrompt,
                currentProvider: {
                    name: 'Custom',
                    apiUrl: formData['api-url'],
                    apiKey: formData['api-key'],
                    model: formData['model']
                }
            };

            AI.updateConfig(newConfig).then(success => {
                if (success) {
                    Notification.notify({
                        title: I18n.getMessage('success', '成功'),
                        message: I18n.getMessage('aiConfigSaved', 'AI配置已保存'),
                        type: 'success',
                        duration: 3000
                    });
                } else {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('aiConfigSaveFailed', 'AI配置保存失败'),
                        type: 'error',
                        duration: 3000
                    });
                }
            });
        },
        I18n.getMessage('save', '保存'),
        I18n.getMessage('cancel', '取消')
    );
}

// 导出配置模态框函数供其他模块使用
AI.showConfigModal = showAIConfigModal;

