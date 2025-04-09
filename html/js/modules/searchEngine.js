/**
 * 搜索引擎处理模块
 */

import { I18n } from './i18n.js';
import { IconManager } from './iconManager.js';
import { Utils } from './utils.js';

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
export const SearchEngineAPI = {
    /**
     * 初始化搜索引擎
     * @returns {Promise<void>}
     */
    async initialize() {
        // 创建搜索UI元素
        createSearchUI();
        
        // 从存储中加载搜索引擎配置
        await loadSearchEngines();
        
        // 渲染搜索引擎选择器
        renderSearchEngineSelector(true);
        
        // 初始化搜索功能
        initSearch();
    },

    /**
     * 设置当前使用的搜索引擎
     * @param {number} index - 搜索引擎索引
     * @returns {Promise<boolean>} - 操作是否成功
     */
    async setCurrentEngine(index) {
        if (index < 0 || index >= searchEngines.length) return false;
        
        currentEngineIndex = index;
        
        try {
            await chrome.storage.local.set({
                [STORAGE_KEYS.CURRENT_ENGINE]: {
                    baseUrl: searchEngines[index].url,
                    name: searchEngines[index].name,
                    searchParam: getSearchParamFromUrl(searchEngines[index].url)
                }
            });
            
            renderSearchEngineSelector();
            return true;
        } catch (error) {
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
    async removeEngine(index) {
        if (index < 0 || index >= searchEngines.length || searchEngines.length <= 1) return false;
        
        // 删除搜索引擎
        const newEngines = [...searchEngines];
        newEngines.splice(index, 1);
        
        // 确定新的活动引擎索引
        let newActiveIndex = currentEngineIndex;
        
        if (currentEngineIndex === index) {
            newActiveIndex = 0;
        } else if (currentEngineIndex > index) {
            newActiveIndex--;
        }
        
        return await updateSearchEngines(newEngines, newActiveIndex);
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
        
        return await updateSearchEngines(newEngines, index === currentEngineIndex ? index : null);
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
        const newEngine = { name, url, icon };
        const newEngines = [...searchEngines, newEngine];
        
        return await updateSearchEngines(newEngines, newEngines.length - 1);
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
            const data = await getFromStorage(STORAGE_KEYS.ENGINES);
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
            searchInput.addEventListener('focus', () => {
                searchInput.classList.add('focused');
            });
            
            searchInput.addEventListener('blur', () => {
                searchInput.classList.remove('focused');
            });

            // 自动选择输入内容
            searchInput.addEventListener('click', function() {
                this.select();
            });
        }

        // 确保每次页面交互后搜索框准备就绪
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && searchInput) {
                setTimeout(() => {
                    searchInput.blur(); // 确保搜索框不会自动获取焦点
                }, 100);
            }
        });
    },
    
    /**
     * 显示添加自定义搜索引擎模态框
     */
    showAddEngineModal() {
        showAddSearchEngineModal();
    }
};

/**
 * 创建搜索UI元素
 */
function createSearchUI() {
    const container = document.getElementById('container');
    if (!container || document.getElementById('search-box')) return;
    
    // 创建搜索框元素
    const searchBox = Utils.createElement('div', 'search-box', { id: 'search-box' });
    const searchEngineIcon = Utils.createElement('img', '', { 
        id: 'search-engine-icon', 
        alt: 'Search Engine',
        style: 'width:24px;height:24px;margin:0 15px;cursor:pointer;object-fit:contain;opacity:0.7;transition:opacity 0.3s;'
    });
    
    const searchForm = Utils.createElement('form', '', { id: 'search-form' });
    const searchInput = Utils.createElement('input', '', { 
        id: 'search-input',
        type: 'text',
        placeholder: I18n.getMessage('searchPlaceholder') || '搜索...',
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
}

/**
 * 直接从Chrome存储读取数据
 * @param {string|Array<string>} keys - 要读取的键或键数组
 * @returns {Promise<Object>} - 存储数据
 */
async function getFromStorage(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * 直接保存数据到Chrome存储
 * @param {Object} data - 要保存的数据对象
 * @returns {Promise<void>}
 */
async function saveToStorage(data) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(data, () => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve();
            }
        });
    });
}

/**
 * 加载搜索引擎配置
 * @returns {Promise<void>}
 */
async function loadSearchEngines() {
    try {
        // 从存储中获取搜索引擎列表
        const data = await chrome.storage.local.get([STORAGE_KEYS.ENGINES, STORAGE_KEYS.CURRENT_ENGINE]);
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
            try {
                await chrome.storage.local.set({
                    [STORAGE_KEYS.CURRENT_ENGINE]: {
                        baseUrl: searchEngines[0].url,
                        name: searchEngines[0].name,
                        searchParam: getSearchParamFromUrl(searchEngines[0].url)
                    }
                });
            } catch (err) {
                // 忽略错误
            }
        }
    } catch (error) {
        searchEngines = defaultEngines;
        currentEngineIndex = 0;
    }
}

/**
 * 从URL中提取搜索参数名称
 * @param {string} url - 搜索引擎URL
 * @returns {string} - 搜索参数名
 */
function getSearchParamFromUrl(url) {
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
}

/**
 * 渲染搜索引擎选择器
 * @param {boolean} [firstRender=false] - 是否是首次渲染
 */
function renderSearchEngineSelector(firstRender = false) {
    // 创建或获取搜索引擎菜单元素
    let menuElement = document.getElementById('search-engine-menu');
    if (!menuElement) {
        menuElement = document.createElement('div');
        menuElement.id = 'search-engine-menu';
        menuElement.className = 'search-engine-menu';
        document.body.appendChild(menuElement);
    } else if (menuElement.parentElement && menuElement.parentElement.id === 'search-box') {
        document.body.appendChild(menuElement);
    }
    
    // 清空现有菜单
    menuElement.innerHTML = '';
    
    // 填充搜索引擎选项
    searchEngines.forEach((engine, index) => {
        const menuItem = document.createElement('div');
        menuItem.className = 'search-engine-item' + (index === currentEngineIndex ? ' active' : '');
        
        const icon = document.createElement('img');
        icon.alt = engine.name;
        IconManager.setIconForElement(icon, engine.url);
        icon.onerror = () => IconManager.handleIconError(icon, '../favicon.png');
        
        const name = document.createElement('span');
        name.textContent = engine.name;
        
        menuItem.appendChild(icon);
        menuItem.appendChild(name);
        
        // 添加删除按钮(如果搜索引擎数量大于1)
        if (searchEngines.length > 1) {
            const deleteButton = document.createElement('div');
            deleteButton.className = 'search-engine-delete';
            deleteButton.innerHTML = '&times;';
            
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                Utils.UI.showConfirmDialog(
                    I18n.getMessage('confirmDeleteSearchEngine').replace('{name}', engine.name),
                    () => {
                        SearchEngineAPI.deleteEngine(index);
                        menuElement.style.display = 'none';
                    }
                );
            });
            
            menuItem.appendChild(deleteButton);
        }
        
        menuItem.addEventListener('click', () => {
            SearchEngineAPI.setCurrentEngine(index);
        });
        
        menuElement.appendChild(menuItem);
    });
    
    // 添加自定义搜索引擎选项
    const addCustomEngine = document.createElement('div');
    addCustomEngine.className = 'search-engine-add';
    addCustomEngine.textContent = I18n.getMessage('addCustomSearchEngine') || '添加自定义搜索引擎';
    
    addCustomEngine.addEventListener('click', showAddSearchEngineModal);
    menuElement.appendChild(addCustomEngine);
    
    // 为搜索引擎图标添加点击事件
    const iconElement = document.getElementById('search-engine-icon');
    if (iconElement) {
        // 移除旧事件
        const newIcon = iconElement.cloneNode(false);
        iconElement.parentNode.replaceChild(newIcon, iconElement);
        
        // 设置图标
        IconManager.setIconForElement(newIcon, searchEngines[currentEngineIndex].url);
        newIcon.onerror = () => IconManager.handleIconError(newIcon, '../favicon.png');
        
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
            
            Utils.UI.showConfirmDialog(
                I18n.getMessage('clearStorageConfirm') || '确定要清除所有存储数据吗？此操作不可恢复。',
                async () => {
                    const success = await SearchEngineAPI.clearStorage();
                    if (success) {
                        Utils.UI.showErrorModal(
                            I18n.getMessage('clearStorageSuccess') || '存储已成功清除，页面将刷新。',
                            '',
                            false
                        );
                        // 在显示消息后立即添加页面刷新代码
                        setTimeout(() => {
                            window.location.reload();
                        }, 1500); // 延迟1.5秒，让用户能看到消息
                    } else {
                        Utils.UI.showErrorModal(I18n.getMessage('clearStorageError') || '清除存储失败', '', false);
                    }
                }
            );
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
}

/**
 * 初始化搜索功能
 */
function initSearch() {
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
}

/**
 * 显示添加自定义搜索引擎模态框
 */
function showAddSearchEngineModal() {
    const formItems = [
        {
            type: 'text',
            id: 'custom-engine-name',
            label: I18n.getMessage('engineName') || '搜索引擎名称',
            required: true
        },
        {
            type: 'url',
            id: 'custom-engine-url',
            label: I18n.getMessage('engineSearchUrl') || '搜索URL',
            placeholder: 'https://www.example.com/search?q=%s',
            required: true
        },
        {
            type: 'url',
            id: 'custom-engine-icon',
            label: I18n.getMessage('engineIconUrl') || '图标URL（可选）',
            required: false
        }
    ];

    Utils.UI.showFormModal(
        I18n.getMessage('addCustomSearchEngine') || '添加自定义搜索引擎',
        formItems,
        (formData) => {
            const name = formData['custom-engine-name'];
            const url = formData['custom-engine-url'];
            const icon = formData['custom-engine-icon'];
            
            SearchEngineAPI.addCustomEngine({ name, url, icon })
                .then(success => {
                    if (!success) {
                        Utils.UI.notify({
                            title: I18n.getMessage('saveFailed') || '保存失败',
                            message: '',
                            duration: 0,
                            type: 'error',
                            buttons: [{
                                text: I18n.getMessage('ok') || '确定',
                                class: 'btn-primary error-ok',
                                callback: () => {}
                            }]
                        });
                    }
                });
        }
    );
}

/**
 * 处理搜索引擎数据变更和同步
 * @param {Array} newEngines - 新的搜索引擎数组
 * @param {number} activeIndex - 新的活动引擎索引
 * @returns {Promise<boolean>} - 操作是否成功
 */
async function updateSearchEngines(newEngines, activeIndex = null) {
    try {
        // 保存到存储
        await chrome.storage.local.set({ [STORAGE_KEYS.ENGINES]: newEngines });
        
        // 更新内存中的引擎列表
        searchEngines = [...newEngines];
        
        // 设置活动引擎
        if (activeIndex !== null && activeIndex >= 0 && activeIndex < searchEngines.length) {
            currentEngineIndex = activeIndex;
            await chrome.storage.local.set({
                [STORAGE_KEYS.CURRENT_ENGINE]: {
                    baseUrl: searchEngines[activeIndex].url,
                    name: searchEngines[activeIndex].name,
                    searchParam: getSearchParamFromUrl(searchEngines[activeIndex].url)
                }
            });
        }
        
        // 重新渲染选择器
        renderSearchEngineSelector();
        return true;
    } catch (error) {
        searchEngines = defaultEngines;
        currentEngineIndex = 0;
        return false;
    }
}

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

