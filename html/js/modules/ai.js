/**
 * AI助手模块
 * 负责AI功能的管理和交互
 * @module AI
 */
import { I18n, Utils, Menu, Notification, IconManager } from './core/index.js';
// AI配置相关变量
let aiConfig = {
    enabled: false,
    providers: [
        {
            name: 'DeepSeek',
            apiUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
            isDefault: true
        },
        {
            name: 'OpenAI',
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            model: 'gpt-3.5-turbo',
            isDefault: false
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
export const AI = {
    /**
     * 初始化AI模块
     * @returns {Promise<void>} 无
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
     * @returns {Object} AI配置对象
     */
    getConfig() {
        return { ...aiConfig };
    },

    /**
     * 更新AI配置
     * @param {Object} newConfig 新的配置
     * @returns {Promise<boolean>} 操作是否成功
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
    async sendMessage(message, conversationId = null, onChunk = null, temporaryProvider = null, temperature = null) {
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

        // 使用临时供应商（如果提供）或默认供应商
        const currentProvider = temporaryProvider || aiConfig.currentProvider || aiConfig.providers[0];
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
                
                // 确定使用的温度值：优先使用传入的temperature，其次使用默认值
                let useTemperature = temperature;
                if (useTemperature === null || useTemperature === undefined) {
                    useTemperature = isDeepSeekReasoner ? undefined : 1.0; // 默认温度改为1.0
                }
                
                // 构建请求体，添加stream参数
                const requestBody = {
                    model: currentProvider.model,
                    messages: apiMessages,
                    max_tokens: isDeepSeekReasoner ? 32000 : 1000,
                    stream: !!onChunk, // 如果有onChunk回调，启用流式
                    temperature: isDeepSeekReasoner ? undefined : useTemperature
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
        
        // 标题和说明
        const title = Utils.createElement('h4', 'quick-prompts-title', {}, I18n.getMessage('quickPromptsManagement', '快速提示词管理'));
        const description = Utils.createElement('p', 'quick-prompts-desc', {}, 
            I18n.getMessage('quickPromptsManageDesc', '管理您的快速提示词，每个提示词可以设置不同的温度参数以适应不同场景'));
        
        // 提示词列表容器
        const promptsList = Utils.createElement('div', 'quick-prompts-list');
        
        // 渲染现有提示词
        const renderPrompts = () => {
            promptsList.innerHTML = '';
            currentPrompts.forEach((prompt, index) => {
                const promptItem = this.createPromptItem(prompt, index, () => {
                    currentPrompts.splice(index, 1);
                    this.updateConfig({ quickPrompts: currentPrompts });
                    renderPrompts();
                }, (updatedPrompt) => {
                    currentPrompts[index] = updatedPrompt;
                    this.updateConfig({ quickPrompts: currentPrompts });
                    renderPrompts();
                });
                promptsList.appendChild(promptItem);
            });
        };
        
        // 添加新提示词按钮
        const addBtn = Utils.createElement('button', 'btn btn-primary btn-small add-prompt-btn', {}, 
            I18n.getMessage('addQuickPrompt', '+ 添加提示词'));
        
        addBtn.addEventListener('click', () => {
            this.showPromptFormModal(null, (newPrompt) => {
                currentPrompts.push(newPrompt);
                this.updateConfig({ quickPrompts: currentPrompts });
                renderPrompts();
            });
        });
        
        // 预设温度说明
        const tempGuide = Utils.createElement('div', 'temperature-guide');
        tempGuide.innerHTML = `
            <h5>${I18n.getMessage('temperatureGuide', '温度设置指南')}</h5>
            <div class="temp-examples">
                <div class="temp-item"><span class="temp-value">0.0</span> - ${I18n.getMessage('tempCode', '代码生成/数学解题')}</div>
                <div class="temp-item"><span class="temp-value">1.0</span> - ${I18n.getMessage('tempAnalysis', '数据抽取/分析')}</div>
                <div class="temp-item"><span class="temp-value">1.3</span> - ${I18n.getMessage('tempGeneral', '通用对话/翻译')}</div>
                <div class="temp-item"><span class="temp-value">1.5</span> - ${I18n.getMessage('tempCreative', '创意写作/诗歌创作')}</div>
            </div>
        `;
        
        container.append(title, description, promptsList, addBtn, tempGuide);
        
        // 初始渲染
        renderPrompts();
        
        return container;
    },

    /**
     * 创建单个提示词项目
     * @param {Object} prompt - 提示词对象
     * @param {number} index - 索引
     * @param {Function} onDelete - 删除回调
     * @param {Function} onUpdate - 更新回调
     * @returns {HTMLElement} 提示词项目元素
     */
    createPromptItem(prompt, index, onDelete, onUpdate) {
        const item = Utils.createElement('div', 'prompt-item');
        
        const content = Utils.createElement('div', 'prompt-content');
        const text = Utils.createElement('div', 'prompt-text', {}, prompt.text || prompt);
        const meta = Utils.createElement('div', 'prompt-meta');
        
        // 温度显示
        const tempDisplay = Utils.createElement('span', 'temp-display', {}, 
            `${I18n.getMessage('temperature', '温度')}: ${prompt.temperature ?? 1.0}`);
        
        // 分类显示
        const categoryDisplay = Utils.createElement('span', 'category-display', {}, 
            this.getCategoryDisplayName(prompt.category || 'general'));
        
        meta.append(tempDisplay, categoryDisplay);
        content.append(text, meta);
        
        const actions = Utils.createElement('div', 'prompt-actions');
        const editBtn = Utils.createElement('button', 'btn btn-sm btn-secondary edit-prompt-btn', {}, 
            I18n.getMessage('edit', '编辑'));
        const deleteBtn = Utils.createElement('button', 'btn btn-sm btn-danger delete-prompt-btn', {}, 
            I18n.getMessage('delete', '删除'));
        
        editBtn.addEventListener('click', () => {
            this.showPromptFormModal(prompt, onUpdate);
        });
        
        deleteBtn.addEventListener('click', () => {
            if (confirm(I18n.getMessage('confirmDeletePrompt', '确定要删除这个提示词吗？'))) {
                onDelete();
            }
        });
        
        actions.append(editBtn, deleteBtn);
        item.append(content, actions);
        
        return item;
    },

    /**
     * 获取分类显示名称
     * @param {string} category - 分类
     * @returns {string} 显示名称
     */
    getCategoryDisplayName(category) {
        const categoryNames = {
            'code': I18n.getMessage('categoryCode', '代码'),
            'math': I18n.getMessage('categoryMath', '数学'),
            'analysis': I18n.getMessage('categoryAnalysis', '分析'),
            'general': I18n.getMessage('categoryGeneral', '通用'),
            'translation': I18n.getMessage('categoryTranslation', '翻译'),
            'creative': I18n.getMessage('categoryCreative', '创意')
        };
        return categoryNames[category] || category;
    },

    /**
     * 显示提示词表单模态框
     * @param {Object} prompt - 现有提示词（编辑时）
     * @param {Function} onSave - 保存回调
     */
    showPromptFormModal(prompt = null, onSave) {
        const isEditing = prompt !== null;
        const title = isEditing ? 
            I18n.getMessage('editQuickPrompt', '编辑快速提示词') : 
            I18n.getMessage('addQuickPrompt', '添加快速提示词');
        
        const formItems = [
            {
                type: 'text',
                id: 'prompt-text',
                label: I18n.getMessage('promptText', '提示词内容'),
                value: isEditing ? (prompt.text || prompt) : '',
                placeholder: I18n.getMessage('promptTextPlaceholder', '例如：帮我总结这段内容'),
                required: true
            },
            {
                type: 'range',
                id: 'prompt-temperature',
                label: I18n.getMessage('promptTemperature', '温度设置'),
                value: isEditing ? (prompt.temperature ?? 1.0) : 1.0,
                min: 0,
                max: 2,
                step: 0.1,
                unit: '',
                description: I18n.getMessage('temperatureDesc', '控制回答的创造性：0.0最保守，2.0最创新'),
                showValue: true // 显示当前值
            },
            {
                type: 'select',
                id: 'prompt-category',
                label: I18n.getMessage('promptCategory', '场景分类'),
                value: isEditing ? (prompt.category || 'general') : 'general',
                options: [
                    { value: 'code', text: I18n.getMessage('categoryCode', '代码') + ' (' + I18n.getMessage('recommendedTemp', '推荐温度') + ': 0.0)' },
                    { value: 'math', text: I18n.getMessage('categoryMath', '数学') + ' (' + I18n.getMessage('recommendedTemp', '推荐温度') + ': 0.0)' },
                    { value: 'analysis', text: I18n.getMessage('categoryAnalysis', '分析') + ' (' + I18n.getMessage('recommendedTemp', '推荐温度') + ': 1.0)' },
                    { value: 'general', text: I18n.getMessage('categoryGeneral', '通用') + ' (' + I18n.getMessage('recommendedTemp', '推荐温度') + ': 1.3)' },
                    { value: 'translation', text: I18n.getMessage('categoryTranslation', '翻译') + ' (' + I18n.getMessage('recommendedTemp', '推荐温度') + ': 1.3)' },
                    { value: 'creative', text: I18n.getMessage('categoryCreative', '创意') + ' (' + I18n.getMessage('recommendedTemp', '推荐温度') + ': 1.5)' }
                ],
                description: I18n.getMessage('categoryDesc', '选择使用场景，会自动推荐合适的温度值'),
                onchange: (event) => {
                    const selectedValue = event.target.value;
                    // 自动设置推荐温度
                    const tempInput = document.getElementById('prompt-temperature');
                    if (tempInput) {
                        const recommendedTemps = {
                            'code': 0.0,
                            'math': 0.0,
                            'analysis': 1.0,
                            'general': 1.3,
                            'translation': 1.3,
                            'creative': 1.5
                        };
                        // 修复：使用 !== undefined 而不是 || 运算符，避免0.0被当作falsy值
                        const recommendedTemp = recommendedTemps[selectedValue] !== undefined ? recommendedTemps[selectedValue] : 1.0;
                        
                        // 确保DOM完全准备好后设置值
                        setTimeout(() => {
                            // 设置滑块的值
                            tempInput.value = recommendedTemp;
                            
                            // 优先使用存储的更新显示函数
                            if (tempInput._updateDisplay && typeof tempInput._updateDisplay === 'function') {
                                tempInput._updateDisplay();
                            }
                            
                            // 如果有值显示元素，也更新它
                            if (tempInput._valueDisplay) {
                                tempInput._valueDisplay.textContent = recommendedTemp.toFixed(1);
                            }
                            
                            // 触发input和change事件确保所有监听器都能响应
                            const inputEvent = new Event('input', { 
                                bubbles: true, 
                                cancelable: true 
                            });
                            tempInput.dispatchEvent(inputEvent);
                            
                            const changeEvent = new Event('change', { 
                                bubbles: true, 
                                cancelable: true 
                            });
                            tempInput.dispatchEvent(changeEvent);
                            
                            // 添加调试日志
                            console.log(`分类切换到 ${selectedValue}，推荐温度设置为: ${recommendedTemp}`);
                        }, 100); // 增加延迟时间确保DOM完全准备好
                    }
                }
            }
        ];

        Menu.showFormModal(
            title,
            formItems,
            (formData) => {
                const newPrompt = {
                    text: formData['prompt-text'].trim(),
                    temperature: parseFloat(formData['prompt-temperature']),
                    category: formData['prompt-category']
                };
                
                if (!newPrompt.text) {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('promptTextRequired', '请输入提示词内容'),
                        type: 'error',
                        duration: 3000
                    });
                    return false;
                }
                
                onSave(newPrompt);
                
                Notification.notify({
                    title: I18n.getMessage('success', '成功'),
                    message: isEditing ? 
                        I18n.getMessage('promptUpdated', '提示词已更新') : 
                        I18n.getMessage('promptAdded', '提示词已添加'),
                    type: 'success',
                    duration: 2000
                });
                
                return true;
            },
            I18n.getMessage('save', '保存'),
            I18n.getMessage('cancel', '取消')
        );
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
        this.showProviderFormModal();
    },

    /**
     * 通用的供应商表单模态框
     * @param {Object} provider - 供应商对象（编辑时使用）
     * @param {number} index - 供应商索引（编辑时使用）
     */
    showProviderFormModal(provider = null, index = null) {
        const isEditing = provider !== null;
        const prefix = isEditing ? 'edit' : 'add';
        
        // 当前表单状态
        const currentFormState = {
            models: [],
            fetching: false,
            error: null,
            selectedModel: isEditing ? (provider.model || '') : ''
        };

        /**
         * 创建获取模型功能的自定义字段
         * @param {string} idPrefix - ID前缀
         * @returns {Object} 自定义字段配置
         */
        const createModelFetchSection = (idPrefix) => ({
            type: 'custom',
            id: `${idPrefix}-fetch-models-section`,
            render: (container) => {
                const sectionContainer = Utils.createElement('div', 'fetch-models-section');
                
                // 标签
                const label = Utils.createElement('label', 'form-label', {}, I18n.getMessage('providerModel', '模型名称'));
                sectionContainer.appendChild(label);
                
                // 按钮容器
                const btnContainer = Utils.createElement('div', 'fetch-models-container');
                
                // 创建获取模型按钮
                const fetchBtn = Utils.createElement('button', 'fetch-models-btn btn btn-secondary', {
                    type: 'button'
                }, I18n.getMessage('fetchModels', '获取可用模型'));
                
                // 状态显示
                const statusContainer = Utils.createElement('div', 'fetch-models-status');
                
                btnContainer.appendChild(fetchBtn);
                btnContainer.appendChild(statusContainer);
                sectionContainer.appendChild(btnContainer);
                
                // 模型选择下拉框
                const modelSelectContainer = Utils.createElement('div', 'model-select-container');
                const modelSelect = Utils.createElement('select', 'form-select', {
                    id: `${idPrefix}-provider-model`,
                    name: `${idPrefix}-provider-model`,
                    disabled: true
                });
                
                // 默认选项
                const defaultOption = Utils.createElement('option', '', {
                    value: '',
                    disabled: true,
                    selected: true
                }, I18n.getMessage('selectModel', '请先获取模型列表'));
                modelSelect.appendChild(defaultOption);
                
                modelSelectContainer.appendChild(modelSelect);
                sectionContainer.appendChild(modelSelectContainer);
                
                // 手动输入选项
                const manualInputContainer = Utils.createElement('div', 'manual-input-container');
                const manualLabel = Utils.createElement('label', 'form-label small', {}, I18n.getMessage('orManualInput', '或手动输入模型名称:'));
                const manualInput = Utils.createElement('input', 'form-input', {
                    type: 'text',
                    id: `${idPrefix}-provider-model-manual`,
                    placeholder: '例如：deepseek-chat、gpt-3.5-turbo',
                    value: isEditing ? (provider.model || '') : ''
                });
                
                manualInputContainer.appendChild(manualLabel);
                manualInputContainer.appendChild(manualInput);
                sectionContainer.appendChild(manualInputContainer);
                
                container.appendChild(sectionContainer);
                
                // 绑定获取模型事件
                fetchBtn.addEventListener('click', async () => {
                    const urlInput = document.getElementById(`${idPrefix}-provider-api-url`);
                    const keyInput = document.getElementById(`${idPrefix}-provider-api-key`);
                    
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
                        
                        // 添加默认选项
                        const emptyOption = Utils.createElement('option', '', {
                            value: '',
                            disabled: true,
                            selected: true
                        }, I18n.getMessage('selectModel', '请选择一个模型'));
                        modelSelect.appendChild(emptyOption);
                        
                        models.forEach(model => {
                            const option = Utils.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            // 编辑时如果当前模型在列表中，选中它
                            if (isEditing && model === provider.model) {
                                option.selected = true;
                            }
                            modelSelect.appendChild(option);
                        });
                        
                        // 如果是编辑且当前模型在列表中，选中它
                        if (isEditing && provider.model && models.includes(provider.model)) {
                            modelSelect.value = provider.model;
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
                
                // 监听模型选择变化，同步到手动输入框
                modelSelect.addEventListener('change', () => {
                    if (modelSelect.value) {
                        manualInput.value = modelSelect.value;
                        currentFormState.selectedModel = modelSelect.value;
                    }
                });
                
                // 监听手动输入变化，清空下拉框选择
                manualInput.addEventListener('input', () => {
                    if (manualInput.value.trim()) {
                        modelSelect.value = '';
                        currentFormState.selectedModel = manualInput.value.trim();
                    }
                });
            }
        });

        /**
         * 创建自动获取模型的onchange处理函数
         * @param {string} targetInputId - 目标输入框ID
         * @returns {Function} onchange处理函数
         */
        const createAutoFetchHandler = (targetInputId) => {
            return function(e) {
                const currentValue = e.target.value.trim();
                const targetInput = document.getElementById(targetInputId);
                const targetValue = targetInput ? targetInput.value.trim() : '';
                
                if (currentValue && targetValue) {
                    // 触发自动获取模型列表，但需要短暂延迟以避免频繁请求
                    setTimeout(() => {
                        document.querySelector('.fetch-models-btn')?.click();
                    }, 500);
                }
            };
        };

        const formItems = [
            {
                type: 'text',
                id: `${prefix}-provider-name`,
                label: I18n.getMessage('providerName', 'AI供应商名称'),
                value: isEditing ? provider.name : '',
                placeholder: '例如：DeepSeek、OpenAI',
                required: true
            },
            {
                type: 'url',
                id: `${prefix}-provider-api-url`,
                label: I18n.getMessage('providerApiUrl', 'API地址'),
                value: isEditing ? provider.apiUrl : '',
                placeholder: 'https://api.deepseek.com/v1',
                required: true,
                onchange: createAutoFetchHandler(`${prefix}-provider-api-key`)
            },
            {
                type: 'password-toggle',
                id: `${prefix}-provider-api-key`,
                label: I18n.getMessage('providerApiKey', 'API密钥'),
                value: isEditing ? (provider.apiKey || '') : '',
                placeholder: 'sk-...',
                required: true,
                onchange: createAutoFetchHandler(`${prefix}-provider-api-url`)
            },
            createModelFetchSection(prefix),
            {
                type: 'url',
                id: `${prefix}-provider-icon`,
                label: I18n.getMessage('providerIconUrl', '图标URL（可选）'),
                value: isEditing ? (provider.iconUrl || '') : '',
                placeholder: 'https://example.com/icon.png',
                required: false
            }
        ];

        const title = isEditing 
            ? `${I18n.getMessage('editProvider', '编辑AI供应商')} - ${provider.name}`
            : I18n.getMessage('addCustomAIProvider', '添加自定义AI供应商');

        const submitButtonText = isEditing 
            ? I18n.getMessage('save', '保存')
            : I18n.getMessage('add', '添加');

        Menu.showFormModal(
            title,
            formItems,
            async (formData) => {
                const name = formData[`${prefix}-provider-name`];
                const apiUrl = formData[`${prefix}-provider-api-url`];
                const apiKey = formData[`${prefix}-provider-api-key`];
                const iconUrl = formData[`${prefix}-provider-icon`];
                
                // 获取模型名称：优先使用手动输入，其次使用下拉框选择
                const manualModel = document.getElementById(`${prefix}-provider-model-manual`)?.value.trim();
                const selectedModel = document.getElementById(`${prefix}-provider-model`)?.value;
                const model = manualModel || selectedModel;
                
                if (!model) {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('pleaseSelectOrInputModel', '请选择或输入一个模型名称'),
                        type: 'error',
                        duration: 3000
                    });
                    return false; // 阻止表单提交
                }
                
                const config = this.getConfig();
                const providers = [...config.providers];
                
                // 检查供应商名称是否重复
                const existingProvider = providers.find((p, i) => {
                    if (isEditing && i === index) return false; // 排除当前编辑的供应商
                    return p.name.toLowerCase() === name.toLowerCase();
                });
                
                if (existingProvider) {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('providerNameExists', '该供应商名称已存在，请使用其他名称'),
                        type: 'error',
                        duration: 3000
                    });
                    return false; // 阻止表单提交
                }
                
                const providerData = {
                    name,
                    apiUrl,
                    apiKey,
                    model,
                    iconUrl: iconUrl || '',
                    isDefault: isEditing ? provider.isDefault : false
                };
                
                let updateConfig = { providers };
                let successMessage, errorMessage;
                
                if (isEditing) {
                    // 编辑供应商
                    const updatedProvider = { ...provider, ...providerData };
                    providers[index] = updatedProvider;
                    
                    // 如果编辑的是当前供应商，更新当前供应商配置
                    if (config.currentProvider && config.currentProvider.name === provider.name) {
                        updateConfig.currentProvider = updatedProvider;
                    }
                    
                    successMessage = I18n.getMessage('updateProviderSuccess', 'AI供应商更新成功');
                    errorMessage = I18n.getMessage('updateProviderError', '更新AI供应商失败');
                } else {
                    // 添加供应商
                    providers.push(providerData);
                    successMessage = I18n.getMessage('addProviderSuccess', 'AI供应商添加成功');
                    errorMessage = I18n.getMessage('addProviderError', '添加AI供应商失败');
                }
                
                const success = await this.updateConfig(updateConfig);
                if (success) {
                    this.refreshProviderListControl();
                    Notification.notify({
                        title: I18n.getMessage('success', '成功'),
                        message: successMessage,
                        type: 'success',
                        duration: 2000
                    });
                } else {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: errorMessage,
                        type: 'error',
                        duration: 3000
                    });
                }
            },
            submitButtonText,
            I18n.getMessage('cancel', '取消')
        );
    },

    /**
     * 显示编辑供应商模态框
     * @param {Object} provider - 供应商对象
     * @param {number} index - 供应商索引
     */
    showEditProviderModal(provider, index) {
        this.showProviderFormModal(provider, index);
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
        
        console.log(`标题生成检查 - 轮数: ${roundCount}, 是否需要生成: ${shouldGenerateTitle}, 配置间隔: ${config.updateInterval}`);
        
        if (!shouldGenerateTitle) {
            return;
        }
        
        // 构建标题生成的上下文
        const context = buildTitleContext(conversation);
        console.log('标题生成上下文:', context.substring(0, 200) + '...');
        
        // 调用AI生成标题
        const generatedTitle = await generateTitleWithAI(context, config.maxTokensForTitle);
        
        if (generatedTitle && generatedTitle.trim()) {
            conversation.title = generatedTitle.trim();
            console.log(`对话 ${conversation.id} 标题已更新为: ${conversation.title}`);
        } else {
            console.warn('AI返回的标题为空，使用降级处理');
            // 降级处理：使用用户问题作为标题
            conversation.title = latestMessage.length > 50 ? latestMessage.substring(0, 50) + '...' : latestMessage;
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
    // 选择适合标题生成的供应商：避免使用推理模型，优先选择快速、便宜的模型
    let titleProvider = null;
    
    // 首先尝试找到非推理模型
    const nonReasoningProviders = aiConfig.providers.filter(provider => {
        if (!provider.apiKey || !provider.model) return false;
        
        // 检查是否为推理模型（通过模型名称判断）
        const modelName = provider.model.toLowerCase();
        const isReasoningModel = /reason|think|o[13]|deepseek[-_]?reasoner/i.test(modelName);
        return !isReasoningModel;
    });
    
    if (nonReasoningProviders.length > 0) {
        // 优先选择 gpt-3.5-turbo 或 deepseek-chat 等快速模型
        titleProvider = nonReasoningProviders.find(p => 
            /gpt-3\.5|deepseek-chat|claude-3-haiku|gemini.*flash/i.test(p.model)
        ) || nonReasoningProviders[0];
    } else {
        // 如果没有非推理模型，使用当前供应商但警告用户
        titleProvider = aiConfig.currentProvider || aiConfig.providers[0];
        console.warn('标题生成：未找到合适的非推理模型，将使用当前模型，可能消耗较多token');
    }
    
    if (!titleProvider || !titleProvider.apiUrl || !titleProvider.apiKey) {
        throw new Error('AI配置不完整，无法生成标题');
    }
    
    console.log(`标题生成使用模型: ${titleProvider.name} - ${titleProvider.model}`);
    
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
    const apiUrl = titleProvider.apiUrl.trim();
    
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
        model: titleProvider.model,
        messages: messages,
        max_tokens: Math.min(maxTokens, 100), // 标题生成限制更少的token
        temperature: 0.3, // 较低的temperature以获得更稳定的结果
        stream: false
    };
    
    const response = await fetch(chatUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${titleProvider.apiKey}`
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
    
    // 供应商选择器容器（标题旁边）
    const providerSwitcherContainer = Utils.createElement('div', 'ai-provider-switcher-container');
    
    // 创建供应商选择器
    const providerSelect = Utils.createElement('select', 'ai-provider-select', {
        title: I18n.getMessage('switchProvider', '切换AI供应商')
    });
    
    // 当前选中的供应商和模型（用于对话中的临时切换）
    let currentSelectedProvider = aiConfig.currentProvider || aiConfig.providers[0];
    let currentSelectedModel = currentSelectedProvider?.model || '';
    
    // 获取有效的供应商（有API密钥的）
    function getValidProviders() {
        return aiConfig.providers.filter(provider => 
            provider.apiKey && provider.apiKey.trim() !== ''
        );
    }
    
    // 填充供应商选择器（只显示有API密钥的）
    function populateProviderSelect() {
        providerSelect.innerHTML = '';
        const validProviders = getValidProviders();
        
        if (validProviders.length === 0) {
            const noProviderOption = Utils.createElement('option', '', {
                disabled: true
            }, I18n.getMessage('noValidProviders', '无可用供应商'));
            providerSelect.appendChild(noProviderOption);
            providerSelect.disabled = true;
            return;
        }
        
        providerSelect.disabled = false;
        validProviders.forEach((provider, index) => {
            const realIndex = aiConfig.providers.findIndex(p => p.name === provider.name);
            const option = Utils.createElement('option', '', {
                value: realIndex
            }, provider.name);
            
            if (provider.name === currentSelectedProvider.name) {
                option.selected = true;
            }
            
            providerSelect.appendChild(option);
        });
    }
    
    // 供应商切换事件
    providerSelect.addEventListener('change', async () => {
        const selectedIndex = parseInt(providerSelect.value);
        currentSelectedProvider = aiConfig.providers[selectedIndex];
        // 切换供应商时默认选中其配置中的模型
        currentSelectedModel = currentSelectedProvider?.model || '';
        setTriggerModelText(currentSelectedModel);
        // 更新模型面板
        await refreshModelList(currentSelectedProvider);
    });
    
    // 初始化供应商选择器
    populateProviderSelect();
    
    providerSwitcherContainer.appendChild(providerSelect);
    
    const closeBtn = Utils.createElement('span', 'modal-close', {}, '&times;');
    chatHeader.append(chatTitle, providerSwitcherContainer, closeBtn);
    
    // 对话内容区域
    const chatContainer = Utils.createElement('div', 'ai-chat-container');
    const chatHistory = Utils.createElement('div', 'ai-chat-history', { id: 'ai-chat-history' });
    
    // 底部输入区域
    const inputArea = Utils.createElement('div', 'ai-input-area');
    
    // 模型选择器区域（左下角）
    const modelSwitcherContainer = Utils.createElement('div', 'ai-model-switcher-container');
    
    // 自定义模型下拉组件
    const modelDropdown = Utils.createElement('div', 'ai-model-dropdown');
    const modelTrigger = Utils.createElement('button', 'ai-model-trigger', {
        type: 'button',
        title: I18n.getMessage('switchModel', '切换AI模型')
    });
    
    const modelPanel = Utils.createElement('div', 'ai-model-panel hidden');
    const panelHeader = Utils.createElement('div', 'ai-model-panel-header');
    const modelSearch = Utils.createElement('input', 'ai-model-search', {
        type: 'search',
        placeholder: I18n.getMessage('searchOrInputModel', '搜索模型或直接输入模型ID...')
    });
    const panelRefreshBtn = Utils.createElement('button', 'ai-model-panel-refresh', {
        type: 'button',
        title: I18n.getMessage('refreshModels', '刷新模型列表')
    }, '🔄');
    const searchUseBtn = Utils.createElement('button', 'ai-model-search-use', {
        type: 'button',
        title: I18n.getMessage('useInputModel', '使用输入的模型')
    }, '✓');
    panelHeader.append(modelSearch, searchUseBtn, panelRefreshBtn);
    
    const recentWrap = Utils.createElement('div', 'ai-model-recent-wrap');
    const recentTitle = Utils.createElement('div', 'ai-model-recent-title', {}, I18n.getMessage('recentModels', '最近使用'));
    const recentContainer = Utils.createElement('div', 'ai-model-recent');
    recentWrap.append(recentTitle, recentContainer);
    
    const modelList = Utils.createElement('div', 'ai-model-list');
    
    modelPanel.append(panelHeader, recentWrap, modelList);
    modelDropdown.append(modelTrigger, modelPanel);
    
    // 状态与持久化（最近模型）
    const RECENT_MODELS_KEY = 'aiRecentModels';
    function getRecentModels(providerName) {
        try {
            const all = JSON.parse(localStorage.getItem(RECENT_MODELS_KEY) || '{}');
            return Array.isArray(all[providerName]) ? all[providerName] : [];
        } catch { return []; }
    }
    function pushRecentModel(providerName, model) {
        try {
            const all = JSON.parse(localStorage.getItem(RECENT_MODELS_KEY) || '{}');
            const list = Array.isArray(all[providerName]) ? all[providerName] : [];
            const next = [model, ...list.filter(m => m !== model)].slice(0, 6);
            all[providerName] = next;
            localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(all));
        } catch {}
    }
    
    function setTriggerModelText(model) {
        modelTrigger.dataset.model = model || '';
        modelTrigger.innerHTML = `
            <span class="model-trigger-label">${I18n.getMessage('currentModel', '当前模型')}:</span>
            <span class="model-trigger-name">${model || '-'}</span>
            <span class="model-trigger-chevron">▾</span>
        `;
    }
    
    async function refreshModelList(provider) {
        modelList.innerHTML = '';
        recentContainer.innerHTML = '';
        const loading = Utils.createElement('div', 'ai-model-loading', {}, I18n.getMessage('loadingModels', '正在加载模型列表...'));
        modelList.appendChild(loading);
        try {
            const models = await AI.getModels(provider.apiUrl, provider.apiKey);
            // 渲染最近使用
            const recents = getRecentModels(provider.name).filter(m => models.includes(m));
            if (recents.length) {
                recents.forEach(m => {
                    const chip = Utils.createElement('button', 'ai-model-chip', { type: 'button' }, m);
                    if (m === currentSelectedModel) chip.classList.add('active');
                    chip.addEventListener('click', () => chooseModel(m));
                    recentContainer.appendChild(chip);
                });
                recentWrap.style.display = '';
            } else {
                recentWrap.style.display = 'none';
            }
            // 渲染全部
            modelList.innerHTML = '';
            models.forEach(m => {
                const item = Utils.createElement('button', 'ai-model-item', { type: 'button' });
                const name = Utils.createElement('span', 'model-name', {}, m);
                const caps = Utils.createElement('span', 'model-badges');
                // 简单能力徽标
                if (/reason|o3|think|deepseek\-reasoner/i.test(m)) {
                    const b = Utils.createElement('span', 'badge badge-reason', {}, '🧠');
                    caps.appendChild(b);
                }
                if (/gpt|claude|llama|gemini|deepseek/i.test(m)) {
                    const b = Utils.createElement('span', 'badge badge-chat', {}, '💬');
                    caps.appendChild(b);
                }
                if (m === currentSelectedModel) item.classList.add('active');
                item.append(name, caps);
                item.addEventListener('click', () => chooseModel(m));
                modelList.appendChild(item);
            });
        } catch (err) {
            modelList.innerHTML = '';
            const errEl = Utils.createElement('div', 'ai-model-error', {}, I18n.getMessage('loadModelsError', '加载模型失败'));
            modelList.appendChild(errEl);
            console.warn('加载模型失败:', err);
        }
    }
    
    function chooseModel(model) {
        currentSelectedModel = model;
        setTriggerModelText(model);
        pushRecentModel(currentSelectedProvider.name, model);
        // 更新活动态
        modelList.querySelectorAll('.ai-model-item').forEach(el => {
            el.classList.toggle('active', el.querySelector('.model-name')?.textContent === model);
        });
        recentContainer.querySelectorAll('.ai-model-chip').forEach(el => {
            el.classList.toggle('active', el.textContent === model);
        });
        // 关闭面板
        modelPanel.classList.add('hidden');
        modelTrigger.classList.remove('open');
    }
    
    // 触发器与面板交互
    modelTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = modelPanel.classList.contains('hidden');
        
        // 关闭所有其他面板
        document.querySelectorAll('.ai-model-panel').forEach(p => p.classList.add('hidden'));
        document.querySelectorAll('.ai-model-trigger').forEach(t => t.classList.remove('open'));
        
        if (willOpen) {
            // 计算触发器位置，使面板显示在触发器下方
            const rect = modelTrigger.getBoundingClientRect();
            const panelHeight = 360; // 面板最大高度
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom - 10; // 触发器下方剩余空间
            const spaceAbove = rect.top - 10; // 触发器上方空间
            
            // 决定面板显示位置：优先显示在下方，空间不足时显示在上方
            if (spaceBelow >= Math.min(panelHeight, 200) || spaceBelow >= spaceAbove) {
                // 显示在下方
                modelPanel.style.left = `${rect.left}px`;
                modelPanel.style.top = `${rect.bottom + 6}px`;
                modelPanel.style.bottom = 'auto';
                modelPanel.style.maxHeight = `${Math.min(panelHeight, spaceBelow)}px`;
            } else {
                // 显示在上方
                modelPanel.style.left = `${rect.left}px`;
                modelPanel.style.top = 'auto';
                modelPanel.style.bottom = `${viewportHeight - rect.top + 6}px`;
                modelPanel.style.maxHeight = `${Math.min(panelHeight, spaceAbove)}px`;
            }
            
            // 确保面板不会超出屏幕右边界
            const panelWidth = 360;
            if (rect.left + panelWidth > window.innerWidth - 10) {
                modelPanel.style.left = `${window.innerWidth - panelWidth - 10}px`;
            }
            
            modelPanel.classList.remove('hidden');
            modelTrigger.classList.add('open');
        }
    });
    document.addEventListener('click', () => {
        modelPanel.classList.add('hidden');
        modelTrigger.classList.remove('open');
    });
    
    // 窗口大小改变时重新计算位置
    window.addEventListener('resize', () => {
        if (!modelPanel.classList.contains('hidden')) {
            // 重新触发位置计算
            modelTrigger.click();
            modelTrigger.click();
        }
    });
    
    modelPanel.addEventListener('click', (e) => e.stopPropagation());
    
    // 搜索过滤和手动输入的组合功能
    modelSearch.addEventListener('input', () => {
        const q = modelSearch.value.trim().toLowerCase();
        
        // 显示/隐藏使用按钮
        if (q) {
            searchUseBtn.style.display = 'flex';
        } else {
            searchUseBtn.style.display = 'none';
        }
        
        // 过滤模型列表
        modelList.querySelectorAll('.ai-model-item').forEach(item => {
            const name = item.querySelector('.model-name')?.textContent.toLowerCase() || '';
            item.style.display = name.includes(q) ? '' : 'none';
        });
    });
    
    // 使用搜索框中输入的模型
    searchUseBtn.addEventListener('click', () => {
        const val = modelSearch.value.trim();
        if (val) {
            chooseModel(val);
            modelSearch.value = ''; // 清空搜索框
            searchUseBtn.style.display = 'none';
        }
    });
    
    // 支持回车键快速使用
    modelSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = modelSearch.value.trim();
            if (val) {
                chooseModel(val);
                modelSearch.value = '';
                searchUseBtn.style.display = 'none';
            }
        }
    });
    
    // 刷新按钮
    panelRefreshBtn.addEventListener('click', async () => {
        panelRefreshBtn.disabled = true;
        panelRefreshBtn.textContent = '⏳';
        try { await refreshModelList(currentSelectedProvider); }
        finally { panelRefreshBtn.disabled = false; panelRefreshBtn.textContent = '🔄'; }
    });
    
    // 初始化触发器文案
    setTriggerModelText(currentSelectedModel);
    
    modelSwitcherContainer.appendChild(modelDropdown);
    
    // 快速提示词
    const quickPromptsContainer = Utils.createElement('div', 'ai-quick-prompts');
    
    // 存储当前选中的温度设置和提示词状态
    let currentTemperature = 1.0;
    let lastPromptContent = null; // 记录最后一次由提示词设置的内容
    let userModifiedContent = false; // 标记用户是否修改了内容
    let originalUserContent = ''; // 记录用户点击提示词前的原始内容
    
    // 获取分类显示名称的本地函数
    function getCategoryDisplayName(category) {
        const categoryNames = {
            'code': I18n.getMessage('categoryCode', '代码'),
            'math': I18n.getMessage('categoryMath', '数学'),
            'analysis': I18n.getMessage('categoryAnalysis', '分析'),
            'general': I18n.getMessage('categoryGeneral', '通用'),
            'translation': I18n.getMessage('categoryTranslation', '翻译'),
            'creative': I18n.getMessage('categoryCreative', '创意')
        };
        return categoryNames[category] || category;
    }
    
    aiConfig.quickPrompts.forEach(prompt => {
        // 兼容新旧格式
        const promptText = typeof prompt === 'string' ? prompt : prompt.text;
        const promptTemp = typeof prompt === 'object' ? (prompt.temperature ?? 1.0) : 1.0;
        const promptCategory = typeof prompt === 'object' ? prompt.category : 'general';
        
        const promptBtn = Utils.createElement('button', 'ai-quick-prompt-btn', {
            'data-temperature': promptTemp,
            'data-category': promptCategory,
            title: `${I18n.getMessage('temperature', '温度')}: ${promptTemp} | ${getCategoryDisplayName(promptCategory)}`
        });
        
        // 按钮内容：提示词文本 + 温度标签
        const textSpan = Utils.createElement('span', 'prompt-text', {}, promptText);
        const tempSpan = Utils.createElement('span', 'prompt-temp', {}, promptTemp);
        promptBtn.append(textSpan, tempSpan);
        
        promptBtn.addEventListener('click', () => {
            const inputTextarea = document.getElementById('ai-input');
            const currentValue = inputTextarea.value.trim();
            
            // 检查是否已经选中该提示词（再次点击取消逻辑）
            const isCurrentlyActive = promptBtn.classList.contains('active');
            
            if (isCurrentlyActive) {
                // 再次点击：取消选中，恢复默认温度
                promptBtn.classList.remove('active');
                currentTemperature = 1.0; // 恢复默认温度
                
                // 智能恢复逻辑：当有原始用户内容时提示手动删除，不自动覆盖
                if (originalUserContent) {
                    // 如果有原始用户内容，不自动恢复，而是提示用户手动处理
                    console.log(`检测到原始用户内容: ${originalUserContent}，保持当前输入框状态，提示用户手动处理`);
                    
                    // 显示提示通知
                    if (typeof Notification !== 'undefined' && Notification.notify) {
                        Notification.notify({
                            title: I18n.getMessage('promptCancelled', '提示词已取消'),
                            message: I18n.getMessage('manualDeleteHint', '如需清空输入框，请手动删除内容'),
                            type: 'info',
                            duration: 3000
                        });
                    }
                } else {
                    // 没有原始用户内容时，进行智能清空判断
                    const shouldClear = lastPromptContent && 
                                      currentValue === lastPromptContent && 
                                      !userModifiedContent;
                    
                    if (shouldClear) {
                        inputTextarea.value = '';
                        console.log(`清空由提示词设置的内容: ${lastPromptContent}`);
                    } else if (currentValue === promptText) {
                        // 如果内容完全等于提示词文本（没有用户输入的额外内容），也清空
                        inputTextarea.value = '';
                        console.log(`清空纯提示词内容: ${promptText}`);
                    } else {
                        console.log(`保留用户修改的内容，不清空`);
                    }
                }
                
                // 重置状态
                lastPromptContent = null;
                userModifiedContent = false;
                originalUserContent = '';
                
                // 更新所有快速提示词按钮的活动状态
                quickPromptsContainer.querySelectorAll('.ai-quick-prompt-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                
                console.log(`取消选中提示词: ${promptText}，温度重置为: ${currentTemperature}`);
            } else {
                // 首次点击：选中提示词，设置温度和内容
                
                // 记录用户的原始内容（点击提示词前的内容）
                originalUserContent = currentValue;
                
                currentTemperature = promptTemp;
                
                // 更新所有快速提示词按钮的活动状态
                quickPromptsContainer.querySelectorAll('.ai-quick-prompt-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                promptBtn.classList.add('active');
                
                // 设置输入内容
                let newContent;
                if (currentValue) {
                    newContent = promptText + ': ' + currentValue;
                } else {
                    newContent = promptText;
                }
                
                inputTextarea.value = newContent;
                lastPromptContent = newContent; // 记录由提示词设置的内容
                userModifiedContent = false; // 重置修改标记
                
                console.log(`选中提示词: ${promptText}，温度设置为: ${currentTemperature}，原始内容: ${originalUserContent}，设置内容: ${newContent}`);
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
    
    // 监听用户输入以追踪内容修改
    inputTextarea.addEventListener('input', () => {
        const currentContent = inputTextarea.value.trim();
        // 如果当前内容与最后一次提示词设置的内容不同，标记为用户修改
        if (lastPromptContent && currentContent !== lastPromptContent) {
            userModifiedContent = true;
            console.log('检测到用户修改内容，标记为已修改');
        }
    });
    
    const sendButton = Utils.createElement('button', 'ai-send-btn', {
        type: 'button',
        title: I18n.getMessage('send', '发送')
    }, '⬆️');
    
    inputContainer.append(inputTextarea, sendButton);
    inputArea.append(modelSwitcherContainer, quickPromptsContainer, inputContainer);
    
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

    // 设置事件监听，传递温度变量访问器
    setupAIModalEvents(modal, inputTextarea, chatHistory, chatTitle, sendButton, newChatBtn, clearAllBtn, conversationsList, () => currentConversationId, (id) => { currentConversationId = id; }, () => currentTemperature);
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
            
            Notification.notify({
                title: I18n.getMessage('confirmDelete', '确认删除'),
                message: I18n.getMessage('confirmDeleteConversation', '确定要删除这个对话吗？'),
                duration: 0,
                type: 'confirm',
                buttons: [
                    {
                        text: I18n.getMessage('confirm', '确认'),
                        class: 'btn-primary confirm-yes',
                        callback: async () => {
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
                    },
                    {
                        text: I18n.getMessage('cancel', '取消'),
                        class: 'confirm-no',
                        callback: () => {}
                    }
                ]
            });
        });
        
        conversationsList.appendChild(convItem);
    });
}

/**
 * 加载对话消息到聊天区域
 */
function loadConversationMessages(chatHistory, conversation) {
    chatHistory.innerHTML = '';
    
    conversation.messages.forEach((msg, index) => {
        const reasoning = msg.reasoning_content; // 获取推理内容
        addMessageToHistory(chatHistory, msg.content, msg.role === 'user' ? 'user' : 'ai', reasoning);
    });
    
    // 确保所有AI消息都有正确的控制按钮
    setTimeout(() => {
        const allAiMessages = chatHistory.querySelectorAll('.ai-message-ai');
        allAiMessages.forEach((messageElement, index) => {
            const controls = messageElement.querySelector('.ai-message-controls');
            if (controls) {
                const isLatestAiMessage = index === allAiMessages.length - 1;
                
                // 清除现有的控制按钮（除了Markdown切换按钮）
                const regenerateBtn = controls.querySelector('.ai-regenerate-btn');
                const newChatBtn = controls.querySelector('.ai-new-chat-btn');
                if (regenerateBtn) regenerateBtn.remove();
                if (newChatBtn) newChatBtn.remove();
                
                // 根据是否是最新消息添加相应的控制按钮
                if (isLatestAiMessage) {
                    addLatestMessageControls(controls, messageElement, chatHistory);
                } else {
                    addNewChatControl(controls, messageElement, chatHistory);
                }
            }
        });
    }, 0);
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
function setupAIModalEvents(modal, inputTextarea, chatHistory, chatTitle, sendButton, newChatBtn, clearAllBtn, conversationsList, getCurrentConversationId, setCurrentConversationId, getCurrentTemperature) {
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
        Notification.notify({
            title: I18n.getMessage('confirmDelete', '确认删除'),
            message: I18n.getMessage('confirmClearAllConversations', '确定要清空所有对话历史吗？此操作不可撤销。'),
            duration: 0,
            type: 'confirm',
            buttons: [
                {
                    text: I18n.getMessage('confirm', '确认'),
                    class: 'btn-primary confirm-yes',
                    callback: async () => {
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
                },
                {
                    text: I18n.getMessage('cancel', '取消'),
                    class: 'confirm-no',
                    callback: () => {}
                }
            ]
        });
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
            // 获取当前选中的供应商和模型
            const providerSwitcher = modal.querySelector('.ai-provider-switcher-container');
            const providerSelect = providerSwitcher?.querySelector('.ai-provider-select');
            const modelSwitcher = modal.querySelector('.ai-model-switcher-container');
            const modelTriggerBtn = modelSwitcher?.querySelector('.ai-model-trigger');
            
            let temporaryProvider = null;
            if (providerSelect && modelTriggerBtn) {
                const selectedProviderIndex = parseInt(providerSelect.value);
                const selectedModel = modelTriggerBtn?.dataset.model;
                
                // 创建临时供应商配置，使用当前选中的模型
                if (selectedProviderIndex >= 0 && selectedProviderIndex < aiConfig.providers.length) {
                    temporaryProvider = {
                        ...aiConfig.providers[selectedProviderIndex],
                        model: selectedModel || aiConfig.providers[selectedProviderIndex].model
                    };
                }
            }
            
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
                }
            }, temporaryProvider, getCurrentTemperature());
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
            
            // 存储原始消息内容到按钮上，方便后续获取
            markdownToggle._originalMessage = finalContent;
            
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
            
            // 添加重新生成和另起新对话按钮
            addLatestMessageControls(controlsContainer, aiMessageElement, chatHistory);
            
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
        
        // 存储原始消息内容到按钮上，方便后续获取
        markdownToggle._originalMessage = originalMessage;
        
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
        
        // 为所有AI消息添加另起新对话按钮，重新生成按钮只给最新的AI消息
        setTimeout(() => {
            const allAiMessages = chatHistory.querySelectorAll('.ai-message-ai');
            const isLatestAiMessage = allAiMessages[allAiMessages.length - 1] === messageElement;
            
            if (isLatestAiMessage) {
                // 最新消息：添加重新生成和另起新对话按钮
                addLatestMessageControls(controlsContainer, messageElement, chatHistory);
            } else {
                // 非最新消息：只添加另起新对话按钮
                addNewChatControl(controlsContainer, messageElement, chatHistory);
            }
        }, 0);
        
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
 * 为最新AI消息添加重新生成和另起新对话控件
 * @param {HTMLElement} controlsContainer - 控制按钮容器
 * @param {HTMLElement} messageElement - 消息元素
 * @param {HTMLElement} chatHistory - 聊天历史容器
 */
function addLatestMessageControls(controlsContainer, messageElement, chatHistory) {
    // 先移除其他AI消息的重新生成按钮（但保留另起新对话按钮）
    removeRegenerateControlsFromOthers(chatHistory, messageElement);
    
    // 重新生成按钮
    const regenerateBtn = Utils.createElement('button', 'ai-regenerate-btn', {
        type: 'button',
        title: I18n.getMessage('regenerateResponse', '重新生成回答')
    }, '🔄');
    
    // 另起新对话按钮
    const newChatBtn = Utils.createElement('button', 'ai-new-chat-btn', {
        type: 'button', 
        title: I18n.getMessage('startNewChat', '基于此消息另起新对话')
    }, '💬');
    
    // 重新生成功能
    regenerateBtn.addEventListener('click', async () => {
        // 找到对应的用户消息
        const userMessage = findCorrespondingUserMessage(messageElement, chatHistory);
        if (!userMessage) {
            console.warn('无法找到对应的用户消息');
            return;
        }
        
        // 禁用按钮，显示加载状态
        regenerateBtn.disabled = true;
        regenerateBtn.innerHTML = '⏳';
        
        try {
            await regenerateAIResponse(userMessage, messageElement, chatHistory);
        } catch (error) {
            console.error('重新生成回答失败:', error);
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: error.message || I18n.getMessage('regenerateFailed', '重新生成失败'),
                type: 'error',
                duration: 3000
            });
        } finally {
            regenerateBtn.disabled = false;
            regenerateBtn.innerHTML = '🔄';
        }
    });
    
    // 另起新对话功能
    newChatBtn.addEventListener('click', () => {
        const userMessage = findCorrespondingUserMessage(messageElement, chatHistory);
        if (!userMessage) {
            console.warn('无法找到对应的用户消息');
            return;
        }
        
        startNewChatFromMessage(userMessage, chatHistory, messageElement);
    });
    
    // 添加按钮到控制容器
    controlsContainer.appendChild(regenerateBtn);
    controlsContainer.appendChild(newChatBtn);
}

/**
 * 为非最新AI消息添加另起新对话控件
 * @param {HTMLElement} controlsContainer - 控制按钮容器
 * @param {HTMLElement} messageElement - 消息元素
 * @param {HTMLElement} chatHistory - 聊天历史容器
 */
function addNewChatControl(controlsContainer, messageElement, chatHistory) {
    // 另起新对话按钮
    const newChatBtn = Utils.createElement('button', 'ai-new-chat-btn', {
        type: 'button', 
        title: I18n.getMessage('startNewChat', '基于此消息另起新对话')
    }, '💬');
    
    // 另起新对话功能
    newChatBtn.addEventListener('click', () => {
        const userMessage = findCorrespondingUserMessage(messageElement, chatHistory);
        if (!userMessage) {
            console.warn('无法找到对应的用户消息');
            return;
        }
        
        startNewChatFromMessage(userMessage, chatHistory, messageElement);
    });
    
    // 添加按钮到控制容器
    controlsContainer.appendChild(newChatBtn);
}

/**
 * 从其他AI消息中移除重新生成按钮（保留另起新对话按钮）
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {HTMLElement} currentMessageElement - 当前消息元素（不移除其按钮）
 */
function removeRegenerateControlsFromOthers(chatHistory, currentMessageElement) {
    const allAiMessages = chatHistory.querySelectorAll('.ai-message-ai');
    allAiMessages.forEach(msg => {
        if (msg !== currentMessageElement) {
            const controls = msg.querySelector('.ai-message-controls');
            if (controls) {
                // 只移除重新生成按钮，保留另起新对话按钮
                const regenerateBtn = controls.querySelector('.ai-regenerate-btn');
                if (regenerateBtn) regenerateBtn.remove();
            }
        }
    });
}

/**
 * 查找对应的用户消息
 * @param {HTMLElement} aiMessageElement - AI消息元素
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @returns {string|null} 用户消息内容
 */
function findCorrespondingUserMessage(aiMessageElement, chatHistory) {
    const allMessages = Array.from(chatHistory.children);
    const aiMessageIndex = allMessages.indexOf(aiMessageElement);
    
    // 向前查找最近的用户消息
    for (let i = aiMessageIndex - 1; i >= 0; i--) {
        const msg = allMessages[i];
        if (msg.classList.contains('ai-message-user')) {
            const content = msg.querySelector('.ai-message-content');
            return content ? content.textContent.trim() : null;
        }
    }
    
    return null;
}

/**
 * 重新生成AI回答
 * @param {string} userMessage - 用户消息
 * @param {HTMLElement} aiMessageElement - 要替换的AI消息元素
 * @param {HTMLElement} chatHistory - 聊天历史容器
 */
async function regenerateAIResponse(userMessage, aiMessageElement, chatHistory) {
    // 获取当前AI模态框中的配置
    const modal = document.getElementById('ai-modal');
    if (!modal) {
        throw new Error('AI对话框未找到');
    }
    
    // 获取当前选中的供应商和模型
    const providerSwitcher = modal.querySelector('.ai-provider-switcher-container');
    const providerSelect = providerSwitcher?.querySelector('.ai-provider-select');
    const modelSwitcher = modal.querySelector('.ai-model-switcher-container');
    const modelTriggerBtn = modelSwitcher?.querySelector('.ai-model-trigger');
    
    let temporaryProvider = null;
    if (providerSelect && modelTriggerBtn) {
        const selectedProviderIndex = parseInt(providerSelect.value);
        const selectedModel = modelTriggerBtn?.dataset.model;
        
        // 创建临时供应商配置，使用当前选中的模型
        if (selectedProviderIndex >= 0 && selectedProviderIndex < aiConfig.providers.length) {
            temporaryProvider = {
                ...aiConfig.providers[selectedProviderIndex],
                model: selectedModel || aiConfig.providers[selectedProviderIndex].model
            };
        }
    }
    
    // 获取当前温度设置（需要从模态框事件处理器中获取）
    const getCurrentTemperature = () => {
        // 检查是否有活跃的快速提示词按钮
        const activePromptBtn = modal.querySelector('.ai-quick-prompt-btn.active');
        if (activePromptBtn) {
            return parseFloat(activePromptBtn.dataset.temperature) || 1.0;
        }
        return 1.0; // 默认温度
    };
    
    // 创建新的AI消息元素用于流式显示
    const newAiMessageElement = Utils.createElement('div', 'ai-message ai-message-ai');
    const newAiContentElement = Utils.createElement('div', 'ai-message-content');
    newAiMessageElement.appendChild(newAiContentElement);
    
    // 替换旧的AI消息元素
    aiMessageElement.parentNode.insertBefore(newAiMessageElement, aiMessageElement);
    aiMessageElement.remove();
    
    // 添加打字指示器
    const typingIndicator = Utils.createElement('span', 'typing-indicator', {}, '|');
    newAiContentElement.appendChild(typingIndicator);
    
    // 滚动到底部
    chatHistory.scrollTop = chatHistory.scrollHeight;
    
    let reasoningContainer = null;
    let reasoningContentElement = null;
    
    try {
        // 发送到AI（启用流式回复）
        const result = await AI.sendMessage(userMessage, null, (chunk, isFinished, reasoning, type) => {
            if (isFinished) {
                // 移除打字指示器
                const indicator = newAiContentElement.querySelector('.typing-indicator');
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
                const indicator = newAiContentElement.querySelector('.typing-indicator');
                if (indicator) {
                    indicator.remove();
                }
                
                const currentText = newAiContentElement.textContent || '';
                newAiContentElement.textContent = currentText + chunk;
                
                // 重新添加打字指示器
                const newIndicator = Utils.createElement('span', 'typing-indicator', {}, '▋');
                newAiContentElement.appendChild(newIndicator);
                
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
                    newAiMessageElement.insertBefore(reasoningContainer, newAiContentElement);
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
            }
        }, temporaryProvider, getCurrentTemperature());
        
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
        newAiContentElement.innerHTML = renderMarkdown(finalContent);
        
        // 存储原始消息内容到按钮上，方便后续获取
        markdownToggle._originalMessage = finalContent;
        
        // 切换Markdown渲染
        markdownToggle.addEventListener('click', () => {
            if (isMarkdownMode) {
                // 切换到纯文本模式
                newAiContentElement.textContent = finalContent;
                markdownToggle.textContent = '📄 TXT';
                markdownToggle.title = I18n.getMessage('rawText', '原始文本');
                markdownToggle.classList.remove('active');
                isMarkdownMode = false;
            } else {
                // 切换到Markdown模式
                newAiContentElement.innerHTML = renderMarkdown(finalContent);
                markdownToggle.textContent = '📝 MD';
                markdownToggle.title = I18n.getMessage('markdownRendering', 'Markdown渲染');
                markdownToggle.classList.add('active');
                isMarkdownMode = true;
            }
        });
        
        controlsContainer.appendChild(markdownToggle);
        
        // 添加重新生成和另起新对话按钮
        addLatestMessageControls(controlsContainer, newAiMessageElement, chatHistory);
        
        // 将控制按钮插入到AI消息元素的开头
        newAiMessageElement.insertBefore(controlsContainer, newAiContentElement);
        
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
        
        // 滚动到底部
        chatHistory.scrollTop = chatHistory.scrollHeight;
        
    } catch (error) {
        // 如果出错，恢复原始消息
        newAiMessageElement.parentNode.insertBefore(aiMessageElement, newAiMessageElement);
        newAiMessageElement.remove();
        throw error;
    }
}

/**
 * 获取从对话开始到指定消息元素的所有消息数据
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {HTMLElement} targetMessageElement - 目标消息元素
 * @returns {Array} 消息数据数组
 */
function getMessagesFromElement(chatHistory, targetMessageElement) {
    const messagesToCopy = [];
    
    if (!targetMessageElement) {
        return messagesToCopy;
    }
    
    const allMessages = Array.from(chatHistory.children);
    let endIndex = -1;
    
    // 查找目标消息的位置
    for (let i = 0; i < allMessages.length; i++) {
        if (allMessages[i] === targetMessageElement) {
            endIndex = i;
            break;
        }
    }
    
    // 如果是AI消息，包含到AI消息为止；如果是用户消息，包含到用户消息为止
    if (endIndex < 0) {
        return messagesToCopy;
    }
    
    // 从对话开始提取到目标消息（包含目标消息）
    for (let i = 0; i <= endIndex; i++) {
        const messageElement = allMessages[i];
        const messageContent = messageElement.querySelector('.ai-message-content');
        
        if (!messageContent) continue;
        
        let messageType = 'user';
        let reasoning = null;
        
        if (messageElement.classList.contains('ai-message-ai')) {
            messageType = 'ai';
            // 提取推理内容
            const reasoningContent = messageElement.querySelector('.ai-reasoning-content');
            if (reasoningContent) {
                reasoning = reasoningContent.textContent.trim();
            }
        } else if (messageElement.classList.contains('ai-message-error')) {
            messageType = 'error';
        }
        
        // 提取消息内容（优先获取原始文本）
        let content = '';
        
        // 如果是AI消息，尝试从控制按钮的事件中获取原始内容
        if (messageType === 'ai') {
            // 查找Markdown切换按钮，通过其事件获取原始内容
            const markdownToggle = messageElement.querySelector('.ai-markdown-toggle');
            if (markdownToggle && markdownToggle._originalMessage) {
                content = markdownToggle._originalMessage;
            } else {
                // 如果没有存储的原始内容，直接获取文本内容
                content = messageContent.textContent.trim();
            }
        } else {
            content = messageContent.textContent.trim();
        }
        
        if (content) {
            messagesToCopy.push({
                content: content,
                type: messageType,
                reasoning: reasoning
            });
        }
    }
    
    return messagesToCopy;
}

/**
 * 基于消息另起新对话
 * @param {string} userMessage - 用户消息
 * @param {HTMLElement} chatHistory - 聊天历史容器
 * @param {HTMLElement} messageElement - 选中的消息元素
 */
function startNewChatFromMessage(userMessage, chatHistory, messageElement = null) {
    const modal = document.getElementById('ai-modal');
    if (!modal) return;
    
    try {
        // 获取从对话开始到选中消息的所有消息
        const messagesToCopy = getMessagesFromElement(chatHistory, messageElement);
        
        // 清空聊天历史显示
        chatHistory.innerHTML = '';
        
        // 更新标题
        const chatTitle = modal.querySelector('.ai-chat-title');
        if (chatTitle) {
            chatTitle.textContent = I18n.getMessage('aiAssistant', 'AI助手');
        }
        
        // 移除侧边栏中所有对话项的active状态
        const conversationsList = modal.querySelector('.ai-conversations-list');
        if (conversationsList) {
            conversationsList.querySelectorAll('.ai-conversation-item').forEach(item => {
                item.classList.remove('active');
            });
        }
        
        // 重置当前对话ID
        const setCurrentConversationId = modal._setCurrentConversationId;
        if (setCurrentConversationId) {
            setCurrentConversationId(null);
        }
        
        // 复制从对话开始到选中消息的所有内容
        if (messagesToCopy.length > 0) {
            messagesToCopy.forEach(msgData => {
                addMessageToHistory(chatHistory, msgData.content, msgData.type, msgData.reasoning);
            });
        } else {
            // 如果没有找到消息数据，只添加用户消息
            addMessageToHistory(chatHistory, userMessage, 'user');
        }
        
        // 获取输入框并设置焦点
        const inputTextarea = modal.querySelector('#ai-input');
        if (inputTextarea) {
            inputTextarea.focus();
        }
        
        // 显示通知
        Notification.notify({
            title: I18n.getMessage('newChatStarted', '新对话已开始'),
            message: I18n.getMessage('newChatStartedWithHistory', '已复制从该消息开始的对话内容'),
            type: 'success',
            duration: 2000
        });
        
    } catch (error) {
        console.error('另起新对话失败:', error);
    }
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
        url: aiConfig.currentProvider?.apiUrl || 'https://api.deepseek.com/v1',
        key: aiConfig.currentProvider?.apiKey || '',
        model: aiConfig.currentProvider?.model || 'deepseek-chat',
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
            placeholder: 'https://api.deepseek.com/v1',
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
                        
                        // 添加默认选项
                        const emptyOption = Utils.createElement('option', '', {
                            value: '',
                            disabled: true,
                            selected: true
                        }, I18n.getMessage('selectModel', '请选择一个模型'));
                        modelSelect.appendChild(emptyOption);
                        
                        models.forEach(model => {
                            const option = Utils.createElement('option');
                            option.value = model;
                            option.textContent = model;
                            // 编辑时如果当前模型在列表中，选中它
                            if (isEditing && model === provider.model) {
                                option.selected = true;
                            }
                            modelSelect.appendChild(option);
                        });
                        
                        // 如果是编辑且当前模型在列表中，选中它
                        if (isEditing && provider.model && models.includes(provider.model)) {
                            modelSelect.value = provider.model;
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
            {
                text: I18n.getMessage('defaultPrompt1', '帮我总结这段内容'),
                temperature: 1.0,
                category: 'analysis'
            },
            {
                text: I18n.getMessage('defaultPrompt2', '翻译成中文'),
                temperature: 1.3,
                category: 'translation'
            },
            {
                text: I18n.getMessage('defaultPrompt3', '优化这段文字'),
                temperature: 1.3,
                category: 'general'
            },
            {
                text: I18n.getMessage('defaultPrompt4', '写一个关于这个主题的大纲'),
                temperature: 1.5,
                category: 'creative'
            },
            {
                text: I18n.getMessage('defaultPrompt5', '帮我写代码实现这个功能'),
                temperature: 0.0,
                category: 'code'
            },
            {
                text: I18n.getMessage('defaultPrompt6', '解释这个数学/编程概念'),
                temperature: 0.0,
                category: 'math'
            }
        ];
    } else {
        // 兼容旧版本的字符串数组格式，转换为新格式
        aiConfig.quickPrompts = aiConfig.quickPrompts.map(prompt => {
            if (typeof prompt === 'string') {
                return {
                    text: prompt,
                    temperature: 1.0,
                    category: 'general'
                };
            }
            return prompt;
        });
    }
    
    // 如果AI配置还没有系统提示，设置默认的国际化版本
    if (!aiConfig.systemPrompt) {
        aiConfig.systemPrompt = I18n.getMessage('defaultSystemPrompt', '你是一个智能助手，请用简洁友好的语言回答用户的问题。');
    }
}

