/**
 * 搜索引擎处理模块
 */

import { getI18nMessage } from './i18n.js';

// 默认搜索引擎配置
const defaultEngines = [
    {
        name: 'Google',
        url: 'https://www.google.com/search?q=',
        icon: 'images/search_engines/google.png'
    },
    {
        name: 'Bing',
        url: 'https://www.bing.com/search?q=',
        icon: 'images/search_engines/bing.png'
    },
    {
        name: 'Baidu',
        url: 'https://www.baidu.com/s?wd=',
        icon: 'images/search_engines/baidu.png'
    },
    {
        name: 'DuckDuckGo',
        url: 'https://duckduckgo.com/?q=',
        icon: 'images/search_engines/duckduckgo.png'
    },
    {
        name: 'Yahoo',
        url: 'https://search.yahoo.com/search?p=',
        icon: 'images/search_engines/yahoo.png'
    }
];

// 搜索引擎相关变量
let currentEngineIndex = 0;
let searchEngines = [];
let suggestionTimeout = null;

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
 * 加载搜索引擎配置
 * @returns {Promise<void>}
 */
async function loadSearchEngines() {
    try {
        const result = await chrome.storage.sync.get(['searchEngines', 'currentEngineIndex']);
        
        searchEngines = result.searchEngines || defaultEngines;
        currentEngineIndex = result.currentEngineIndex || 0;
        
        // 确保索引在有效范围内
        if (currentEngineIndex >= searchEngines.length) {
            currentEngineIndex = 0;
        }
    } catch (error) {
        console.error('Failed to load search engines:', error);
        // 使用默认配置
        searchEngines = defaultEngines;
        currentEngineIndex = 0;
    }
}

/**
 * 渲染搜索引擎选择器
 */
function renderSearchEngineSelector() {
    const searchEngineIcon = document.getElementById('search-engine-icon');
    const searchEngineMenu = document.getElementById('search-engine-menu');
    
    if (!searchEngineIcon || !searchEngineMenu) return;
    
    // 设置当前搜索引擎图标
    searchEngineIcon.src = searchEngines[currentEngineIndex].icon;
    
    // 清空现有菜单
    searchEngineMenu.innerHTML = '';
    
    // 填充搜索引擎选项
    searchEngines.forEach((engine, index) => {
        const menuItem = document.createElement('div');
        menuItem.classList.add('search-engine-item');
        if (index === currentEngineIndex) {
            menuItem.classList.add('active');
        }
        
        const icon = document.createElement('img');
        icon.src = engine.icon;
        icon.alt = engine.name;
        
        const name = document.createElement('span');
        name.textContent = engine.name;
        
        menuItem.appendChild(icon);
        menuItem.appendChild(name);
        
        menuItem.addEventListener('click', () => {
            setCurrentSearchEngine(index);
        });
        
        searchEngineMenu.appendChild(menuItem);
    });
    
    // 添加自定义搜索引擎选项
    const addCustomEngine = document.createElement('div');
    addCustomEngine.classList.add('search-engine-add');
    addCustomEngine.textContent = getI18nMessage('addCustomSearchEngine');
    addCustomEngine.addEventListener('click', showAddSearchEngineModal);
    
    searchEngineMenu.appendChild(addCustomEngine);
}

/**
 * 初始化搜索功能
 */
function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchForm = document.getElementById('search-form');
    const searchEngineIcon = document.getElementById('search-engine-icon');
    const searchEngineMenu = document.getElementById('search-engine-menu');
    const suggestionsContainer = document.getElementById('search-suggestions');
    
    if (!searchInput || !searchForm) return;
    
    // 搜索表单提交
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            performSearch(query);
        }
    });
    
    // 搜索建议功能
    if (searchInput && suggestionsContainer) {
        searchInput.addEventListener('input', () => {
            clearTimeout(suggestionTimeout);
            const query = searchInput.value.trim();
            
            if (query.length < 2) {
                suggestionsContainer.innerHTML = '';
                return;
            }
            
            suggestionTimeout = setTimeout(() => {
                fetchSearchSuggestions(query);
            }, 300);
        });
        
        // 点击建议项执行搜索
        suggestionsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('suggestion-item')) {
                searchInput.value = e.target.textContent;
                performSearch(e.target.textContent);
                suggestionsContainer.innerHTML = '';
            }
        });
    }
    
    // 搜索引擎选择器
    if (searchEngineIcon && searchEngineMenu) {
        searchEngineIcon.addEventListener('click', () => {
            searchEngineMenu.classList.toggle('active');
        });
        
        // 点击其他区域关闭搜索引擎菜单
        document.addEventListener('click', (e) => {
            if (!searchEngineIcon.contains(e.target) && !searchEngineMenu.contains(e.target)) {
                searchEngineMenu.classList.remove('active');
            }
        });
    }
}

/**
 * 设置当前使用的搜索引擎
 * @param {number} index - 搜索引擎索引
 */
export async function setCurrentSearchEngine(index) {
    if (index < 0 || index >= searchEngines.length) return;
    
    currentEngineIndex = index;
    await chrome.storage.sync.set({ currentEngineIndex });
    
    // 更新UI
    const searchEngineIcon = document.getElementById('search-engine-icon');
    if (searchEngineIcon) {
        searchEngineIcon.src = searchEngines[currentEngineIndex].icon;
    }
    
    // 更新菜单中的活动项
    const menuItems = document.querySelectorAll('.search-engine-item');
    menuItems.forEach((item, i) => {
        if (i === currentEngineIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // 关闭菜单
    const searchEngineMenu = document.getElementById('search-engine-menu');
    if (searchEngineMenu) {
        searchEngineMenu.classList.remove('active');
    }
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
    window.open(searchUrl, '_self');
}

/**
 * 获取搜索建议
 * @param {string} query - 搜索查询
 */
async function fetchSearchSuggestions(query) {
    const suggestionsContainer = document.getElementById('search-suggestions');
    if (!suggestionsContainer || !query) return;
    
    try {
        // 根据当前搜索引擎获取建议API
        let suggestionsUrl;
        switch (searchEngines[currentEngineIndex].name.toLowerCase()) {
            case 'google':
                suggestionsUrl = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
                break;
            case 'bing':
                suggestionsUrl = `https://api.bing.com/qsonhs.aspx?q=${encodeURIComponent(query)}`;
                break;
            case 'baidu':
                suggestionsUrl = `https://suggestion.baidu.com/su?wd=${encodeURIComponent(query)}&action=opensearch`;
                break;
            default:
                // 如果没有特定API，清空建议并返回
                suggestionsContainer.innerHTML = '';
                return;
        }
        
        // 获取搜索建议
        const response = await fetch(suggestionsUrl);
        const data = await response.json();
        
        // 解析不同格式的响应
        let suggestions = [];
        if (Array.isArray(data) && data.length > 1) {
            // Google、Baidu格式
            suggestions = data[1].slice(0, 5);
        } else if (data.AS && data.AS.Results && data.AS.Results.length > 0) {
            // Bing格式
            suggestions = data.AS.Results[0].Suggests.map(s => s.Txt).slice(0, 5);
        }
        
        // 渲染建议
        suggestionsContainer.innerHTML = '';
        suggestions.forEach(suggestion => {
            const suggestionItem = document.createElement('div');
            suggestionItem.classList.add('suggestion-item');
            suggestionItem.textContent = suggestion;
            suggestionsContainer.appendChild(suggestionItem);
        });
    } catch (error) {
        console.error('Failed to fetch search suggestions:', error);
        suggestionsContainer.innerHTML = '';
    }
}

/**
 * 显示添加自定义搜索引擎模态框
 */
function showAddSearchEngineModal() {
    const modal = document.getElementById('add-search-engine-modal');
    if (!modal) return;
    
    modal.style.display = 'block';
    
    // 清空输入框
    document.getElementById('custom-engine-name').value = '';
    document.getElementById('custom-engine-url').value = '';
    document.getElementById('custom-engine-icon').value = '';
    
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
    const url = urlInput.value.trim();
    const icon = iconInput.value.trim() || 'images/search_engines/custom.png';
    
    if (!name || !url) {
        alert(getI18nMessage('pleaseCompleteAllFields'));
        return;
    }
    
    // 添加新的搜索引擎
    const newEngine = { name, url, icon };
    searchEngines.push(newEngine);
    
    // 保存到存储中
    await chrome.storage.sync.set({ searchEngines });
    
    // 切换到新添加的搜索引擎
    await setCurrentSearchEngine(searchEngines.length - 1);
    
    // 重新渲染搜索引擎选择器
    renderSearchEngineSelector();
    
    // 关闭模态框
    const modal = document.getElementById('add-search-engine-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * 删除搜索引擎
 * @param {number} index - 搜索引擎索引
 */
export async function removeSearchEngine(index) {
    if (index < 0 || index >= searchEngines.length || searchEngines.length <= 1) return;
    
    // 删除搜索引擎
    searchEngines.splice(index, 1);
    
    // 如果删除的是当前选中的引擎，则切换到第一个
    if (currentEngineIndex === index) {
        currentEngineIndex = 0;
    } else if (currentEngineIndex > index) {
        // 如果删除的引擎在当前选中引擎之前，需要调整索引
        currentEngineIndex--;
    }
    
    // 保存更改
    await chrome.storage.sync.set({
        searchEngines,
        currentEngineIndex
    });
    
    // 重新渲染搜索引擎选择器
    renderSearchEngineSelector();
}

/**
 * 编辑搜索引擎
 * @param {number} index - 搜索引擎索引
 * @param {Object} engineData - 新的搜索引擎数据
 */
export async function editSearchEngine(index, engineData) {
    if (index < 0 || index >= searchEngines.length) return;
    
    // 更新搜索引擎数据
    searchEngines[index] = {...searchEngines[index], ...engineData};
    
    // 保存更改
    await chrome.storage.sync.set({ searchEngines });
    
    // 重新渲染搜索引擎选择器
    renderSearchEngineSelector();
}

/**
 * 获取当前所有搜索引擎配置
 * @returns {Array} - 搜索引擎配置数组
 */
export function getAllSearchEngines() {
    return [...searchEngines];
}

/**
 * 获取当前活动的搜索引擎
 * @returns {Object} - 当前搜索引擎配置
 */
export function getCurrentSearchEngine() {
    return searchEngines[currentEngineIndex];
}