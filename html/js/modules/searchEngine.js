/**
 * 搜索引擎处理模块
 */

import { getI18nMessage } from './i18n.js';
import { setIconForElement, handleIconError } from './iconManager.js';
import { getDomain } from './utils.js';

// 默认搜索引擎配置
const defaultEngines = [
    {
        name: 'Bing',
        url: 'https://www.bing.com/search?q=',
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
 * 初始化搜索引擎
 * @returns {Promise<void>}
 */
export async function initSearchEngine() {
    // 从存储中加载搜索引擎配置
    await loadSearchEngines();
    
    // 渲染搜索引擎选择器
    renderSearchEngineSelector();
    
    // 初始化搜索功能
    initSearch();
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
        // 直接从存储中获取搜索引擎列表
        const allEnginesData = await getFromStorage(STORAGE_KEYS.ENGINES);
        const allEngines = allEnginesData[STORAGE_KEYS.ENGINES] || [];
        
        // 确保搜索引擎列表有效
        searchEngines = allEngines && allEngines.length > 0 ? allEngines : defaultEngines;
        
        // 如果没有搜索引擎，设置默认搜索引擎
        if (allEngines.length === 0) {
            try {
                await saveToStorage({ [STORAGE_KEYS.ENGINES]: defaultEngines });
            } catch (err) {
                console.warn("保存默认搜索引擎失败:", err);
            }
        }
        
        // 获取当前活跃搜索引擎
        const currentEngineData = await getFromStorage(STORAGE_KEYS.CURRENT_ENGINE);
        const currentEngine = currentEngineData[STORAGE_KEYS.CURRENT_ENGINE];
        
        // 设置当前引擎索引
        if (currentEngine && currentEngine.name) {
            const foundIndex = searchEngines.findIndex(engine => engine.name === currentEngine.name);
            currentEngineIndex = foundIndex !== -1 ? foundIndex : 0;
        } else {
            currentEngineIndex = 0;
            
            // 设置第一个为当前引擎
            try {
                await saveToStorage({
                    [STORAGE_KEYS.CURRENT_ENGINE]: {
                        baseUrl: searchEngines[0].url,
                        name: searchEngines[0].name,
                        searchParam: getSearchParamFromUrl(searchEngines[0].url)
                    }
                });
            } catch (err) {
                console.warn("同步当前引擎失败:", err);
            }
        }
    } catch (error) {
        console.error('加载搜索引擎失败:', error);
        // 使用默认配置
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
    // 处理URL为空或不包含查询参数的情况
    if (!url || !url.includes('?')) {
        return 'q'; // 仍保留默认值作为后备选项
    }
    
    try {
        const searchPart = url.split('?')[1];
        // 处理可能包含多个参数的情况
        const params = searchPart.split('&');
        for (const param of params) {
            // 找到第一个包含等号的参数
            if (param.includes('=')) {
                return param.split('=')[0];
            }
        }
        
        // 如果无法找到参数名但URL中包含查询部分，尝试分析URL格式
        const urlObj = new URL(url);
        const searchParams = new URLSearchParams(urlObj.search);
        
        // 检查常见的搜索参数名称
        const commonParams = ['q', 'query', 'search', 'text', 'keyword', 'wd', 'word', 'kw', 'key'];
        for (const param of commonParams) {
            if (searchParams.has(param)) {
                return param;
            }
        }
        
        // 如果仍然找不到，返回URL中第一个参数名
        const firstParam = searchParams.keys().next().value;
        return firstParam || 'q';
    } catch (e) {
        console.warn('无法解析搜索参数:', e);
        return 'q'; // 出错时返回默认值
    }
}

/**
 * 渲染搜索引擎选择器
 */
function renderSearchEngineSelector() {
    const searchEngineIcon = document.getElementById('search-engine-icon');
    const searchEngineMenu = document.getElementById('search-engine-menu');
    
    if (!searchEngineIcon) return;
    
    // 设置当前搜索引擎图标
    setIconForElement(searchEngineIcon, searchEngines[currentEngineIndex].url);
    searchEngineIcon.onerror = () => handleIconError(searchEngineIcon, 'images/search_engines/custom.png');
    
    // 修复：添加固定尺寸和样式
    searchEngineIcon.style.cssText = 'width:24px;height:24px;margin:0 15px;cursor:pointer;object-fit:contain;';
    
    // 如果没有菜单，创建一个
    if (!searchEngineMenu) {
        const menu = document.createElement('div');
        menu.id = 'search-engine-menu';
        menu.className = 'search-engine-menu';
        menu.style.cssText = 'position:absolute;top:100%;left:0;background:white;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;display:none;overflow:auto;max-height:300px;width:200px;';
        document.getElementById('search-box')?.appendChild(menu);
    }
    
    // 获取菜单元素（可能是刚创建的）
    const menuElement = document.getElementById('search-engine-menu');
    if (!menuElement) return;
    
    // 清空现有菜单
    menuElement.innerHTML = '';
    
    // 填充搜索引擎选项
    searchEngines.forEach((engine, index) => {
        const menuItem = document.createElement('div');
        menuItem.classList.add('search-engine-item');
        menuItem.style.cssText = 'padding:10px;display:flex;align-items:center;cursor:pointer;';
        if (index === currentEngineIndex) {
            menuItem.classList.add('active');
            menuItem.style.backgroundColor = '#f0f0f0';
        }
        
        const icon = document.createElement('img');
        setIconForElement(icon, engine.url);
        icon.alt = engine.name;
        // 修复：统一图标尺寸
        icon.style.cssText = 'width:20px;height:20px;margin-right:10px;object-fit:contain;';
        icon.onerror = () => handleIconError(icon, 'images/search_engines/custom.png');
        
        const name = document.createElement('span');
        name.textContent = engine.name;
        
        menuItem.appendChild(icon);
        menuItem.appendChild(name);
        
        menuItem.addEventListener('click', () => {
            setCurrentSearchEngine(index);
        });
        
        menuElement.appendChild(menuItem);
    });
    
    // 添加自定义搜索引擎选项
    const addCustomEngine = document.createElement('div');
    addCustomEngine.classList.add('search-engine-add');
    addCustomEngine.textContent = getI18nMessage('addCustomSearchEngine') || '添加自定义搜索引擎';
    addCustomEngine.style.cssText = 'padding:10px;border-top:1px solid #eee;text-align:center;cursor:pointer;';
    addCustomEngine.addEventListener('click', showAddSearchEngineModal);
    
    menuElement.appendChild(addCustomEngine);
    
    // 修复：重新绑定事件但不替换元素
    // 先移除可能存在的旧事件监听器
    searchEngineIcon.replaceWith(searchEngineIcon.cloneNode(false));
    // 重新获取元素
    const iconElement = document.getElementById('search-engine-icon');
    // 重新设置图标
    setIconForElement(iconElement, searchEngines[currentEngineIndex].url);
    iconElement.onerror = () => handleIconError(iconElement, 'images/search_engines/custom.png');
    iconElement.style.cssText = 'width:24px;height:24px;margin:0 15px;cursor:pointer;object-fit:contain;';
    
    // 为搜索引擎图标添加点击事件
    iconElement.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menuElement.style.display = menuElement.style.display === 'block' ? 'none' : 'block';
    });
    
    // 点击其他区域关闭菜单
    // 修复：使用一次性添加的方式，避免重复绑定
    if (!window._menuClickHandlerAdded) {
        document.addEventListener('click', (e) => {
            const icon = document.getElementById('search-engine-icon');
            const menu = document.getElementById('search-engine-menu');
            if (icon && menu && !icon.contains(e.target) && !menu.contains(e.target)) {
                menu.style.display = 'none';
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
    const searchForm = document.getElementById('search-form') || document.getElementById('search-box'); // 兼容处理
    
    if (!searchInput || !searchForm) {
        console.error('Search form elements not found');
        return;
    }
    
    // 修复：确保搜索表单有正确的ID
    if (searchForm && searchForm.id !== 'search-form') {
        searchForm.id = 'search-form';
    }
    
    // 修复：移除旧的事件监听器，避免重复绑定
    const newForm = searchForm.cloneNode(true);
    searchForm.parentNode.replaceChild(newForm, searchForm);
    
    // 重新获取输入框（因为克隆替换了原来的表单）
    const newSearchInput = document.getElementById('search-input');
    if (!newSearchInput) {
        console.error('Search input not found after cloning');
        return;
    }
    
    // 搜索表单提交
    newForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = newSearchInput.value.trim();
        if (query) {
            performSearch(query);
        }
    });
}

// 保留原函数名以兼容现有调用
function initSearchEventHandlers() {
    initSearch();
}

/**
 * 设置当前使用的搜索引擎
 * @param {number} index - 搜索引擎索引
 */
export async function setCurrentSearchEngine(index) {
    if (index < 0 || index >= searchEngines.length) return;
    
    currentEngineIndex = index;
    
    // 直接保存到存储
    try {
        await saveToStorage({
            [STORAGE_KEYS.CURRENT_ENGINE]: {
                baseUrl: searchEngines[currentEngineIndex].url,
                name: searchEngines[currentEngineIndex].name,
                searchParam: getSearchParamFromUrl(searchEngines[currentEngineIndex].url)
            }
        });
    } catch (error) {
        console.warn("无法保存当前搜索引擎:", error);
    }
    
    // 更新UI
    renderSearchEngineSelector();
    
    // 确保搜索菜单在选择后关闭
    const searchEngineMenu = document.getElementById('search-engine-menu');
    if (searchEngineMenu) {
        searchEngineMenu.style.display = 'none';
    }
    
    // 注意：由于renderSearchEngineSelector中已经重置过事件绑定，这里不需要再调用initSearch
    // 移除这行代码以避免多次绑定事件: initSearch();
}

/**
 * 执行搜索
 * @param {string} query - 搜索查询
 */
export function performSearch(query) {
    if (!query) return;
    
    const engine = searchEngines[currentEngineIndex];
    const searchUrl = engine.url + encodeURIComponent(query);
    
    // 在新标签页中打开搜索结果
    window.open(searchUrl, '_blank');
}

/**
 * 显示添加自定义搜索引擎模态框
 * 修复：对模态框外部点击事件只绑定一次
 */
function showAddSearchEngineModal() {
    // 检查是否已存在模态框，如果不存在则创建
    let modal = document.getElementById('add-search-engine-modal');
    if (!modal) {
        // 创建模态框
        modal = document.createElement('div');
        modal.id = 'add-search-engine-modal';
        modal.className = 'modal';
        modal.style.cssText = 'display:none;';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        
        modalContent.innerHTML = `
            <span class="modal-close">&times;</span>
            <h2>${getI18nMessage('addCustomSearchEngine')}</h2>
            <div class="modal-form">
                <div class="form-group">
                    <label for="custom-engine-name">${getI18nMessage('engineName')}</label>
                    <input type="text" id="custom-engine-name" required>
                </div>
                <div class="form-group">
                    <label for="custom-engine-url">${getI18nMessage('engineSearchUrl')}</label>
                    <input type="url" id="custom-engine-url" placeholder="https://www.example.com/search?q=%s" required>
                </div>
                <div class="form-group">
                    <label for="custom-engine-icon">${getI18nMessage('engineIconUrl')}</label>
                    <input type="url" id="custom-engine-icon">
                </div>
                <div class="form-actions">
                    <button id="add-engine-cancel" class="btn">${getI18nMessage('cancel')}</button>
                    <button id="add-engine-confirm" class="btn btn-primary">${getI18nMessage('confirm')}</button>
                </div>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // 首次创建时绑定外部点击事件
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 绑定确认按钮事件
    const confirmBtn = document.getElementById('add-engine-confirm');
    if (confirmBtn) {
        // 移除旧的事件监听器
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', addCustomSearchEngine);
    }
    
    // 绑定取消按钮事件
    const cancelBtn = document.getElementById('add-engine-cancel');
    if (cancelBtn) {
        // 移除旧的事件监听器
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // 绑定关闭按钮事件
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
        // 清除旧的事件监听器
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        
        newCloseBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
}

/**
 * 添加自定义搜索引擎
 */
async function addCustomSearchEngine() {
    const nameInput = document.getElementById('custom-engine-name');
    const urlInput = document.getElementById('custom-engine-url');
    const iconInput = document.getElementById('custom-engine-icon');
    
    if (!nameInput || !urlInput || !iconInput) return;
    
    const name = nameInput.value.trim();
    let url = urlInput.value.trim();
    let icon = iconInput.value.trim();
    
    if (!name || !url) {
        alert(getI18nMessage('pleaseCompleteAllFields'));
        return;
    }
    
    // 处理输入的URL，保留原始查询参数
    if (url.includes('%s')) {
        // 用户已经指定了搜索参数格式，直接替换%s为空字符串
        url = url.replace('%s', '');
    } else {
        try {
            // 分析URL，确定正确的查询参数
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            
            // 根据域名判断可能的查询参数
            let searchParam = 'q'; // 默认参数名
            
            // 检查URL是否已经包含某些参数
            if (urlObj.search) {
                // 使用已有的参数结构，仅清空值
                const searchParams = new URLSearchParams(urlObj.search);
                if (searchParams.keys().next().value) {
                    searchParam = searchParams.keys().next().value;
                    // 清空现有参数值
                    searchParams.set(searchParam, '');
                    urlObj.search = searchParams.toString();
                    url = urlObj.toString();
                } else {
                    // 如果没有参数，添加默认参数
                    url = url + (url.includes('?') ? '&' : '?') + searchParam + '=';
                }
            } else {
                // 没有查询参数，添加默认参数
                url = url + '?' + searchParam + '=';
            }
        } catch (e) {
            // URL格式错误，使用简单添加方式
            console.warn('解析URL失败:', e);
            url = url + (url.includes('?') ? '&q=' : '?q=');
        }
    }
    
    // 添加新的搜索引擎
    const newEngine = { name, url, icon };
    const newEngines = [...searchEngines, newEngine];
    
    const success = await updateSearchEngines(newEngines, newEngines.length - 1);
    
    // 关闭模态框
    if (success) {
        const modal = document.getElementById('add-search-engine-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    } else {
        alert(getI18nMessage('saveFailed') || '保存失败');
    }
}

/**
 * 删除搜索引擎
 * @param {number} index - 搜索引擎索引
 */
export async function removeSearchEngine(index) {
    if (index < 0 || index >= searchEngines.length || searchEngines.length <= 1) return;
    
    // 删除搜索引擎
    const newEngines = [...searchEngines];
    newEngines.splice(index, 1);
    
    // 确定新的活动引擎索引
    let newActiveIndex = currentEngineIndex;
    
    if (currentEngineIndex === index) {
        // 如果删除的是当前引擎，切换到第一个
        newActiveIndex = 0;
    } else if (currentEngineIndex > index) {
        // 如果删除的引擎在当前选中引擎之前，需要调整索引
        newActiveIndex--;
    }
    
    await updateSearchEngines(newEngines, newActiveIndex);
}

/**
 * 编辑搜索引擎
 * @param {number} index - 搜索引擎索引
 * @param {Object} engineData - 新的搜索引擎数据
 */
export async function editSearchEngine(index, engineData) {
    if (index < 0 || index >= searchEngines.length) return;
    
    const newEngines = [...searchEngines];
    newEngines[index] = {...newEngines[index], ...engineData};
    
    await updateSearchEngines(newEngines, index === currentEngineIndex ? index : null);
}

/**
 * 获取当前所有搜索引擎配置
 * @returns {Array} - 搜索引擎配置数组
 */
export function getAllSearchEngines() {
    return [...searchEngines];
}

/**
 * 异步获取所有搜索引擎配置（直接从存储获取最新数据）
 * @returns {Promise<Array>} - 搜索引擎配置数组
 */
export async function getAllSearchEnginesAsync() {
    try {
        const data = await getFromStorage(STORAGE_KEYS.ENGINES);
        return data[STORAGE_KEYS.ENGINES] || [];
    } catch (error) {
        console.error('获取所有搜索引擎失败:', error);
        return [...searchEngines]; // 返回内存中的副本
    }
}

/**
 * 获取当前活动的搜索引擎
 * @returns {Object} - 当前搜索引擎配置
 */
export function getCurrentSearchEngine() {
    return searchEngines[currentEngineIndex];
}

/**
 * 处理搜索引擎数据变更和同步
 * @param {Array} newEngines - 新的搜索引擎数组
 * @param {number} activeIndex - 新的活动引擎索引
 * @returns {Promise<boolean>} - 操作是否成功
 */
async function updateSearchEngines(newEngines, activeIndex = null) {
    try {
        // 直接保存到存储
        await saveToStorage({ [STORAGE_KEYS.ENGINES]: newEngines });
        
        // 更新内存中的引擎列表
        searchEngines = [...newEngines];
        
        // 如果指定了活动引擎，则设置
        if (activeIndex !== null && activeIndex >= 0 && activeIndex < searchEngines.length) {
            currentEngineIndex = activeIndex;
            await saveToStorage({
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
        console.error('更新搜索引擎失败:', error);
        return false;
    }
}

// 移除不再需要的通信相关函数
// 保留额外的兼容性函数以防止其他模块调用
export function setupSearchEvents() {
    initSearch();
}