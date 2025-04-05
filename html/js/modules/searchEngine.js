/**
 * 搜索引擎处理模块
 */

import { getI18nMessage } from './i18n.js';
import { setIconForElement, handleIconError } from './iconManager.js';
import { getDomain } from './utils.js';

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
    
    if (!searchEngineIcon) return;
    
    // 设置当前搜索引擎图标
    searchEngineIcon.src = searchEngines[currentEngineIndex].icon;
    
    // 如果没有菜单，创建一个
    if (!searchEngineMenu) {
        const menu = document.createElement('div');
        menu.id = 'search-engine-menu';
        menu.className = 'search-engine-menu';
        menu.style.cssText = 'position:absolute;top:100%;left:0;background:white;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:1000;display:none;overflow:auto;max-height:300px;';
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
        icon.src = engine.icon;
        icon.alt = engine.name;
        icon.style.cssText = 'width:20px;height:20px;margin-right:10px;';
        
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
    
    // 为搜索引擎图标添加点击事件
    searchEngineIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menuElement.style.display = menuElement.style.display === 'block' ? 'none' : 'block';
    });
    
    // 点击其他区域关闭菜单
    document.addEventListener('click', (e) => {
        if (!searchEngineIcon.contains(e.target) && !menuElement.contains(e.target)) {
            menuElement.style.display = 'none';
        }
    });
}

/**
 * 初始化搜索功能
 */
function initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchForm = document.getElementById('search-form') || document.getElementById('search-box'); // 兼容处理
    const searchEngineIcon = document.getElementById('search-engine-icon');
    const searchEngineMenu = document.getElementById('search-engine-menu');
    
    if (!searchInput || !searchForm) {
        console.error('Search form elements not found');
        return;
    }
    
    // 修复：确保搜索表单有正确的ID
    if (searchForm && searchForm.id !== 'search-form') {
        searchForm.id = 'search-form';
    }
    
    // 搜索表单提交
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            performSearch(query);
        }
    });
    
    // 创建搜索建议容器（如果不存在）
    let suggestionsContainer = document.getElementById('search-suggestions');
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'search-suggestions';
        suggestionsContainer.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:white;border-radius:0 0 5px 5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:999;display:none;';
        searchForm.appendChild(suggestionsContainer);
    }
    
    // 搜索建议功能
    if (searchInput && suggestionsContainer) {
        searchInput.addEventListener('input', () => {
            clearTimeout(suggestionTimeout);
            const query = searchInput.value.trim();
            
            if (query.length < 2) {
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
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
                suggestionsContainer.style.display = 'none';
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
            item.style.backgroundColor = '#f0f0f0';
        } else {
            item.classList.remove('active');
            item.style.backgroundColor = '';
        }
    });
    
    // 关闭菜单
    const searchEngineMenu = document.getElementById('search-engine-menu');
    if (searchEngineMenu) {
        searchEngineMenu.style.display = 'none';
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
                suggestionsContainer.style.display = 'none';
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
        
        if (suggestions.length > 0) {
            suggestionsContainer.style.display = 'block';
            
            suggestions.forEach(suggestion => {
                const suggestionItem = document.createElement('div');
                suggestionItem.classList.add('suggestion-item');
                suggestionItem.style.cssText = 'padding:8px 15px;cursor:pointer;font-size:14px;';
                suggestionItem.textContent = suggestion;
                
                suggestionItem.addEventListener('mouseover', () => {
                    suggestionItem.style.backgroundColor = '#f0f0f0';
                });
                
                suggestionItem.addEventListener('mouseout', () => {
                    suggestionItem.style.backgroundColor = '';
                });
                
                suggestionsContainer.appendChild(suggestionItem);
            });
        } else {
            suggestionsContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to fetch search suggestions:', error);
        suggestionsContainer.innerHTML = '';
        suggestionsContainer.style.display = 'none';
    }
}

/**
 * 显示添加自定义搜索引擎模态框
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
            <h2>${getI18nMessage('addCustomSearchEngine') || '添加自定义搜索引擎'}</h2>
            <div class="modal-form">
                <div class="form-group">
                    <label for="custom-engine-name">名称</label>
                    <input type="text" id="custom-engine-name" required>
                </div>
                <div class="form-group">
                    <label for="custom-engine-url">搜索URL (包含 %s 作为搜索词占位符)</label>
                    <input type="url" id="custom-engine-url" placeholder="https://www.example.com/search?q=%s" required>
                </div>
                <div class="form-group">
                    <label for="custom-engine-icon">图标URL (可选)</label>
                    <input type="url" id="custom-engine-icon">
                </div>
                <div class="form-actions">
                    <button id="add-engine-cancel" class="btn">取消</button>
                    <button id="add-engine-confirm" class="btn btn-primary">确认</button>
                </div>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
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
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // 点击模态框外部区域关闭
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
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
    const icon = iconInput.value.trim() || 'images/search_engines/custom.png';
    
    if (!name || !url) {
        alert(getI18nMessage('pleaseCompleteAllFields'));
        return;
    }
    
    // 确保URL包含搜索参数
    if (!url.includes('%s')) {
        url = url + (url.includes('?') ? '&q=%s' : '?q=%s');
    }
    
    // 替换%s为实际的URL参数占位符
    url = url.replace('%s', '');
    
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

/**
 * 设置搜索相关事件处理
 */
export function setupSearchEvents() {
    // 初始化搜索功能
    initSearchEventHandlers();
    
    // 搜索输入框特殊键处理
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', handleSearchInputKeyDown);
    }
    
    // 添加搜索引擎按钮
    const addSearchEngineBtn = document.getElementById('add-search-engine-btn');
    if (addSearchEngineBtn) {
        addSearchEngineBtn.addEventListener('click', () => {
            const modal = document.getElementById('add-search-engine-modal');
            if (modal) {
                modal.style.display = 'block';
            }
        });
    }
}

/**
 * 初始化搜索功能事件处理
 */
function initSearchEventHandlers() {
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
    
    // 搜索表单提交
    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            performSearch(query);
        }
    });
    
    // 创建搜索建议容器（如果不存在）
    let suggestionsContainer = document.getElementById('search-suggestions');
    if (!suggestionsContainer) {
        suggestionsContainer = document.createElement('div');
        suggestionsContainer.id = 'search-suggestions';
        suggestionsContainer.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:white;border-radius:0 0 5px 5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);z-index:999;display:none;';
        searchForm.appendChild(suggestionsContainer);
    }
    
    // 搜索建议功能
    if (searchInput && suggestionsContainer) {
        searchInput.addEventListener('input', () => {
            clearTimeout(suggestionTimeout);
            const query = searchInput.value.trim();
            
            if (query.length < 2) {
                suggestionsContainer.innerHTML = '';
                suggestionsContainer.style.display = 'none';
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
                suggestionsContainer.style.display = 'none';
            }
        });
    }
}

/**
 * 处理搜索输入框特殊键事件
 * @param {KeyboardEvent} e - 键盘事件对象
 */
function handleSearchInputKeyDown(e) {
    const suggestions = document.getElementById('search-suggestions');
    if (!suggestions) return;
    
    const suggestionItems = suggestions.querySelectorAll('.suggestion-item');
    if (suggestionItems.length === 0) return;
    
    // 获取当前选中的建议
    const activeIndex = Array.from(suggestionItems).findIndex(item => item.classList.contains('active'));
    
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            // 选中下一个建议
            if (activeIndex >= 0) {
                suggestionItems[activeIndex].classList.remove('active');
                const nextIndex = (activeIndex + 1) % suggestionItems.length;
                suggestionItems[nextIndex].classList.add('active');
                e.target.value = suggestionItems[nextIndex].textContent;
            } else {
                suggestionItems[0].classList.add('active');
                e.target.value = suggestionItems[0].textContent;
            }
            break;
            
        case 'ArrowUp':
            e.preventDefault();
            // 选中上一个建议
            if (activeIndex >= 0) {
                suggestionItems[activeIndex].classList.remove('active');
                const prevIndex = (activeIndex - 1 + suggestionItems.length) % suggestionItems.length;
                suggestionItems[prevIndex].classList.add('active');
                e.target.value = suggestionItems[prevIndex].textContent;
            } else {
                const lastIndex = suggestionItems.length - 1;
                suggestionItems[lastIndex].classList.add('active');
                e.target.value = suggestionItems[lastIndex].textContent;
            }
            break;
            
        case 'Enter':
            // 如果有选中的建议，则使用它
            const activeItem = suggestions.querySelector('.suggestion-item.active');
            if (activeItem) {
                e.preventDefault();
                e.target.value = activeItem.textContent;
                performSearch(activeItem.textContent);
                suggestions.innerHTML = '';
            }
            break;
            
        case 'Escape':
            // 清空建议并恢复原始输入
            suggestions.innerHTML = '';
            break;
    }
}