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
    apiUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    quickPrompts: [
        '帮我总结这段内容',
        '翻译成中文',
        '优化这段文字',
        '写一个关于这个主题的大纲'
    ],
    systemPrompt: '你是一个智能助手，请用简洁友好的语言回答用户的问题。'
};

// 存储键名常量
const STORAGE_KEYS = {
    AI_CONFIG: 'aiConfig'
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
        // 从存储加载AI配置
        await loadAIConfig();
        
        // 创建AI UI元素
        createAIUI();
        
        // 设置事件监听
        setupAIEvents();
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
     * 发送消息到AI
     * @param {string} message - 用户消息
     * @param {string} context - 上下文（可选）
     * @returns {Promise<string>} - AI回复
     */
    async sendMessage(message, context = '') {
        if (!aiConfig.enabled) {
            throw new Error(I18n.getMessage('aiNotEnabled', 'AI功能未启用'));
        }

        if (!aiConfig.apiUrl || !aiConfig.apiKey) {
            throw new Error(I18n.getMessage('aiConfigIncomplete', 'AI配置不完整'));
        }

        try {
            const fullMessage = context ? `${context}\n\n${message}` : message;
            
            const response = await fetch(aiConfig.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${aiConfig.apiKey}`
                },
                body: JSON.stringify({
                    model: aiConfig.model,
                    messages: [
                        {
                            role: 'system',
                            content: aiConfig.systemPrompt
                        },
                        {
                            role: 'user',
                            content: fullMessage
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || I18n.getMessage('aiNoResponse', '暂无回复');
            
        } catch (error) {
            console.error('AI请求失败:', error);
            throw new Error(I18n.getMessage('aiRequestFailed', 'AI请求失败: ') + error.message);
        }
    },

    /**
     * 显示AI对话框
     * @param {string} initialMessage - 初始消息（可选）
     */
    showAIDialog(initialMessage = '') {
        showAIModal(initialMessage);
    },

    /**
     * 检查AI是否启用
     * @returns {boolean} - 是否启用
     */
    isEnabled() {
        return aiConfig.enabled;
    }
};

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
 * 创建AI UI元素
 */
function createAIUI() {
    const searchBox = document.getElementById('search-box');
    if (!searchBox || document.getElementById('ai-button')) return;

    // 创建AI按钮
    const aiButton = Utils.createElement('button', 'ai-button', {
        id: 'ai-button',
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
    const searchInput = document.getElementById('search-input');
    
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
        const searchText = searchInput ? searchInput.value.trim() : '';
        
        // 显示AI对话框
        AI.showAIDialog(searchText);
    });
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
 */
function showAIModal(initialMessage = '') {
    const modalId = 'ai-modal';
    
    // 删除旧的模态框
    const oldModal = document.getElementById(modalId);
    if (oldModal) {
        oldModal.remove();
    }

    // 创建模态框
    const modal = Utils.createElement('div', 'modal ai-modal', { id: modalId });
    const modalContent = Utils.createElement('div', 'modal-content ai-modal-content');

    // 模态框头部
    const modalHeader = Utils.createElement('div', 'modal-header');
    const closeBtn = Utils.createElement('span', 'modal-close', {}, '&times;');
    const title = Utils.createElement('h2', '', {}, I18n.getMessage('aiAssistant', 'AI助手'));
    modalHeader.append(title, closeBtn);

    // 对话区域
    const chatContainer = Utils.createElement('div', 'ai-chat-container');
    const chatHistory = Utils.createElement('div', 'ai-chat-history', { id: 'ai-chat-history' });
    
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
            inputTextarea.value = prompt;
            inputTextarea.focus();
        });
        quickPromptsContainer.appendChild(promptBtn);
    });

    // 发送按钮
    const sendButton = Utils.createElement('button', 'ai-send-btn btn btn-primary', {}, 
        I18n.getMessage('send', '发送'));

    // 组装UI
    inputContainer.append(inputTextarea, quickPromptsContainer, sendButton);
    chatContainer.append(chatHistory, inputContainer);
    modalContent.append(modalHeader, chatContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // 显示模态框
    modal.style.display = 'block';
    
    // 聚焦输入框
    setTimeout(() => {
        inputTextarea.focus();
    }, 100);

    // 设置事件监听
    setupAIModalEvents(modal, inputTextarea, chatHistory, sendButton);
}

/**
 * 设置AI模态框事件
 * @param {HTMLElement} modal - 模态框元素
 * @param {HTMLElement} inputTextarea - 输入框
 * @param {HTMLElement} chatHistory - 聊天历史
 * @param {HTMLElement} sendButton - 发送按钮
 */
function setupAIModalEvents(modal, inputTextarea, chatHistory, sendButton) {
    // 关闭按钮
    modal.querySelector('.modal-close').addEventListener('click', () => {
        modal.style.display = 'none';
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 300);
    });

    // 点击外部关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.querySelector('.modal-close').click();
        }
    });

    // 发送消息函数
    const sendMessage = async () => {
        const message = inputTextarea.value.trim();
        if (!message) return;

        // 添加用户消息到聊天历史
        addMessageToHistory(chatHistory, message, 'user');
        
        // 清空输入框
        inputTextarea.value = '';
        
        // 禁用发送按钮
        sendButton.disabled = true;
        sendButton.textContent = I18n.getMessage('sending', '发送中...');

        try {
            // 发送到AI
            const response = await AI.sendMessage(message);
            
            // 添加AI回复到聊天历史
            addMessageToHistory(chatHistory, response, 'ai');
            
        } catch (error) {
            // 添加错误消息
            addMessageToHistory(chatHistory, error.message, 'error');
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
 * 添加消息到聊天历史
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型：'user', 'ai', 'error'
 */
function addMessageToHistory(chatHistory, message, type) {
    const messageElement = Utils.createElement('div', `ai-message ai-message-${type}`);
    
    // 添加消息头
    const messageHeader = Utils.createElement('div', 'ai-message-header');
    const senderName = type === 'user' ? 
        I18n.getMessage('you', '您') : 
        type === 'ai' ? 
        I18n.getMessage('aiAssistant', 'AI助手') : 
        I18n.getMessage('error', '错误');
    
    messageHeader.textContent = senderName;
    
    // 添加消息内容
    const messageContent = Utils.createElement('div', 'ai-message-content');
    messageContent.textContent = message;
    
    messageElement.append(messageHeader, messageContent);
    chatHistory.appendChild(messageElement);
    
    // 滚动到底部
    chatHistory.scrollTop = chatHistory.scrollHeight;
}
