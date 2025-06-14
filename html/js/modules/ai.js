/**
 * AI助手模块
 * 负责AI功能的管理和交互
 */
import { I18n, Utils, Menu, Notification, IconManager } from './core/index.js';
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
    quickPrompts: [],  // 将在初始化时填充国际化的默认提示词
    systemPrompt: '',   // 将在初始化时填充国际化的默认系统提示
    titleGeneration: {
        enabled: true,                    // 是否启用AI生成标题
        updateInterval: 3,                // 每隔多少轮对话更新标题
        maxTokensForTitle: 100           // 标题生成的最大token数
    }
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
export const AI = {    /**
     * 初始化AI模块
     * @returns {Promise<void>}
     */
    async initialize() {
        // 设置默认的国际化文本
        setDefaultI18nTexts();
        
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
     * 发送消息到AI（支持多轮对话）
     * @param {string} message - 用户消息
     * @param {string} conversationId - 对话ID（可选，不传则创建新对话）
     * @returns {Promise<Object>} - 包含AI回复和对话ID的对象
     */
    async sendMessage(message, conversationId = null, onChunk = null) {
        // 检查网络连接
        const isOnline = await checkNetworkConnection();
        if (!isOnline) {
            throw new Error(I18n.getMessage('networkError', '网络连接异常，请检查网络设置'));
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
            throw new Error(I18n.getMessage('aiConfigIncomplete', 'AI配置不完整，请检查API地址和密钥'));
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
                // 过滤掉reasoning_content，只保留content
                ...conversation.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ];
            
            // 构建聊天完成端点URL
            let chatUrl;
            const apiUrl = currentProvider.apiUrl.trim();
            
            try {
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
                
                // 创建请求控制器用于超时处理
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                }, 60000); // 60秒超时
                
                // 检查是否为DeepSeek推理模型
                const isDeepSeekReasoner = currentProvider.model === 'deepseek-reasoner';
                
                // 构建请求体，添加stream参数
                const requestBody = {
                    model: currentProvider.model,
                    messages: apiMessages,
                    max_tokens: isDeepSeekReasoner ? 32000 : 1000,
                    stream: !!onChunk, // 如果有onChunk回调，启用流式
                    temperature: isDeepSeekReasoner ? undefined : 0.7
                };
                
                // 如果启用流式回复
                if (onChunk) {
                    return await sendStreamMessage(chatUrl, requestBody, currentProvider.apiKey, conversation, onChunk);
                }
                
                const response = await fetch(chatUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${currentProvider.apiKey}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                console.log('API响应状态:', response.status); // 调试日志
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('API错误响应:', errorText);
                    
                    // 使用新的错误处理函数
                    const errorMessage = handleAPIError(response, errorText);
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                console.log('API响应数据:', data); // 调试日志
                
                // 检查响应数据完整性
                if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
                    throw new Error(I18n.getMessage('apiResponseInvalid', 'API响应数据格式错误'));
                }
                
                const choice = data.choices[0];
                const aiReply = choice?.message?.content;
                const reasoning = choice?.message?.reasoning_content; // DeepSeek推理模型的思维链
                
                if (!aiReply) {
                    throw new Error(I18n.getMessage('aiNoResponse', 'AI未返回有效回复'));
                }
                
                // 添加AI回复到对话历史（不包含reasoning_content，避免上下文问题）
                const aiMessage = {
                    role: 'assistant',
                    content: aiReply,
                    timestamp: Date.now()
                };
                
                // 如果有推理内容，单独存储（但不加入对话历史，避免API报错）
                if (reasoning && isDeepSeekReasoner) {
                    aiMessage.reasoning_content = reasoning;
                }
                
                conversation.messages.push(aiMessage);
                  // 更新对话的最后更新时间
                conversation.lastUpdated = Date.now();
                
                // 处理对话标题生成
                await updateConversationTitle(conversation, message);

                // 保存对话历史
                await saveConversationHistory();
                
                return {
                    reply: aiReply,
                    reasoning: reasoning, // 返回推理内容供UI展示
                    conversationId: conversation.id,
                    conversation: conversation
                };
                
            } catch (error) {
                // 处理网络超时错误
                if (error.name === 'AbortError') {
                    throw new Error(I18n.getMessage('requestTimeout', '请求超时，请检查网络连接或稍后重试'));
                }
                
                // 处理网络连接错误
                if (error instanceof TypeError && error.message.includes('fetch')) {
                    const networkAvailable = await checkNetworkConnection();
                    if (!networkAvailable) {
                        throw new Error(I18n.getMessage('networkUnavailable', '网络连接不可用，请检查网络设置'));
                    } else {
                        throw new Error(I18n.getMessage('apiConnectionFailed', 'API连接失败，请检查API地址配置'));
                    }
                }
                
                console.error('AI请求详细错误:', error);
                throw error; // 重新抛出已处理的错误
            }        } catch (error) {
            console.error('AI请求失败:', error);
            
            // 如果错误已经被处理过（包含国际化的错误消息），直接抛出
            if (error.message.includes(I18n.getMessage('networkError', 'network')) || 
                error.message.includes(I18n.getMessage('requestTimeout', 'timeout')) ||
                error.message.includes(I18n.getMessage('networkUnavailable', 'unavailable'))) {
                throw error;
            }
            
            // 其他未处理的错误
            throw new Error(I18n.getMessage('aiRequestFailed', 'AI请求失败: ') + error.message);
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

        // 检查网络连接
        const isOnline = await checkNetworkConnection();
        if (!isOnline) {
            throw new Error(I18n.getMessage('networkError', '网络连接异常，请检查网络设置'));
        }

        try {
            // 构建模型列表API URL
            const baseUrl = new URL(apiUrl);
            const modelsUrl = new URL('/v1/models', baseUrl.origin);

            // 创建请求控制器用于超时处理
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 30000); // 30秒超时

            // 发送请求获取模型列表
            const response = await fetch(modelsUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('获取模型列表API错误:', errorText);
                
                // 使用错误处理函数
                const errorMessage = handleAPIError(response, errorText);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            
            // 处理返回的模型数据
            if (Array.isArray(data.data)) {
                const models = data.data
                    .map(model => model.id)
                    .filter(id => id && (id.includes('gpt') || id.includes('claude') || id.includes('deepseek') || id.includes('llama')));
                
                if (models.length === 0) {
                    console.warn('未找到支持的聊天模型');
                    // 返回原始数据的前几个作为备选
                    return data.data.slice(0, 10).map(model => model.id).filter(Boolean);
                }
                
                return models;
            }

            // 如果返回格式不符合预期，尝试其他格式
            if (Array.isArray(data)) {
                return data.filter(item => typeof item === 'string');
            }

            throw new Error(I18n.getMessage('modelListFormatError', '模型列表数据格式不正确'));
            
        } catch (error) {
            // 处理网络超时错误
            if (error.name === 'AbortError') {
                throw new Error(I18n.getMessage('requestTimeout', '请求超时，请检查网络连接或稍后重试'));
            }
            
            // 处理网络连接错误
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error(I18n.getMessage('apiConnectionFailed', 'API连接失败，请检查API地址配置'));
            }
              console.error('获取模型列表失败:', error);
            
            // 如果错误已经被处理过（包含国际化的错误消息），直接抛出
            if (error.message.includes(I18n.getMessage('networkError', 'network')) || 
                error.message.includes(I18n.getMessage('requestTimeout', 'timeout')) ||
                error.message.includes(I18n.getMessage('networkUnavailable', 'unavailable'))) {
                throw error;
            }
            
            throw new Error(I18n.getMessage('modelListFetchFailed', '获取模型列表失败: ') + error.message);
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
    },

    /**
     * 创建AI设置项
     * @returns {Array} - 设置项配置数组
     */
    createSettingsItems() {
        return [
            {
                id: 'ai-enabled',
                label: I18n.getMessage('settingsAIEnabled', '启用AI助手'),
                type: 'checkbox',
                getValue: () => this.getConfig().enabled,
                description: I18n.getMessage('settingsAIEnabledDesc', '启用后可在搜索框旁显示AI按钮'),
                onChange: async (value) => {
                    const success = await this.updateConfig({ enabled: value });
                    if (success) {
                        Notification.notify({
                            title: value 
                                ? I18n.getMessage('aiEnabled', 'AI助手已启用')
                                : I18n.getMessage('aiDisabled', 'AI助手已禁用'),
                            message: value
                                ? I18n.getMessage('aiEnabledMessage', '您可以在搜索框旁看到AI按钮')
                                : I18n.getMessage('aiDisabledMessage', 'AI按钮已隐藏'),
                            type: value ? 'success' : 'info',
                            duration: 2000
                        });
                    }
                }
            },
            {
                id: 'ai-provider-list',
                label: I18n.getMessage('settingsAIProviders', 'AI供应商管理'),
                type: 'custom',
                description: I18n.getMessage('settingsAIProvidersDesc', '管理和配置AI供应商'),
                createControl: async () => {
                    return await this.createProviderListControl();
                }
            },
            {
                id: 'add-ai-provider',
                label: I18n.getMessage('settingsAddAIProvider', '添加AI供应商'),
                type: 'button',
                buttonText: I18n.getMessage('addCustomAIProvider', '添加自定义AI供应商'),
                buttonClass: 'btn-primary',
                description: I18n.getMessage('settingsAddAIProviderDesc', '添加新的AI供应商配置'),
                onClick: () => {
                    this.showAddProviderModal();
                }
            },
            {
                id: 'ai-system-prompt',
                label: I18n.getMessage('settingsAISystemPrompt', '系统提示词'),
                type: 'textarea',
                getValue: () => this.getConfig().systemPrompt,
                description: I18n.getMessage('settingsAISystemPromptDesc', '定义AI的行为和回答风格'),
                onChange: (value) => {
                    this.updateConfig({ systemPrompt: value });
                }
            },            {
                id: 'ai-quick-prompts',
                label: I18n.getMessage('settingsAIQuickPrompts', '快速提示词'),
                type: 'custom',
                description: I18n.getMessage('settingsAIQuickPromptsDesc', '管理快速提示词，用逗号分隔'),
                createControl: () => {
                    return this.createQuickPromptsControl();
                }
            },
            {
                id: 'ai-title-generation-enabled',
                label: I18n.getMessage('settingsAITitleGeneration', '启用AI生成标题'),
                type: 'checkbox',
                getValue: () => this.getConfig().titleGeneration?.enabled ?? true,
                description: I18n.getMessage('settingsAITitleGenerationDesc', '让AI为对话生成简洁的标题，而不是使用用户问题'),
                onChange: async (value) => {
                    const titleGeneration = { ...this.getConfig().titleGeneration, enabled: value };
                    const success = await this.updateConfig({ titleGeneration });
                    if (success) {
                        Notification.notify({
                            title: I18n.getMessage('success', '成功'),
                            message: value 
                                ? I18n.getMessage('aiTitleGenerationEnabled', 'AI标题生成已启用')
                                : I18n.getMessage('aiTitleGenerationDisabled', 'AI标题生成已禁用'),
                            type: 'success',
                            duration: 2000
                        });
                    }
                }
            },
            {
                id: 'ai-title-update-interval',
                label: I18n.getMessage('settingsAITitleUpdateInterval', '标题更新间隔'),
                type: 'range',
                min: 1,
                max: 10,
                step: 1,
                getValue: () => this.getConfig().titleGeneration?.updateInterval ?? 3,
                unit: I18n.getMessage('rounds', '轮'),
                description: I18n.getMessage('settingsAITitleUpdateIntervalDesc', '每隔多少轮对话重新生成标题（第1轮总是生成）'),
                onChange: async (value) => {
                    const titleGeneration = { ...this.getConfig().titleGeneration, updateInterval: parseInt(value) };
                    const success = await this.updateConfig({ titleGeneration });
                    if (success) {
                        console.log(`标题更新间隔已设置为: ${value}轮`);
                    }
                }
            },
            {
                id: 'ai-title-max-tokens',
                label: I18n.getMessage('settingsAITitleMaxTokens', '标题生成Token限制'),
                type: 'range',
                min: 50,
                max: 200,
                step: 10,
                getValue: () => this.getConfig().titleGeneration?.maxTokensForTitle ?? 100,
                unit: I18n.getMessage('tokens', 'tokens'),
                description: I18n.getMessage('settingsAITitleMaxTokensDesc', '控制标题生成的Token数量，较少的Token可节约成本'),
                onChange: async (value) => {
                    const titleGeneration = { ...this.getConfig().titleGeneration, maxTokensForTitle: parseInt(value) };
                    const success = await this.updateConfig({ titleGeneration });
                    if (success) {
                        console.log(`标题生成Token限制已设置为: ${value}`);
                    }
                }
            }
        ];
    },

    /**
     * 创建AI供应商列表控件
     * @returns {HTMLElement} - AI供应商列表容器
     */
    async createProviderListControl() {
        const listContainer = Utils.createElement('div', 'ai-provider-list-container');
        
        try {
            const config = this.getConfig();
            const providers = config.providers || [];
            const currentProvider = config.currentProvider || providers[0];
            
            providers.forEach((provider, index) => {
                const providerItem = Utils.createElement('div', 'search-engine-item-setting');
                
                // 供应商图标
                const providerIcon = Utils.createElement('img', 'engine-icon', {
                    alt: provider.name,
                    style: 'width: 24px; height: 24px; object-fit: contain;'
                });
                
                // 改进图标URL获取逻辑
                let iconUrl;
                if (provider.iconUrl) {
                    iconUrl = provider.iconUrl;
                } else {
                    try {
                        const apiDomain = new URL(provider.apiUrl);
                        let mainDomain = apiDomain.origin;
                        
                        if (apiDomain.hostname.startsWith('api.')) {
                            mainDomain = `${apiDomain.protocol}//${apiDomain.hostname.replace('api.', '')}`;
                        }
                        iconUrl = mainDomain;
                    } catch (error) {
                        iconUrl = provider.apiUrl;
                    }
                }
                
                IconManager.setIconForElement(providerIcon, iconUrl);
                providerIcon.onerror = () => IconManager.handleIconError(providerIcon, '../icons/icon128.png');
                
                // 供应商名称
                const providerName = Utils.createElement('div', 'engine-name', {}, provider.name);
                
                // 供应商API URL
                const providerUrl = Utils.createElement('div', 'engine-url', {}, provider.apiUrl);
                
                // 当前供应商标识
                const isCurrentProvider = currentProvider && currentProvider.name === provider.name;
                if (isCurrentProvider) {
                    providerItem.classList.add('current-engine');
                    const currentBadge = Utils.createElement('span', 'current-badge', {}, I18n.getMessage('currentEngine', '当前'));
                    providerItem.appendChild(currentBadge);
                }
                
                // 供应商信息容器
                const providerInfo = Utils.createElement('div', 'engine-info');
                providerInfo.append(providerName, providerUrl);
                
                // 操作按钮
                const providerActions = Utils.createElement('div', 'engine-actions');
                
                // 设为当前按钮
                if (!isCurrentProvider) {
                    const setCurrentBtn = Utils.createElement('button', 'btn btn-small btn-primary', {}, I18n.getMessage('setAsCurrent', '设为当前'));
                    setCurrentBtn.addEventListener('click', async () => {
                        const success = await this.updateConfig({ currentProvider: provider });
                        if (success) {
                            this.refreshProviderListControl();
                            Notification.notify({
                                title: I18n.getMessage('success', '成功'),
                                message: I18n.getMessage('providerSwitched', 'AI供应商已切换'),
                                type: 'success',
                                duration: 2000
                            });
                        }
                    });
                    providerActions.appendChild(setCurrentBtn);
                }
                
                // 编辑按钮
                const editBtn = Utils.createElement('button', 'btn btn-small btn-secondary', {}, I18n.getMessage('edit', '编辑'));
                editBtn.addEventListener('click', () => {
                    this.showEditProviderModal(provider, index);
                });
                providerActions.appendChild(editBtn);
                
                // 删除按钮
                if (!provider.isDefault && providers.length > 1) {
                    const deleteBtn = Utils.createElement('button', 'btn btn-small btn-danger', {}, I18n.getMessage('delete', '删除'));
                    deleteBtn.addEventListener('click', () => {
                        Notification.notify({
                            title: I18n.getMessage('confirmDelete', '确认删除'),
                            message: `${I18n.getMessage('confirmDeleteProvider', '确定要删除AI供应商')} "${provider.name}" ${I18n.getMessage('confirmDeleteProviderSuffix', '吗？')}`,
                            duration: 0,
                            type: 'confirm',
                            buttons: [
                                {
                                    text: I18n.getMessage('confirm', '确认'),
                                    class: 'btn-primary confirm-yes',
                                    callback: async () => {
                                        const success = await this.deleteProvider(index);
                                        if (success) {
                                            this.refreshProviderListControl();
                                        }
                                    }
                                },
                                {
                                    text: I18n.getMessage('cancel', '取消'),
                                    class: 'confirm-no',
                                    callback: () => {}
                                }
                            ]
                        });
                    });
                    providerActions.appendChild(deleteBtn);
                }
                
                providerItem.append(providerIcon, providerInfo, providerActions);
                listContainer.appendChild(providerItem);
            });
            
        } catch (error) {
            console.error('创建AI供应商列表失败:', error);
            const errorMsg = Utils.createElement('div', 'error-message', {}, I18n.getMessage('loadProviderListError', '加载AI供应商列表失败'));
            listContainer.appendChild(errorMsg);
        }
        
        return listContainer;
    },

    /**
     * 创建快速提示词控件
     * @returns {HTMLElement} - 快速提示词编辑器
     */
    createQuickPromptsControl() {
        const container = Utils.createElement('div', 'quick-prompts-editor');
        
        const config = this.getConfig();
        const currentPrompts = config.quickPrompts || [];
        
        const textarea = Utils.createElement('textarea', 'setting-textarea', {
            rows: 3,
            placeholder: I18n.getMessage('quickPromptsPlaceholder', '输入快速提示词，用逗号分隔...')
        });
        textarea.value = currentPrompts.join(', ');
        
        const saveBtn = Utils.createElement('button', 'btn btn-primary btn-small', {}, I18n.getMessage('save', '保存'));
        
        saveBtn.addEventListener('click', () => {
            const value = textarea.value.trim();
            const prompts = value ? value.split(',').map(p => p.trim()).filter(p => p) : [];
            
            this.updateConfig({ quickPrompts: prompts });
            
            Notification.notify({
                title: I18n.getMessage('success', '成功'),
                message: I18n.getMessage('quickPromptsSaved', '快速提示词已保存'),
                type: 'success',
                duration: 2000
            });
        });
        
        container.append(textarea, saveBtn);
        return container;
    },

    /**
     * 刷新供应商列表控件
     */
    refreshProviderListControl() {
        const listContainer = document.querySelector('.ai-provider-list-container');
        if (!listContainer) return;
        
        this.createProviderListControl().then(newList => {
            listContainer.parentNode.replaceChild(newList, listContainer);
        });
    },

    /**
     * 显示添加供应商模态框
     */
    showAddProviderModal() {
        showAIConfigModal();
    },

    /**
     * 显示编辑供应商模态框
     * @param {Object} provider - 供应商对象
     * @param {number} index - 供应商索引
     */
    showEditProviderModal(provider, index) {
        const formItems = [
            {
                type: 'text',
                id: 'edit-provider-name',
                label: I18n.getMessage('providerName', 'AI供应商名称'),
                value: provider.name,
                required: true
            },
            {
                type: 'url',
                id: 'edit-provider-api-url',
                label: I18n.getMessage('providerApiUrl', 'API地址'),
                value: provider.apiUrl,
                required: true
            },
            {
                type: 'password-toggle',
                id: 'edit-provider-api-key',
                label: I18n.getMessage('providerApiKey', 'API密钥'),
                value: provider.apiKey || '',
                required: true
            },
            {
                type: 'text',
                id: 'edit-provider-model',
                label: I18n.getMessage('providerModel', '模型名称'),
                value: provider.model,
                required: true
            },
            {
                type: 'url',
                id: 'edit-provider-icon',
                label: I18n.getMessage('providerIconUrl', '图标URL（可选）'),
                value: provider.iconUrl || '',
                required: false
            }
        ];

        Menu.showFormModal(
            `${I18n.getMessage('editProvider', '编辑AI供应商')} - ${provider.name}`,
            formItems,
            async (formData) => {
                const name = formData['edit-provider-name'];
                const apiUrl = formData['edit-provider-api-url'];
                const apiKey = formData['edit-provider-api-key'];
                const model = formData['edit-provider-model'];
                const iconUrl = formData['edit-provider-icon'];
                
                const config = this.getConfig();
                const providers = [...config.providers];
                const updatedProvider = { ...provider, name, apiUrl, apiKey, model, iconUrl };
                providers[index] = updatedProvider;
                
                // 如果编辑的是当前供应商，更新当前供应商配置
                let updateConfig = { providers };
                if (config.currentProvider && config.currentProvider.name === provider.name) {
                    updateConfig.currentProvider = updatedProvider;
                }
                
                const success = await this.updateConfig(updateConfig);
                if (success) {
                    this.refreshProviderListControl();
                    Notification.notify({
                        title: I18n.getMessage('success', '成功'),
                        message: I18n.getMessage('updateProviderSuccess', 'AI供应商更新成功'),
                        type: 'success',
                        duration: 2000
                    });
                } else {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('updateProviderError', '更新AI供应商失败'),
                        type: 'error',
                        duration: 3000
                    });
                }
            },
            I18n.getMessage('save', '保存'),
            I18n.getMessage('cancel', '取消')
        );
    },

    /**
     * 删除供应商
     * @param {number} index - 供应商索引
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async deleteProvider(index) {
        try {
            const config = this.getConfig();
            const providers = [...config.providers];
            const deletedProvider = providers[index];
            
            if (!deletedProvider || deletedProvider.isDefault) {
                return false;
            }
            
            providers.splice(index, 1);
            
            // 如果删除的是当前供应商，设置第一个为当前供应商
            let newCurrentProvider = config.currentProvider;
            if (config.currentProvider && config.currentProvider.name === deletedProvider.name) {
                newCurrentProvider = providers[0];
            }
            
            const success = await this.updateConfig({ 
                providers,
                currentProvider: newCurrentProvider
            });
            
            if (success) {
                Notification.notify({
                    title: I18n.getMessage('success', '成功'),
                    message: I18n.getMessage('providerDeleted', 'AI供应商已删除'),
                    type: 'success',
                    duration: 2000
                });
            }
            
            return success;
        } catch (error) {
            console.error('删除供应商失败:', error);
            return false;
        }
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
 * 更新对话标题（使用AI生成）
 * @param {Object} conversation - 对话对象
 * @param {string} latestMessage - 最新的用户消息
 * @returns {Promise<void>}
 */
async function updateConversationTitle(conversation, latestMessage) {
    try {
        const config = aiConfig.titleGeneration;
        
        // 检查是否启用标题生成
        if (!config.enabled) {
            // 如果是第一轮对话且未启用AI标题生成，使用用户问题作为标题
            if (conversation.messages.length === 2) {
                conversation.title = latestMessage.length > 50 ? latestMessage.substring(0, 50) + '...' : latestMessage;
            }
            return;
        }
        
        // 计算对话轮数（用户+AI消息对数）
        const roundCount = Math.floor(conversation.messages.length / 2);
        
        // 检查是否需要生成/更新标题
        const shouldGenerateTitle = (
            roundCount === 1 || // 第一轮对话
            (roundCount > 1 && roundCount % config.updateInterval === 0) // 达到更新间隔
        );
        
        if (!shouldGenerateTitle) {
            return;
        }
        
        // 构建标题生成的上下文
        const context = buildTitleContext(conversation);
        
        // 调用AI生成标题
        const generatedTitle = await generateTitleWithAI(context, config.maxTokensForTitle);
        
        if (generatedTitle && generatedTitle.trim()) {
            conversation.title = generatedTitle.trim();
            console.log(`对话 ${conversation.id} 标题已更新为: ${conversation.title}`);
        }
        
    } catch (error) {
        console.warn('生成对话标题失败:', error);
        // 降级处理：如果是第一轮对话，使用用户问题作为标题
        if (Math.floor(conversation.messages.length / 2) === 1) {
            conversation.title = latestMessage.length > 50 ? latestMessage.substring(0, 50) + '...' : latestMessage;
        }
    }
}

/**
 * 构建用于标题生成的上下文
 * @param {Object} conversation - 对话对象
 * @returns {string} 上下文字符串
 */
function buildTitleContext(conversation) {
    // 获取前几轮对话作为上下文（最多6条消息，3轮对话）
    const maxMessages = 6;
    const messages = conversation.messages.slice(0, maxMessages);
    
    let context = '';
    for (let i = 0; i < messages.length; i += 2) {
        if (i + 1 < messages.length) {
            const userMsg = messages[i].content;
            const aiMsg = messages[i + 1].content;
            
            // 限制每条消息的长度避免context过长
            const truncatedUser = userMsg.length > 200 ? userMsg.substring(0, 200) + '...' : userMsg;
            const truncatedAI = aiMsg.length > 200 ? aiMsg.substring(0, 200) + '...' : aiMsg;
            
            context += `用户: ${truncatedUser}\nAI: ${truncatedAI}\n\n`;
        }
    }
    
    return context.trim();
}

/**
 * 使用AI生成对话标题
 * @param {string} context - 对话上下文
 * @param {number} maxTokens - 最大token数
 * @returns {Promise<string>} 生成的标题
 */
async function generateTitleWithAI(context, maxTokens) {
    const currentProvider = aiConfig.currentProvider || aiConfig.providers[0];
    
    if (!currentProvider || !currentProvider.apiUrl || !currentProvider.apiKey) {
        throw new Error('AI配置不完整，无法生成标题');
    }
    
    // 构建标题生成的系统提示
    const titlePrompt = I18n.getMessage('titleGenerationPrompt', 
        '请为以下对话生成一个简洁、准确的标题。标题应该：\n1. 不超过20个字符\n2. 准确概括对话的主要内容\n3. 使用中文（如果对话是中文）或英文（如果对话是英文）\n4. 不要包含引号或特殊符号\n5. 直接输出标题，不要其他解释\n\n对话内容：');
    
    const messages = [
        {
            role: 'system',
            content: titlePrompt
        },
        {
            role: 'user',
            content: context
        }
    ];
    
    // 构建API URL
    let chatUrl;
    const apiUrl = currentProvider.apiUrl.trim();
    
    if (apiUrl.includes('/chat/completions')) {
        chatUrl = apiUrl;
    } else if (apiUrl.includes('/v1')) {
        chatUrl = apiUrl.endsWith('/') ? apiUrl + 'chat/completions' : apiUrl + '/chat/completions';
    } else {
        const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
        chatUrl = baseUrl + '/v1/chat/completions';
    }
    
    // 发送请求
    const requestBody = {
        model: currentProvider.model,
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.3, // 较低的temperature以获得更稳定的结果
        stream: false
    };
    
    const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentProvider.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`标题生成API请求失败: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('标题生成API响应格式错误');
    }
    
    const title = data.choices[0]?.message?.content;
    if (!title) {
        throw new Error('AI未返回有效标题');
    }
    
    return title;
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
        convMeta.textContent = `${lastUpdated} · ${Math.max(0, Math.floor(conv.messageCount/2))}${I18n.getMessage('conversationCount', '条')}`;
        
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
        const reasoning = msg.reasoning_content; // 获取推理内容
        addMessageToHistory(chatHistory, msg.content, msg.role === 'user' ? 'user' : 'ai', reasoning);
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
 * 处理API错误响应
 * @param {Response} response - API响应对象
 * @param {string} responseText - 响应文本
 * @returns {string} 用户友好的错误信息
 */
function handleAPIError(response, responseText) {
    const status = response.status;
    let errorMessage = '';
    
    // 尝试解析JSON错误信息
    let errorData = null;
    try {
        errorData = JSON.parse(responseText);
    } catch (e) {
        // 忽略JSON解析错误
    }
    
    // 获取详细错误信息
    const apiErrorMessage = errorData?.error?.message || errorData?.message || '';
    
    switch (status) {
        case 400:
            errorMessage = I18n.getMessage('apiError400', '请求格式错误') + 
                          (apiErrorMessage ? `：${apiErrorMessage}` : '。请检查请求参数格式。');
            break;
            
        case 401:
            errorMessage = I18n.getMessage('apiError401', 'API密钥认证失败') + 
                          '。请检查您的API密钥是否正确。' +
                          (apiErrorMessage ? `\n详细信息：${apiErrorMessage}` : '');
            break;
            
        case 402:
            errorMessage = I18n.getMessage('apiError402', '账户余额不足') + 
                          '。请确认账户余额并进行充值。' +
                          (apiErrorMessage ? `\n详细信息：${apiErrorMessage}` : '');
            break;
            
        case 404:
            errorMessage = I18n.getMessage('apiError404', 'API地址未找到') + 
                          '。请检查API地址配置是否正确。' +
                          (apiErrorMessage ? `\n详细信息：${apiErrorMessage}` : '');
            break;
            
        case 422:
            errorMessage = I18n.getMessage('apiError422', '请求参数错误') + 
                          (apiErrorMessage ? `：${apiErrorMessage}` : '。请检查请求参数。');
            break;
            
        case 429:
            errorMessage = I18n.getMessage('apiError429', '请求速率达到上限') + 
                          '。请稍后再试，或考虑升级您的API计划。' +
                          (apiErrorMessage ? `\n详细信息：${apiErrorMessage}` : '');
            break;
            
        case 500:
            errorMessage = I18n.getMessage('apiError500', '服务器内部故障') + 
                          '。请稍后重试，如问题持续请联系API服务商。' +
                          (apiErrorMessage ? `\n详细信息：${apiErrorMessage}` : '');
            break;
            
        case 503:
            errorMessage = I18n.getMessage('apiError503', '服务器繁忙') + 
                          '。服务器负载过高，请稍后重试。' +
                          (apiErrorMessage ? `\n详细信息：${apiErrorMessage}` : '');
            break;
            
        default:
            errorMessage = I18n.getMessage('apiErrorGeneric', `API请求失败 (${status})`) + 
                          (apiErrorMessage ? `：${apiErrorMessage}` : `。HTTP状态码：${status}`);
    }
    
    return errorMessage;
}

/**
 * 检查网络连接状态
 * @returns {Promise<boolean>} 网络是否可用
 */
async function checkNetworkConnection() {
    if (!navigator.onLine) {
        return false;
    }
    
    // 尝试发送一个简单的请求来测试网络连接
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
        
        await fetch('https://www.baidu.com/favicon.ico', {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return true;
    } catch (error) {
        console.warn('网络连接检测失败:', error);
        return false;
    }
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

    // 更新发送消息函数
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

        // 创建AI消息容器用于流式显示
        let aiMessageElement = null;
        let aiContentElement = null;
        let reasoningContainer = null;
        let reasoningContentElement = null;
        
        try {
            if (!AI.isEnabled()) {
                throw new Error(I18n.getMessage('aiNotEnabled', 'AI功能未启用，请在设置中启用AI功能'));
            }
            
            // 预创建AI消息元素
            aiMessageElement = Utils.createElement('div', 'ai-message ai-message-ai');
            aiContentElement = Utils.createElement('div', 'ai-message-content');
            aiMessageElement.appendChild(aiContentElement);
            chatHistory.appendChild(aiMessageElement);
            
            // 添加打字指示器
            const typingIndicator = Utils.createElement('span', 'typing-indicator', {}, '|');
            aiContentElement.appendChild(typingIndicator);
            
            // 滚动到底部
            chatHistory.scrollTop = chatHistory.scrollHeight;
            
            // 发送到AI（启用流式回复）
            const result = await AI.sendMessage(message, getCurrentConversationId(), (chunk, isFinished, reasoning, type) => {
                if (isFinished) {
                    // 移除打字指示器
                    const indicator = aiContentElement.querySelector('.typing-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                    
                    // 如果推理容器中有内容，移除其打字指示器
                    if (reasoningContentElement) {
                        const reasoningIndicator = reasoningContentElement.querySelector('.typing-indicator');
                        if (reasoningIndicator) {
                            reasoningIndicator.remove();
                        }
                    }
                    
                    return;
                }
                
                if (type === 'content' && chunk) {
                    // 处理正文内容
                    const indicator = aiContentElement.querySelector('.typing-indicator');
                    if (indicator) {
                        indicator.remove();
                    }
                    
                    const currentText = aiContentElement.textContent || '';
                    aiContentElement.textContent = currentText + chunk;
                    
                    // 重新添加打字指示器
                    const newIndicator = Utils.createElement('span', 'typing-indicator', {}, '▋');
                    aiContentElement.appendChild(newIndicator);
                    
                    // 滚动到底部
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                    
                } else if (type === 'reasoning' && chunk) {
                    // 处理推理内容 - 流式显示
                    if (!reasoningContainer) {
                        // 创建推理容器
                        reasoningContainer = Utils.createElement('div', 'ai-reasoning-container');
                        const reasoningHeader = Utils.createElement('div', 'ai-reasoning-header');
                        const reasoningToggle = Utils.createElement('button', 'ai-reasoning-toggle', {
                            type: 'button'
                        }, '🧠 思维过程（实时）');
                        
                        reasoningContentElement = Utils.createElement('div', 'ai-reasoning-content');
                        reasoningContentElement.style.display = 'block'; // 默认展开显示流式思维过程
                        
                        // 切换显示/隐藏推理内容
                        reasoningToggle.addEventListener('click', () => {
                            const isVisible = reasoningContentElement.style.display !== 'none';
                            reasoningContentElement.style.display = isVisible ? 'none' : 'block';
                            reasoningToggle.textContent = `🧠 ${isVisible ? I18n.getMessage('hideThinking', '隐藏思维过程') : I18n.getMessage('showThinking', '查看思维过程')}`;
                        });
                        
                        reasoningHeader.appendChild(reasoningToggle);
                        reasoningContainer.appendChild(reasoningHeader);
                        reasoningContainer.appendChild(reasoningContentElement);
                        
                        // 将推理容器插入到正文内容之前
                        aiMessageElement.insertBefore(reasoningContainer, aiContentElement);
                    }
                    
                    // 移除旧的打字指示器
                    const reasoningIndicator = reasoningContentElement.querySelector('.typing-indicator');
                    if (reasoningIndicator) {
                        reasoningIndicator.remove();
                    }
                    
                    // 更新推理内容（使用纯文本避免部分Markdown渲染问题）
                    const currentReasoning = reasoningContentElement.textContent || '';
                    reasoningContentElement.textContent = currentReasoning + chunk;
                    
                    // 添加新的打字指示器
                    const newReasoningIndicator = Utils.createElement('span', 'typing-indicator', {}, '▋');
                    reasoningContentElement.appendChild(newReasoningIndicator);
                    
                    // 滚动到底部
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                }            });
              // 流式完成后，用Markdown渲染最终内容
            const finalContent = result.reply || '';
            
            // 为流式AI消息添加控制按钮
            const controlsContainer = Utils.createElement('div', 'ai-message-controls');
            const markdownToggle = Utils.createElement('button', 'ai-markdown-toggle active', {
                type: 'button',
                title: I18n.getMessage('markdownRendering', 'Markdown渲染')
            }, '📝 MD');
            
            // 存储原始消息和渲染状态
            let isMarkdownMode = true;
            
            // 初始渲染为Markdown
            aiContentElement.innerHTML = renderMarkdown(finalContent);
            
            // 切换Markdown渲染
            markdownToggle.addEventListener('click', () => {
                if (isMarkdownMode) {
                    // 切换到纯文本模式
                    aiContentElement.textContent = finalContent;
                    markdownToggle.textContent = '📄 TXT';
                    markdownToggle.title = I18n.getMessage('rawText', '原始文本');
                    markdownToggle.classList.remove('active');
                    isMarkdownMode = false;
                } else {
                    // 切换到Markdown模式
                    aiContentElement.innerHTML = renderMarkdown(finalContent);
                    markdownToggle.textContent = '📝 MD';
                    markdownToggle.title = I18n.getMessage('markdownRendering', 'Markdown渲染');
                    markdownToggle.classList.add('active');
                    isMarkdownMode = true;
                }
            });
            
            controlsContainer.appendChild(markdownToggle);
            // 将控制按钮插入到AI消息元素的开头
            aiMessageElement.insertBefore(controlsContainer, aiContentElement);
            
            // 如果有推理内容，渲染最终的推理内容
            if (result.reasoning && reasoningContentElement) {
                const reasoningText = result.reasoning || '';
                reasoningContentElement.innerHTML = renderMarkdown(reasoningText);
                // 更新按钮文本
                const reasoningToggle = reasoningContainer.querySelector('.ai-reasoning-toggle');
                if (reasoningToggle) {
                    reasoningToggle.textContent = `🧠 ${I18n.getMessage('hideThinking', '隐藏思维过程')}`;
                }
            }
            
            // 更新当前对话ID
            setCurrentConversationId(result.conversationId);
            
            // 更新标题
            if (result.conversation && result.conversation.title !== I18n.getMessage('newConversation', '新对话')) {
                chatTitle.textContent = result.conversation.title;
            }
            
            // 重新加载对话列表以更新侧边栏
            loadConversationsList(conversationsList, chatHistory, chatTitle, getCurrentConversationId, setCurrentConversationId);
            
        } catch (error) {
            console.error('发送消息失败:', error);
            
            // 如果已创建AI消息元素，移除它
            if (aiMessageElement) {
                aiMessageElement.remove();
            }
            
            // 添加错误消息到聊天历史
            addMessageToHistory(chatHistory, error.message || 'Unknown error occurred', 'error');
            
            // 根据错误类型显示不同的通知
            let notificationType = 'error';
            let notificationDuration = 5000;
            
            if (error.message.includes('网络') || error.message.includes('连接')) {
                notificationType = 'warning';
                notificationDuration = 8000;
            } else if (error.message.includes('余额') || error.message.includes('402')) {
                notificationType = 'warning';
                notificationDuration = 10000;
            } else if (error.message.includes('速率') || error.message.includes('429')) {
                notificationType = 'warning';
                notificationDuration = 8000;
            }
            
            Notification.notify({
                title: I18n.getMessage('sendMessageFailed', '发送失败'),
                message: error.message,
                type: notificationType,
                duration: notificationDuration
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
 * 添加消息到聊天历史（支持Markdown渲染和推理内容展示）
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {string} message - 消息内容
 * @param {string} type - 消息类型（user、ai、error）
 * @param {string} reasoning - 推理内容（仅AI消息使用）
 */
function addMessageToHistory(chatHistory, message, type, reasoning = null) {
    const messageElement = Utils.createElement('div', `ai-message ai-message-${type}`);
    
    // 如果是AI消息且有推理内容，创建可折叠的推理区域
    if (type === 'ai' && reasoning) {
        // 推理内容区域
        const reasoningContainer = Utils.createElement('div', 'ai-reasoning-container');
        const reasoningHeader = Utils.createElement('div', 'ai-reasoning-header');
        const reasoningToggle = Utils.createElement('button', 'ai-reasoning-toggle', {
            type: 'button'
        }, '🧠 查看思维过程');
          const reasoningContent = Utils.createElement('div', 'ai-reasoning-content');
        reasoningContent.style.display = 'none'; // 默认隐藏
        const reasoningText = reasoning || '';
        reasoningContent.innerHTML = renderMarkdown(reasoningText);
        
        // 切换显示/隐藏推理内容
        reasoningToggle.addEventListener('click', () => {
            const isVisible = reasoningContent.style.display !== 'none';
            reasoningContent.style.display = isVisible ? 'none' : 'block';
            reasoningToggle.textContent = `🧠 ${isVisible ? I18n.getMessage('hideThinking', '隐藏思维过程') : I18n.getMessage('showThinking', '查看思维过程')}`;
        });
        
        reasoningHeader.appendChild(reasoningToggle);
        reasoningContainer.appendChild(reasoningHeader);
        reasoningContainer.appendChild(reasoningContent);
        messageElement.appendChild(reasoningContainer);
    }
    
    // 消息内容容器
    const messageContent = Utils.createElement('div', 'ai-message-content');
    
    if (type === 'ai') {
        // AI消息添加控制按钮
        const controlsContainer = Utils.createElement('div', 'ai-message-controls');
        const markdownToggle = Utils.createElement('button', 'ai-markdown-toggle active', {
            type: 'button',
            title: I18n.getMessage('markdownRendering', 'Markdown渲染')
        }, '📝 MD');
        
        // 存储原始消息和渲染状态
        let isMarkdownMode = true;
        const originalMessage = message || '';
        
        // 初始渲染为Markdown
        messageContent.innerHTML = renderMarkdown(originalMessage);
        
        // 切换Markdown渲染
        markdownToggle.addEventListener('click', () => {
            if (isMarkdownMode) {
                // 切换到纯文本模式
                messageContent.textContent = originalMessage;
                markdownToggle.textContent = '📄 TXT';
                markdownToggle.title = I18n.getMessage('rawText', '原始文本');
                markdownToggle.classList.remove('active');
                isMarkdownMode = false;
            } else {
                // 切换到Markdown模式
                messageContent.innerHTML = renderMarkdown(originalMessage);
                markdownToggle.textContent = '📝 MD';
                markdownToggle.title = I18n.getMessage('markdownRendering', 'Markdown渲染');
                markdownToggle.classList.add('active');
                isMarkdownMode = true;
            }
        });
        
        controlsContainer.appendChild(markdownToggle);
        messageElement.appendChild(controlsContainer);
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
 * 简单的Markdown渲染器
 * @param {string} text - 要渲染的文本
 * @returns {string} 渲染后的HTML
 */
function renderMarkdown(text) {
    // 确保text是字符串类型
    if (typeof text !== 'string') {
        console.warn('renderMarkdown: 传入的参数不是字符串类型:', typeof text, text);
        // 如果是对象，尝试序列化为JSON；否则转为字符串
        if (text && typeof text === 'object') {
            try {
                text = JSON.stringify(text, null, 2);
            } catch (e) {
                text = String(text);
            }
        } else {
            text = String(text || '');
        }
    }
    
    // 直接使用简单的Markdown渲染器
    return renderSimpleMarkdown(text);
}

/**
 * 简单的Markdown渲染器（备用方案）
 * @param {string} text - 要渲染的文本
 * @returns {string} 渲染后的HTML
 */
function renderSimpleMarkdown(text) {
    // 确保text是字符串类型
    if (typeof text !== 'string') {
        console.warn('renderSimpleMarkdown: 传入的参数不是字符串类型:', typeof text, text);
        // 如果是对象，尝试序列化为JSON；否则转为字符串
        if (text && typeof text === 'object') {
            try {
                text = JSON.stringify(text, null, 2);
            } catch (e) {
                text = String(text);
            }
        } else {
            text = String(text || '');
        }
    }
    
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
                        modelSelect.innerHTML = '';                        models.forEach(model => {
                            const option = Utils.createElement('option');
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
 * 发送流式消息
 * @param {string} url - API地址
 * @param {Object} requestBody - 请求体
 * @param {string} apiKey - API密钥
 * @param {Object} conversation - 对话对象
 * @param {Function} onChunk - 数据块回调
 * @returns {Promise<Object>} - 完整回复对象
 */
async function sendStreamMessage(url, requestBody, apiKey, conversation, onChunk) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(handleAPIError(response, errorText));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let fullContent = '';
    let reasoning = '';
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        break;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta;
                        
                                               
                        if (delta?.content) {
                            fullContent += delta.content;
                            // 调用回调函数，传递增量内容
                            onChunk(delta.content, false, null, 'content');
                        }
                        
                        if (delta?.reasoning_content) {
                            reasoning += delta.reasoning_content;
                            // 调用回调函数，传递推理增量内容
                            onChunk(delta.reasoning_content, false, null, 'reasoning');
                        }
                    } catch (e) {
                        // 忽略JSON解析错误
                        console.warn('解析流数据失败:', e);
                    }
                }
            }
        }
        
        // 流式回复完成
        onChunk('', true, reasoning, 'finished');
        
        // 添加AI回复到对话历史
        const aiMessage = {
            role: 'assistant',
            content: fullContent,
            timestamp: Date.now()
        };
        
        if (reasoning) {
            aiMessage.reasoning_content = reasoning;
        }
          conversation.messages.push(aiMessage);
        conversation.lastUpdated = Date.now();
        
        // 处理对话标题生成（获取最新的用户消息）
        const latestUserMessage = conversation.messages.filter(msg => msg.role === 'user').pop();
        if (latestUserMessage) {
            await updateConversationTitle(conversation, latestUserMessage.content);
        }
        
        // 保存对话历史
        await saveConversationHistory();
          return {
            reply: fullContent,
            reasoning: reasoning,
            conversationId: conversation.id,
            conversation: conversation
        };
        
    } finally {
        reader.releaseLock();
    }
}

/**
 * 创建推理内容容器
 * @param {string} reasoning - 推理内容
 * @returns {HTMLElement} 推理容器元素
 */
function createReasoningContainer(reasoning) {
    const reasoningContainer = Utils.createElement('div', 'ai-reasoning-container');
    const reasoningHeader = Utils.createElement('div', 'ai-reasoning-header');
    const reasoningToggle = Utils.createElement('button', 'ai-reasoning-toggle', {
        type: 'button'
    }, '🧠 查看思维过程');
      const reasoningContent = Utils.createElement('div', 'ai-reasoning-content');
    reasoningContent.style.display = 'none';
    const reasoningText = reasoning || '';
    reasoningContent.innerHTML = renderMarkdown(reasoningText);
    
    // 切换显示/隐藏推理内容
    reasoningToggle.addEventListener('click', () => {
        const isVisible = reasoningContent.style.display !== 'none';
        reasoningContent.style.display = isVisible ? 'none' : 'block';
        reasoningToggle.textContent = `🧠 ${isVisible ? I18n.getMessage('hideThinking', '隐藏思维过程') : I18n.getMessage('showThinking', '查看思维过程')}`;
    });
    
    reasoningHeader.appendChild(reasoningToggle);
    reasoningContainer.appendChild(reasoningHeader);
    reasoningContainer.appendChild(reasoningContent);
      return reasoningContainer;
}

/**
 * 设置默认的国际化文本
 */
function setDefaultI18nTexts() {
    // 如果AI配置还没有快速提示词，设置默认的国际化版本
    if (!aiConfig.quickPrompts || aiConfig.quickPrompts.length === 0) {
        aiConfig.quickPrompts = [
            I18n.getMessage('defaultPrompt1', '帮我总结这段内容'),
            I18n.getMessage('defaultPrompt2', '翻译成中文'),
            I18n.getMessage('defaultPrompt3', '优化这段文字'),
            I18n.getMessage('defaultPrompt4', '写一个关于这个主题的大纲')
        ];
    }
    
    // 如果AI配置还没有系统提示，设置默认的国际化版本
    if (!aiConfig.systemPrompt) {
        aiConfig.systemPrompt = I18n.getMessage('defaultSystemPrompt', '你是一个智能助手，请用简洁友好的语言回答用户的问题。');
    }
}

