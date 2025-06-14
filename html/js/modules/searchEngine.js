/**
 * 搜索引擎处理模块
 */

import { I18n, IconManager, Utils, Menu, Notification } from './core/index.js';
// 默认搜索引擎配置
const defaultEngines = [
    {
        name: 'Bing',
        url: 'https://www.bing.com/search?q=',
    },
    {
        name: 'Baidu',
        url: 'https://www.baidu.com/s?wd=',
    },
    {
        name: 'Google',
        url: 'https://www.google.com/search?q=',
    }
];

// 搜索引擎相关变量
let currentEngineIndex = 0;
let searchEngines = [];

// 存储键名常量
const STORAGE_KEYS = {
    ENGINES: "searchEngines",
    CURRENT_ENGINE: "engine"
};

/**
 * 搜索引擎API命名空间
 * @namespace
 */
export const SearchEngineAPI = {    /**
     * 初始化搜索引擎
     * @returns {Promise<void>}
     */
    async initialize() {
        // 创建搜索UI元素
        this.createSearchUI();
        
        // 从存储中加载搜索引擎配置
        await this.loadSearchEngines();
        
        // 渲染搜索引擎选择器
        this.renderSearchEngineSelector(true);
        
        // 初始化搜索功能
        this.initSearch();
    },

    /**
     * 设置当前使用的搜索引擎
     * @param {number} index - 搜索引擎索引
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async setCurrentEngine(index) {
        if (index < 0 || index >= searchEngines.length) return false;
        
        currentEngineIndex = index;
        
        try {            await chrome.storage.local.set({
                [STORAGE_KEYS.CURRENT_ENGINE]: {
                    baseUrl: searchEngines[index].url,
                    name: searchEngines[index].name,
                    searchParam: this.getSearchParamFromUrl(searchEngines[index].url)
                }
            });
            
            this.renderSearchEngineSelector();
            return true;
        } catch (error) {
            console.error('设置当前搜索引擎失败:', error);
            return false;
        }
    },

    /**
     * 执行搜索
     * @param {string} query - 搜索查询
     */
    search(query) {
        if (!query) return;
        
        const engine = searchEngines[currentEngineIndex];
        const searchUrl = engine.url + encodeURIComponent(query);
        
        window.open(searchUrl, '_blank');
    },

    /**
     * 删除搜索引擎
     * @param {number} index - 搜索引擎索引
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async deleteEngine(index) {
        if (index < 0 || index >= searchEngines.length || searchEngines.length <= 1) return false;
        
        // 删除搜索引擎
        const newEngines = [...searchEngines];
        newEngines.splice(index, 1);
        
        // 确定新的活动引擎索引
        let newActiveIndex = currentEngineIndex;
        
        if (currentEngineIndex === index) {
            newActiveIndex = 0;
        } else if (currentEngineIndex > index) {
            newActiveIndex--;        }
        
        return await this.updateSearchEngines(newEngines, newActiveIndex);
    },

    /**
     * 编辑搜索引擎
     * @param {number} index - 搜索引擎索引
     * @param {Object} engineData - 新的搜索引擎数据
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async editEngine(index, engineData) {
        if (index < 0 || index >= searchEngines.length) return false;
        
        const newEngines = [...searchEngines];
        newEngines[index] = {...newEngines[index], ...engineData};
        
        return await this.updateSearchEngines(newEngines, index === currentEngineIndex ? index : null);
    },

    /**
     * 添加自定义搜索引擎
     * @param {Object} engineData - 搜索引擎数据 {name, url, icon?}
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async addCustomEngine(engineData) {
        let { name, url, icon } = engineData;
        
        // 处理URL
        if (url.includes('%s')) {
            url = url.replace('%s', '');
        } else {
            try {
                const urlObj = new URL(url);
                let searchParam = 'q';
                
                if (urlObj.search) {
                    const searchParams = new URLSearchParams(urlObj.search);
                    if (searchParams.keys().next().value) {
                        searchParam = searchParams.keys().next().value;
                        searchParams.set(searchParam, '');
                        urlObj.search = searchParams.toString();
                        url = urlObj.toString();
                    } else {
                        url = url + (url.includes('?') ? '&' : '?') + searchParam + '=';
                    }
                } else {
                    url = url + '?' + searchParam + '=';
                }
            } catch (e) {
                url = url + (url.includes('?') ? '&q=' : '?q=');
            }
        }
        
        // 添加新的搜索引擎
        const newEngine = { name, url, icon };        const newEngines = [...searchEngines, newEngine];
        
        return await this.updateSearchEngines(newEngines, newEngines.length - 1);
    },

    /**
     * 获取当前所有搜索引擎配置
     * @returns {Array} - 搜索引擎配置数组
     */
    getAllEngines() {
        return [...searchEngines];
    },

    /**
     * 异步获取所有搜索引擎配置（直接从存储获取最新数据）
     * @returns {Promise<Array>} - 搜索引擎配置数组
     */
    async getAllEnginesAsync() {
        try {
            const data = await this.getFromStorage(STORAGE_KEYS.ENGINES);
            return data[STORAGE_KEYS.ENGINES] || [];
        } catch (error) {
            console.error('获取所有搜索引擎失败:', error);
            return [...searchEngines]; // 返回内存中的副本
        }
    },

    /**
     * 获取当前活动的搜索引擎
     * @returns {Object} - 当前搜索引擎配置
     */
    getCurrentEngine() {
        return searchEngines[currentEngineIndex];
    },

    /**
     * 清除扩展存储的所有数据
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async clearStorage() {
        try {
            await new Promise((resolve, reject) => {
                chrome.storage.local.clear(() => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve();
                    }
                });
            });
            
            // 重置内存中的搜索引擎数据
            searchEngines = [...defaultEngines];
            currentEngineIndex = 0;
            return true;
        } catch (error) {
            console.error('清除存储失败:', error);
            return false;
        }
    },

    /**
     * 设置搜索相关事件处理
     */
    setupEvents() {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            // 焦点事件处理
            searchInput.addEventListener('focus', function(e) {
                // 仅在未选中内容时全选
                if (this.selectionStart === this.selectionEnd) {
                    this.select();
                }
                this.classList.add('focused');
            });

            searchInput.addEventListener('blur', () => {
                searchInput.classList.remove('focused');
            });

            // 移除 click 自动全选
            // searchInput.addEventListener('click', function() {
            //     this.select();
            // });
        }

        // 确保每次页面交互后搜索框准备就绪
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && searchInput) {
                setTimeout(() => {
                    searchInput.blur(); // 确保搜索框不会自动获取焦点
                }, 100);
            }
        });
    },      /**
     * 显示添加自定义搜索引擎模态框
     */
    showAddEngineModal() {
        SearchEngineAPI.showAddSearchEngineModal();
    },/**
     * 创建搜索引擎设置项
     * @returns {Array} - 设置项配置数组
     */
    createSettingsItems() {
        return [
            {
                id: 'search-engine-list',
                label: I18n.getMessage('settingsSearchEngineList', '搜索引擎管理'),
                type: 'custom',
                description: I18n.getMessage('settingsSearchEngineListDesc', '管理和配置搜索引擎'),
                createControl: async () => {
                    return await SearchEngineAPI.createEngineListControl();
                }
            },
            {
                id: 'add-search-engine',
                label: I18n.getMessage('settingsAddSearchEngine', '添加搜索引擎'),
                type: 'button',
                buttonText: I18n.getMessage('addCustomSearchEngine', '添加自定义搜索引擎'),
                buttonClass: 'btn-primary',
                description: I18n.getMessage('settingsAddSearchEngineDesc', '添加新的自定义搜索引擎'),
                onClick: () => {
                    SearchEngineAPI.showAddEngineModal();
                }
            }
        ];
    },

    /**
     * 创建搜索引擎列表控件
     * @returns {HTMLElement} - 搜索引擎列表容器
     */
    async createEngineListControl() {
        const listContainer = Utils.createElement('div', 'search-engine-list-container');
        
        try {
            const engines = await this.getAllEnginesAsync();
            const currentEngine = this.getCurrentEngine();
            
            engines.forEach((engine, index) => {
                const engineItem = Utils.createElement('div', 'search-engine-item-setting');
                
                // 引擎图标
                const engineIcon = Utils.createElement('img', 'engine-icon', {
                    alt: engine.name,
                    style: 'width: 24px; height: 24px; object-fit: contain;'
                });
                
                // 使用 IconManager 设置图标
                IconManager.setIconForElement(engineIcon, engine.url);
                engineIcon.onerror = () => IconManager.handleIconError(engineIcon, '../icons/icon128.png');
                
                // 引擎名称
                const engineName = Utils.createElement('div', 'engine-name', {}, engine.name);
                
                // 引擎URL
                const engineUrl = Utils.createElement('div', 'engine-url', {}, engine.url);
                
                // 当前引擎标识
                const isCurrentEngine = currentEngine && currentEngine.name === engine.name;
                if (isCurrentEngine) {
                    engineItem.classList.add('current-engine');
                    const currentBadge = Utils.createElement('span', 'current-badge', {}, I18n.getMessage('currentEngine', '当前'));
                    engineItem.appendChild(currentBadge);
                }
                
                // 引擎信息容器
                const engineInfo = Utils.createElement('div', 'engine-info');
                engineInfo.append(engineName, engineUrl);
                
                // 操作按钮
                const engineActions = Utils.createElement('div', 'engine-actions');
                
                // 设为当前按钮
                if (!isCurrentEngine) {
                    const setCurrentBtn = Utils.createElement('button', 'btn btn-small btn-primary', {}, I18n.getMessage('setAsCurrent', '设为当前'));
                    setCurrentBtn.addEventListener('click', async () => {
                        const success = await this.setCurrentEngine(index);
                        if (success) {
                            this.refreshEngineListControl();
                        }
                    });
                    engineActions.appendChild(setCurrentBtn);
                }
                
                // 编辑按钮
                const editBtn = Utils.createElement('button', 'btn btn-small btn-secondary', {}, I18n.getMessage('edit', '编辑'));
                editBtn.addEventListener('click', () => {
                    this.showEditEngineModal(engine, index);
                });
                engineActions.appendChild(editBtn);
                
                // 删除按钮
                if (engines.length > 1) {
                    const deleteBtn = Utils.createElement('button', 'btn btn-small btn-danger', {}, I18n.getMessage('delete', '删除'));
                    deleteBtn.addEventListener('click', () => {
                        Notification.notify({
                            title: I18n.getMessage('confirmDelete', '确认删除'),
                            message: `${I18n.getMessage('confirmDeleteEngine', '确定要删除搜索引擎')} "${engine.name}" ${I18n.getMessage('confirmDeleteEngineSuffix', '吗？')}`,
                            duration: 0,
                            type: 'confirm',
                            buttons: [
                                {
                                    text: I18n.getMessage('confirm', '确认'),
                                    class: 'btn-primary confirm-yes',
                                    callback: async () => {
                                        const success = await this.deleteEngine(index);
                                        if (success) {
                                            this.refreshEngineListControl();
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
                    engineActions.appendChild(deleteBtn);
                }
                
                engineItem.append(engineIcon, engineInfo, engineActions);
                listContainer.appendChild(engineItem);
            });
            
        } catch (error) {
            console.error('创建搜索引擎列表失败:', error);
            const errorMsg = Utils.createElement('div', 'error-message', {}, I18n.getMessage('loadEngineListError', '加载搜索引擎列表失败'));
            listContainer.appendChild(errorMsg);
        }
        
        return listContainer;
    },

    /**
     * 刷新搜索引擎列表控件
     */
    refreshEngineListControl() {
        const listContainer = document.querySelector('.search-engine-list-container');
        if (!listContainer) return;
        
        this.createEngineListControl().then(newList => {
            listContainer.parentNode.replaceChild(newList, listContainer);
        });
    },

    /**
     * 显示编辑搜索引擎模态框
     * @param {Object} engine - 搜索引擎对象
     * @param {number} index - 引擎索引
     */
    showEditEngineModal(engine, index) {
        const formItems = [
            {
                type: 'text',
                id: 'edit-engine-name',
                label: I18n.getMessage('engineName', '搜索引擎名称'),
                value: engine.name,
                required: true
            },
            {
                type: 'url',
                id: 'edit-engine-url',
                label: I18n.getMessage('engineSearchUrl', '搜索URL'),
                value: engine.url,
                required: true
            },
            {
                type: 'url',
                id: 'edit-engine-icon',
                label: I18n.getMessage('engineIconUrl', '图标URL（可选）'),
                value: engine.icon || '',
                required: false
            }
        ];

        Menu.showFormModal(
            `${I18n.getMessage('editEngine', '编辑搜索引擎')} - ${engine.name}`,
            formItems,
            async (formData) => {
                const name = formData['edit-engine-name'];
                const url = formData['edit-engine-url'];
                const icon = formData['edit-engine-icon'];
                
                const success = await this.editEngine(index, { name, url, icon });
                if (success) {
                    this.refreshEngineListControl();
                    Notification.notify({
                        title: I18n.getMessage('success', '成功'),
                        message: I18n.getMessage('updateEngineSuccess', '搜索引擎更新成功'),
                        type: 'success',
                        duration: 2000
                    });
                } else {
                    Notification.notify({
                        title: I18n.getMessage('error', '错误'),
                        message: I18n.getMessage('updateEngineError', '更新搜索引擎失败'),
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
     * 创建搜索UI元素
     */
    createSearchUI() {
        const container = document.getElementById('container');
        if (!container || document.getElementById('search-box')) return;
        
        // 创建搜索框元素
        const searchBox = Utils.createElement('div', 'search-box', { id: 'search-box' });
        const searchEngineIcon = Utils.createElement('img', '', { 
            id: 'search-engine-icon', 
            alt: 'Search Engine',
            style: 'width:24px;height:24px;margin:0 10px 0 15px;cursor:pointer;object-fit:contain;opacity:0.7;transition:opacity 0.3s;'
        });
        
        const searchForm = Utils.createElement('form', 'search-form-container', { id: 'search-form' });
        const searchInput = Utils.createElement('input', '', { 
            id: 'search-input',
            type: 'text',
            placeholder: I18n.getMessage('searchPlaceholder', '搜索...'),
            autocomplete: 'off',
            autocorrect: 'off',
            autocapitalize: 'off',
            spellcheck: 'false'
        });
        
        searchForm.appendChild(searchInput);
        searchBox.appendChild(searchEngineIcon);
        searchBox.appendChild(searchForm);
        
        // 将搜索框添加为容器的第一个子元素
        if (container.firstChild) {
            container.insertBefore(searchBox, container.firstChild);
        } else {
            container.appendChild(searchBox);
        }
    },

    /**
     * 直接从Chrome存储读取数据
     * @param {string|Array<string>} keys - 要读取的键或键数组
     * @returns {Promise<Object>} - 存储数据
     */
    async getFromStorage(keys) {
        try {
            return await new Promise((resolve, reject) => {
                chrome.storage.local.get(keys, (result) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(result);
                    }
                });
            });
        } catch (error) {
            console.error('从存储中读取数据失败:', error);
            return {};
        }
    },

    /**
     * 从URL中提取搜索参数名称
     * @param {string} url - 搜索引擎URL
     * @returns {string} - 搜索参数名
     */
    getSearchParamFromUrl(url) {
        if (!url || !url.includes('?')) return 'q';
        
        try {
            const searchPart = url.split('?')[1];
            const params = searchPart.split('&');
            for (const param of params) {
                if (param.includes('=')) {
                    return param.split('=')[0];
                }
            }
            
            const urlObj = new URL(url);
            const searchParams = new URLSearchParams(urlObj.search);
            
            const commonParams = ['q', 'query', 'search', 'text', 'keyword', 'wd', 'word', 'kw', 'key'];
            for (const param of commonParams) {
                if (searchParams.has(param)) return param;
            }
            
            return searchParams.keys().next().value || 'q';
        } catch (e) {
            return 'q';
        }
    },

    /**
     * 加载搜索引擎配置
     * @returns {Promise<void>}
     */
    async loadSearchEngines() {
        try {
            // 从存储中获取搜索引擎列表
            const data = await this.getFromStorage([STORAGE_KEYS.ENGINES, STORAGE_KEYS.CURRENT_ENGINE]);
            const allEngines = data[STORAGE_KEYS.ENGINES] || [];
            
            // 确保搜索引擎列表有效
            searchEngines = allEngines && allEngines.length > 0 ? allEngines : defaultEngines;
            
            // 如果没有搜索引擎，设置默认搜索引擎
            if (allEngines.length === 0) {
                try {
                    await chrome.storage.local.set({ [STORAGE_KEYS.ENGINES]: defaultEngines });
                } catch (err) {
                    // 忽略错误
                }
            }
            
            // 获取当前活跃搜索引擎
            const currentEngine = data[STORAGE_KEYS.CURRENT_ENGINE];
            
            // 设置当前引擎索引
            if (currentEngine && currentEngine.name) {
                const foundIndex = searchEngines.findIndex(engine => engine.name === currentEngine.name);
                currentEngineIndex = foundIndex !== -1 ? foundIndex : 0;
            } else {
                currentEngineIndex = 0;
                
                // 设置第一个为当前引擎
                try {                    await chrome.storage.local.set({
                        [STORAGE_KEYS.CURRENT_ENGINE]: {
                            baseUrl: searchEngines[0].url,
                            name: searchEngines[0].name,
                            searchParam: this.getSearchParamFromUrl(searchEngines[0].url)
                        }
                    });
                } catch (err) {
                    // 忽略错误
                }
            }
        } catch (error) {
            console.error('加载搜索引擎配置失败:', error);
            searchEngines = defaultEngines;
            currentEngineIndex = 0;
        }
    },

    /**
     * 渲染搜索引擎选择器
     * @param {boolean} [firstRender=false] - 是否是首次渲染
     */
    renderSearchEngineSelector(firstRender = false) {
        // 创建或获取搜索引擎菜单元素
        let menuElement = document.getElementById('search-engine-menu');
        if (!menuElement) {
            menuElement = Utils.createElement('div', 'search-engine-menu', { id: 'search-engine-menu' });
            document.body.appendChild(menuElement);
        } else if (menuElement.parentElement && menuElement.parentElement.id === 'search-box') {
            document.body.appendChild(menuElement);
        }
        
        // 清空现有菜单
        menuElement.innerHTML = '';
        
        // 填充搜索引擎选项
        searchEngines.forEach((engine, index) => {
            const menuItem = Utils.createElement('div', 'search-engine-item' + (index === currentEngineIndex ? ' active' : ''));
            
            const icon = Utils.createElement('img', '', { alt: engine.name });
            const siteUrl = Utils.getDomain(engine.url);
            IconManager.setIconForElement(icon, siteUrl);
            icon.onerror = () => IconManager.handleIconError(icon, '../icons/icon128.png');
            
            const name = Utils.createElement('span', '', {}, engine.name);
            
            menuItem.appendChild(icon);
            menuItem.appendChild(name);
            
            // 添加删除按钮(如果搜索引擎数量大于1)
            if (searchEngines.length > 1) {
                const deleteButton = Utils.createElement('div', 'search-engine-delete', {}, '&times;');
                
                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    Notification.notify({
                        title: I18n.getMessage('confirm', '确认'),
                        message: I18n.getMessage('confirmDeleteSearchEngine', '确定要删除搜索引擎 {name} 吗？').replace('{name}', engine.name),
                        duration: 0,
                        type: 'confirm',
                        buttons: [                            {
                                text: I18n.getMessage('confirm', '确认'),
                                class: 'btn-primary confirm-yes',
                                callback: () => {
                                    SearchEngineAPI.deleteEngine(index);
                                    menuElement.style.display = 'none';
                                }
                            },
                        {
                            text: I18n.getMessage('cancel', '取消'),
                            class: 'confirm-no',
                            callback: () => {}
                        }                    ]
                });
                });
                
                menuItem.appendChild(deleteButton);
            }
            
            menuItem.addEventListener('click', () => {
                SearchEngineAPI.setCurrentEngine(index);
            });
            
            menuElement.appendChild(menuItem);
        });
        
        // 添加自定义搜索引擎选项
        const addCustomEngine = Utils.createElement('div', 'search-engine-add', {}, 
            I18n.getMessage('addCustomSearchEngine', '添加自定义搜索引擎'));
        
        addCustomEngine.addEventListener('click', () => this.showAddSearchEngineModal());
        menuElement.appendChild(addCustomEngine);
        
        // 为搜索引擎图标添加点击事件
        const iconElement = document.getElementById('search-engine-icon');
        if (iconElement) {
            // 移除旧事件
            const newIcon = iconElement.cloneNode(false);
            iconElement.parentNode.replaceChild(newIcon, iconElement);
            
            // 从搜索URL提取主域名URL
            const currentEngine = searchEngines[currentEngineIndex];
            const siteUrl = Utils.getDomain(currentEngine.url);
            
            // 设置图标
            IconManager.setIconForElement(newIcon, siteUrl);
            newIcon.onerror = () => IconManager.handleIconError(newIcon, '../icons/icon128.png');
            
            // 添加点击事件
            newIcon.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showSearchEngineMenu(newIcon);
            });
            
            // 添加右键菜单(清除存储功能)
            newIcon.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                Notification.notify({
                    title: I18n.getMessage('confirm', '确认'),
                    message: I18n.getMessage('clearStorageConfirm', '确定要清除所有存储数据吗？此操作不可恢复。'),
                    duration: 0,
                    type: 'confirm',
                    buttons: [
                        {
                            text: I18n.getMessage('confirm', '确认'),
                            class: 'btn-primary confirm-yes',
                            callback: async () => {
                                const success = await SearchEngineAPI.clearStorage();
                                if (success) {
                                    Notification.notify({
                                        title: I18n.getMessage('success', '成功'),
                                        message: I18n.getMessage('clearStorageSuccess', '存储已成功清除，页面将刷新。'),
                                        type: 'success',
                                        duration: 1500,
                                        onClose: () => {
                                            window.location.reload();
                                        }
                                    });
                                } else {
                                    Notification.notify({
                                        title: I18n.getMessage('error', '错误'),
                                        message: I18n.getMessage('clearStorageError', '清除存储失败'),
                                        type: 'error',
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
        }
        
        // 点击其他区域关闭菜单
        if (!window._menuClickHandlerAdded) {
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('search-engine-menu');
                if (menu && !menu.contains(e.target) && 
                    e.target.id !== 'search-engine-icon' &&
                    !e.target.classList.contains('search-engine-icon')) {
                    hideSearchEngineMenu();
                }
            });
            window._menuClickHandlerAdded = true;
        }
    },

    /**
     * 初始化搜索功能
     */
    initSearch() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput) return;
        
        const searchForm = document.getElementById('search-form');
        if (!searchForm) return;
        
        // 替换表单以移除旧事件监听器
        const newForm = searchForm.cloneNode(true);
        searchForm.parentNode.replaceChild(newForm, searchForm);
        
        // 重新获取输入框
        const newSearchInput = document.getElementById('search-input');
        
        // 搜索表单提交
        newForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = newSearchInput.value.trim();
            if (query) {
                SearchEngineAPI.search(query);
            }
        });
    },

    /**
     * 显示添加自定义搜索引擎模态框
     */
    showAddSearchEngineModal() {
        const formItems = [
            {
                type: 'text',
                id: 'custom-engine-name',
                label: I18n.getMessage('engineName', '搜索引擎名称'),
                required: true
            },
            {
                type: 'url',
                id: 'custom-engine-url',
                label: I18n.getMessage('engineSearchUrl', '搜索URL'),
                placeholder: 'https://www.example.com/search?q=%s',
                required: true
            },
            {
                type: 'url',
                id: 'custom-engine-icon',
                label: I18n.getMessage('engineIconUrl', '图标URL（可选）'),
                required: false
            }
        ];

        Menu.showFormModal(
            I18n.getMessage('addCustomSearchEngine', '添加自定义搜索引擎'),
            formItems,
            (formData) => {
                const name = formData['custom-engine-name'];
                const url = formData['custom-engine-url'];
                const icon = formData['custom-engine-icon'];
                
                SearchEngineAPI.addCustomEngine({ name, url, icon })
                    .then(success => {
                        if (!success) {
                            Notification.notify({
                                title: I18n.getMessage('error', '错误'),
                                message: I18n.getMessage('saveFailed', '保存失败'),
                                type: 'error',
                                duration: 3000
                            });
                        }
                    });
            },
            I18n.getMessage('confirm', '确认'),
            I18n.getMessage('cancel', '取消')
        );
    },

    /**
     * 处理搜索引擎数据变更和同步
     * @param {Array} newEngines - 新的搜索引擎数组
     * @param {number} activeIndex - 新的活动引擎索引
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async updateSearchEngines(newEngines, activeIndex = null) {
        try {
            // 保存到存储
            await chrome.storage.local.set({ [STORAGE_KEYS.ENGINES]: newEngines });
            
            // 更新内存中的引擎列表
            searchEngines = [...newEngines];
            
            // 设置活动引擎
            if (activeIndex !== null && activeIndex >= 0 && activeIndex < searchEngines.length) {
                currentEngineIndex = activeIndex;                await chrome.storage.local.set({
                    [STORAGE_KEYS.CURRENT_ENGINE]: {
                        baseUrl: searchEngines[activeIndex].url,
                        name: searchEngines[activeIndex].name,
                        searchParam: this.getSearchParamFromUrl(searchEngines[activeIndex].url)
                    }
                });
            }
            
            // 重新渲染选择器
            this.renderSearchEngineSelector();
            return true;
        } catch (error) {
            console.error('更新搜索引擎失败:', error);
            return false;
        }
    }
};

// 搜索引擎选择器相关代码

// 显示搜索引擎菜单
function showSearchEngineMenu(iconElement) {
    const menu = document.getElementById('search-engine-menu');
    if (!menu) return;
    
    menu.classList.add('search-engine-menu-positioned');
    const rect = iconElement.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.classList.add('visible');
}

// 隐藏搜索引擎菜单
function hideSearchEngineMenu() {
    const menu = document.getElementById('search-engine-menu');
    if (!menu) return;
    
    menu.classList.remove('visible');
}

