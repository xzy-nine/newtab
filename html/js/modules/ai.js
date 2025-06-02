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

// 对话历史记录
let conversationHistory = [];
let currentConversationId = null;

// 存储键名常量
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

    // 模态框头部
    const modalHeader = Utils.createElement('div', 'ai-modal-header');
    const headerTitle = Utils.createElement('h2', 'modal-title', {}, I18n.getMessage('aiAssistant', 'AI助手'));
    
    // 历史按钮
    const historyBtn = Utils.createElement('button', 'ai-history-btn', { 
        type: 'button',
        title: I18n.getMessage('conversationHistory', '对话历史')
    }, '📋');
    
    const closeBtn = Utils.createElement('span', 'modal-close', {}, '&times;');
    modalHeader.append(headerTitle, historyBtn, closeBtn);

    // 主要内容区域
    const mainContent = Utils.createElement('div', 'ai-main-content');
    
    // 对话区域
    const chatContainer = Utils.createElement('div', 'ai-chat-container');
    const chatHistory = Utils.createElement('div', 'ai-chat-history', { id: 'ai-chat-history' });
    
    // 当前对话ID
    let currentConversationId = conversationId;
    
    // 如果有指定的对话ID，加载对话历史
    if (conversationId) {
        const conversation = AI.getConversation(conversationId);
        if (conversation) {
            conversation.messages.forEach(msg => {
                addMessageToHistory(chatHistory, msg.content, msg.role === 'user' ? 'user' : 'ai');
            });
            headerTitle.textContent = conversation.title + ' - ' + I18n.getMessage('aiAssistant', 'AI助手');
        }
    }
    
    // 输入区域
    const inputContainer = Utils.createElement('div', 'ai-input-container');
    const inputTextarea = Utils.createElement('textarea', 'ai-input', {
        id: 'ai-input',
        placeholder: I18n.getMessage('aiInputPlaceholder', '输入您的问题...'),
        rows: 3
    });
    
    // 如果有初始消息，设置到输入框
    if (initialMessage) {
        inputTextarea.value = initialMessage;
    }

    // 快速提示词按钮
    const quickPromptsContainer = Utils.createElement('div', 'ai-quick-prompts');
    aiConfig.quickPrompts.forEach(prompt => {
        const promptBtn = Utils.createElement('button', 'ai-quick-prompt-btn', {}, prompt);
        promptBtn.addEventListener('click', () => {
            // 获取当前输入框内容
            const currentValue = inputTextarea.value.trim();
            
            // 如果有现有内容，在快速提示词后添加冒号和现有内容
            if (currentValue) {
                inputTextarea.value = prompt + ':' + currentValue;
            } else {
                // 如果没有现有内容，只设置快速提示词
                inputTextarea.value = prompt;
            }
            
            inputTextarea.focus();
            // 将光标移到末尾
            inputTextarea.setSelectionRange(inputTextarea.value.length, inputTextarea.value.length);
        });
        quickPromptsContainer.appendChild(promptBtn);
    });

    // 按钮容器
    const buttonsContainer = Utils.createElement('div', 'ai-buttons-container');
    
    // 新对话按钮
    const newConversationBtn = Utils.createElement('button', 'ai-new-conversation-btn btn btn-secondary', {}, 
        I18n.getMessage('newConversation', '新对话'));
    
    // 发送按钮
    const sendButton = Utils.createElement('button', 'ai-send-btn btn btn-primary', {}, 
        I18n.getMessage('send', '发送'));

    buttonsContainer.append(newConversationBtn, sendButton);

    // 组装UI
    inputContainer.append(inputTextarea, quickPromptsContainer, buttonsContainer);
    chatContainer.append(chatHistory, inputContainer);
    mainContent.appendChild(chatContainer);
    modalContent.append(modalHeader, mainContent);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // 使用Menu模块的拖拽和居中功能
    Menu._makeModalDraggable(modal, modalContent);
    Menu._centerModal(modal, modalContent);

    // 显示模态框
    Menu.Modal.show(modalId);
    
    // 聚焦输入框
    setTimeout(() => {
        inputTextarea.focus();
    }, 100);

    // 设置事件监听
    setupAIModalEvents(modal, inputTextarea, chatHistory, sendButton, newConversationBtn, historyBtn, () => currentConversationId, (id) => { currentConversationId = id; });
}

/**
 * 设置AI模态框事件
 * @param {HTMLElement} modal - 模态框元素
 * @param {HTMLElement} inputTextarea - 输入框
 * @param {HTMLElement} chatHistory - 聊天历史
 * @param {HTMLElement} sendButton - 发送按钮
 * @param {HTMLElement} newConversationBtn - 新对话按钮
 * @param {HTMLElement} historyBtn - 历史按钮
 * @param {Function} getCurrentConversationId - 获取当前对话ID
 * @param {Function} setCurrentConversationId - 设置当前对话ID
 */
function setupAIModalEvents(modal, inputTextarea, chatHistory, sendButton, newConversationBtn, historyBtn, getCurrentConversationId, setCurrentConversationId) {
    // 使用Menu模块的关闭事件处理
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
    newConversationBtn.addEventListener('click', () => {
        // 清空聊天历史显示
        chatHistory.innerHTML = '';
        // 重置对话ID
        setCurrentConversationId(null);
        // 更新标题
        modal.querySelector('.modal-title').textContent = I18n.getMessage('aiAssistant', 'AI助手');
        // 聚焦输入框
        inputTextarea.focus();
    });

    // 历史按钮
    historyBtn.addEventListener('click', () => {
        showConversationHistoryPanel(modal, chatHistory, setCurrentConversationId);
    });

    // 发送消息函数
    const sendMessage = async () => {
        const message = inputTextarea.value.trim();
        if (!message) {
            console.log('消息为空，不发送');
            return;
        }

        console.log('准备发送消息:', message);

        // 添加用户消息到聊天历史显示
        addMessageToHistory(chatHistory, message, 'user');
        
        // 清空输入框
        inputTextarea.value = '';
        
        // 禁用发送按钮并显示加载状态
        sendButton.disabled = true;
        sendButton.textContent = I18n.getMessage('sending', '发送中...');

        try {
            // 检查AI配置
            if (!AI.isEnabled()) {
                throw new Error('AI功能未启用，请在设置中启用AI功能');
            }

            console.log('开始发送AI请求...');
            
            // 发送到AI（传递当前对话ID）
            const result = await AI.sendMessage(message, getCurrentConversationId());
            
            console.log('AI响应成功:', result);
            
            // 更新当前对话ID
            setCurrentConversationId(result.conversationId);
            
            // 添加AI回复到聊天历史显示
            addMessageToHistory(chatHistory, result.reply, 'ai');
            
            // 更新标题（如果是新对话）
            if (result.conversation && result.conversation.title !== I18n.getMessage('newConversation', '新对话')) {
                modal.querySelector('.modal-title').textContent = result.conversation.title + ' - ' + I18n.getMessage('aiAssistant', 'AI助手');
            }
            
        } catch (error) {
            console.error('发送消息失败:', error);
            
            // 添加错误消息到聊天历史
            const errorMessage = error.message || 'Unknown error occurred';
            addMessageToHistory(chatHistory, errorMessage, 'error');
            
            // 显示详细错误信息
            Notification.notify({
                title: '发送失败',
                message: errorMessage,
                type: 'error',
                duration: 5000
            });
            
        } finally {
            // 恢复发送按钮
            sendButton.disabled = false;
            sendButton.textContent = I18n.getMessage('send', '发送');
            inputTextarea.focus();
        }
    };

    // 发送按钮点击
    sendButton.addEventListener('click', sendMessage);

    // 输入框回车发送（Ctrl+Enter或Shift+Enter换行）
    inputTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

/**
 * 显示对话历史面板
 * @param {HTMLElement} modal - 主模态框
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {Function} setCurrentConversationId - 设置当前对话ID的函数
 */
function showConversationHistoryPanel(modal, chatHistory, setCurrentConversationId) {
    const historyPanelId = 'ai-history-panel';
    
    // 删除旧的历史面板
    const oldPanel = document.getElementById(historyPanelId);
    if (oldPanel) {
        oldPanel.remove();
    }

    // 创建历史面板
    const historyPanel = Utils.createElement('div', 'modal ai-history-panel', { id: historyPanelId });
    const panelContent = Utils.createElement('div', 'modal-content ai-history-panel-content');

    // 面板头部
    const panelHeader = Utils.createElement('div', 'ai-history-panel-header');
    const panelTitle = Utils.createElement('h3', '', {}, I18n.getMessage('conversationHistory', '对话历史'));
    const clearAllBtn = Utils.createElement('button', 'ai-clear-all-btn btn btn-danger', {}, 
        I18n.getMessage('clearAll', '清空全部'));
    const closePanelBtn = Utils.createElement('span', 'modal-close', {}, '&times;');
    panelHeader.append(panelTitle, clearAllBtn, closePanelBtn);

    // 对话列表
    const conversationList = Utils.createElement('div', 'ai-conversation-list');
    
    // 加载对话历史
    const conversations = AI.getConversationHistory();
    if (conversations.length === 0) {
        const emptyMsg = Utils.createElement('div', 'ai-empty-history', {}, 
            I18n.getMessage('noConversationHistory', '暂无对话历史'));
        conversationList.appendChild(emptyMsg);
    } else {
        conversations.forEach(conv => {
            const convItem = createConversationItem(conv, chatHistory, setCurrentConversationId, () => {
                // 关闭历史面板
                Menu.Modal.hide(historyPanelId);
                // 更新主模态框标题
                modal.querySelector('.modal-title').textContent = conv.title + ' - ' + I18n.getMessage('aiAssistant', 'AI助手');
            });
            conversationList.appendChild(convItem);
        });
    }

    // 组装面板
    panelContent.append(panelHeader, conversationList);
    historyPanel.appendChild(panelContent);
    document.body.appendChild(historyPanel);

    // 使用Menu模块的功能
    Menu._makeModalDraggable(historyPanel, panelContent);
    Menu._centerModal(historyPanel, panelContent);

    // 显示面板
    Menu.Modal.show(historyPanelId);

    // 设置事件监听
    closePanelBtn.addEventListener('click', () => {
        Menu.Modal.hide(historyPanelId);
    });

    historyPanel.addEventListener('click', (e) => {
        if (e.target === historyPanel) {
            Menu.Modal.hide(historyPanelId);
        }
    });

    // 清空全部按钮
    clearAllBtn.addEventListener('click', async () => {
        if (confirm(I18n.getMessage('confirmClearAllConversations', '确定要清空所有对话历史吗？此操作不可撤销。'))) {
            const success = await AI.clearAllConversations();
            if (success) {
                // 刷新历史面板
                conversationList.innerHTML = '';
                const emptyMsg = Utils.createElement('div', 'ai-empty-history', {}, 
                    I18n.getMessage('noConversationHistory', '暂无对话历史'));
                conversationList.appendChild(emptyMsg);
                
                Notification.notify({
                    title: I18n.getMessage('success', '成功'),
                    message: I18n.getMessage('conversationHistoryCleared', '对话历史已清空'),
                    type: 'success',
                    duration: 3000
                });
            }
        }
    });
}

/**
 * 创建对话项元素
 * @param {Object} conversation - 对话对象
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {Function} setCurrentConversationId - 设置当前对话ID的函数
 * @param {Function} onSelect - 选择对话时的回调
 * @returns {HTMLElement} 对话项元素
 */
function createConversationItem(conversation, chatHistory, setCurrentConversationId, onSelect) {
    const convItem = Utils.createElement('div', 'ai-conversation-item');
    
    // 对话信息
    const convInfo = Utils.createElement('div', 'ai-conversation-info');
    const convTitle = Utils.createElement('div', 'ai-conversation-title', {}, conversation.title);
    const convMeta = Utils.createElement('div', 'ai-conversation-meta');
    
    const lastUpdated = new Date(conversation.lastUpdated).toLocaleString();
    const messageCount = conversation.messageCount;
    convMeta.textContent = `${lastUpdated} · ${messageCount} ${I18n.getMessage('messages', '条消息')}`;
    
    convInfo.append(convTitle, convMeta);
    
    // 操作按钮
    const convActions = Utils.createElement('div', 'ai-conversation-actions');
    const continueBtn = Utils.createElement('button', 'ai-continue-btn btn btn-sm btn-primary', {}, 
        I18n.getMessage('continue', '继续'));
    const deleteBtn = Utils.createElement('button', 'ai-delete-btn btn btn-sm btn-danger', {}, 
        I18n.getMessage('delete', '删除'));
    
    convActions.append(continueBtn, deleteBtn);
    convItem.append(convInfo, convActions);
    
    // 继续对话按钮
    continueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // 加载对话历史到聊天界面
        const fullConversation = AI.getConversation(conversation.id);
        if (fullConversation) {
            // 清空当前聊天历史显示
            chatHistory.innerHTML = '';
            
            // 重新显示对话历史
            fullConversation.messages.forEach(msg => {
                addMessageToHistory(chatHistory, msg.content, msg.role === 'user' ? 'user' : 'ai');
            });
            
            // 设置当前对话ID
            setCurrentConversationId(conversation.id);
            
            // 执行选择回调
            onSelect();
        }
    });
    
    // 删除对话按钮
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        if (confirm(I18n.getMessage('confirmDeleteConversation', '确定要删除这个对话吗？'))) {
            const success = await AI.deleteConversation(conversation.id);
            if (success) {
                convItem.remove();
                
                Notification.notify({
                    title: I18n.getMessage('success', '成功'),
                    message: I18n.getMessage('conversationDeleted', '对话已删除'),
                    type: 'success',
                    duration: 2000
                });
            }
        }
    });
    
    return convItem;
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

/**
 * 添加消息到聊天历史
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型（user、ai、error）
 */
function addMessageToHistory(chatHistory, message, type) {
    const messageElement = Utils.createElement('div', `ai-message ai-message-${type}`);
    
    // 消息头部
    const messageHeader = Utils.createElement('div', 'ai-message-header');
    const headerText = type === 'user' ? '您' : type === 'ai' ? 'AI助手' : '错误';
    messageHeader.textContent = headerText;
    
    // 消息内容
    const messageContent = Utils.createElement('div', 'ai-message-content');
    messageContent.textContent = message;
    
    messageElement.append(messageHeader, messageContent);
    chatHistory.appendChild(messageElement);
    
    // 滚动到底部
    chatHistory.scrollTop = chatHistory.scrollHeight;
}