/**
 * 事件处理模块 - 管理页面上的各种事件监听器
 */

import { performSearch } from './searchEngine.js';
import { showBookmarkModal } from './bookmarks.js';
import { setBackgroundImage } from './backgroundImage.js';
import { initI18n, getI18nMessage, changeLanguage } from './i18n.js';

// 事件监听器存储，便于后续移除
const eventListeners = new Map();

/**
 * 初始化所有事件处理
 */
export function initEventHandlers() {
    // 初始化一般事件
    initGeneralEvents();
    
    // 初始化键盘事件
    initKeyboardEvents();
    
    // 初始化设置面板事件
    initSettingsPanelEvents();
    
    // 初始化模态框事件
    initModalEvents();
}

/**
 * 初始化一般事件处理
 */
function initGeneralEvents() {
    // 阻止右键菜单默认行为
    addEventHandler(document, 'contextmenu', handleContextMenu);
    
    // 处理外部点击事件，用于关闭菜单、下拉框等
    addEventHandler(document, 'click', handleDocumentClick);
    
    // 处理页面加载完成事件
    addEventHandler(window, 'load', handlePageLoad);
    
    // 处理页面调整大小事件
    addEventHandler(window, 'resize', handleWindowResize);
}

/**
 * 初始化键盘事件处理
 */
function initKeyboardEvents() {
    // 全局键盘快捷键
    addEventHandler(document, 'keydown', handleKeyDown);
    
    // 搜索输入框特殊键处理
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        addEventHandler(searchInput, 'keydown', handleSearchInputKeyDown);
    }
}

/**
 * 初始化设置面板事件
 */
function initSettingsPanelEvents() {
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPanel = document.getElementById('settings-panel');
    const settingsClose = document.getElementById('settings-close');
    
    if (settingsToggle && settingsPanel) {
        // 切换设置面板
        addEventHandler(settingsToggle, 'click', () => {
            settingsPanel.classList.toggle('active');
        });
        
        // 关闭设置面板
        if (settingsClose) {
            addEventHandler(settingsClose, 'click', () => {
                settingsPanel.classList.remove('active');
            });
        }
        
        // 初始化设置选项卡
        initSettingsTabs();
    }
    
    // 初始化语言选择器
    initLanguageSelector();
}

/**
 * 初始化设置选项卡
 */
function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabs.forEach(tab => {
        addEventHandler(tab, 'click', () => {
            // 移除所有活动标签
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // 激活当前标签
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

/**
 * 初始化语言选择器
 */
function initLanguageSelector() {
    const languageSelect = document.getElementById('language-select');
    if (!languageSelect) return;
    
    addEventHandler(languageSelect, 'change', async (e) => {
        const selectedLang = e.target.value;
        await changeLanguage(selectedLang);
        // 刷新页面以应用新语言
        location.reload();
    });
}

/**
 * 初始化模态框事件
 */
function initModalEvents() {
    // 获取所有模态框
    const modals = document.querySelectorAll('.modal');
    
    modals.forEach(modal => {
        // 关闭按钮
        const closeButtons = modal.querySelectorAll('.modal-close');
        closeButtons.forEach(button => {
            addEventHandler(button, 'click', () => {
                modal.style.display = 'none';
            });
        });
        
        // 点击模态框外部关闭
        addEventHandler(modal, 'click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
    
    // 添加书签按钮
    const addBookmarkBtn = document.getElementById('add-bookmark-btn');
    if (addBookmarkBtn) {
        addEventHandler(addBookmarkBtn, 'click', () => {
            showBookmarkModal();
        });
    }
    
    // 添加搜索引擎按钮
    const addSearchEngineBtn = document.getElementById('add-search-engine-btn');
    if (addSearchEngineBtn) {
        addEventHandler(addSearchEngineBtn, 'click', () => {
            const modal = document.getElementById('add-search-engine-modal');
            if (modal) {
                modal.style.display = 'block';
            }
        });
    }
}

/**
 * 处理右键菜单事件
 * @param {Event} e - 事件对象
 */
function handleContextMenu(e) {
    // 如果不是在特定的可编辑元素上，阻止默认行为
    if (!e.target.matches('input, textarea, [contenteditable="true"]')) {
        // 在此可以实现自定义右键菜单
        
        // 暂时只阻止默认行为，避免显示浏览器默认菜单
        // e.preventDefault();
    }
}

/**
 * 处理文档点击事件
 * @param {Event} e - 事件对象
 */
function handleDocumentClick(e) {
    // 关闭搜索建议
    const suggestionsContainer = document.getElementById('search-suggestions');
    const searchInput = document.getElementById('search-input');
    
    if (suggestionsContainer && searchInput) {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.innerHTML = '';
        }
    }
    
    // 关闭下拉菜单
    const dropdowns = document.querySelectorAll('.dropdown-menu.active');
    dropdowns.forEach(dropdown => {
        if (!dropdown.parentElement.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
}

/**
 * 处理页面加载完成事件
 */
function handlePageLoad() {
    // 移除加载屏幕
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500); // 500ms过渡动画后隐藏
    }
    
    // 聚焦搜索框
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        setTimeout(() => {
            searchInput.focus();
        }, 100);
    }
}

/**
 * 处理窗口调整大小事件
 */
function handleWindowResize() {
    // 在这里处理响应式布局的调整
    // 例如根据窗口大小调整元素位置、大小等
}

/**
 * 处理键盘按键事件
 * @param {KeyboardEvent} e - 键盘事件对象
 */
function handleKeyDown(e) {
    // 处理ESC键 - 关闭模态框/面板
    if (e.key === 'Escape') {
        // 关闭所有模态框
        document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
        });
        
        // 关闭设置面板
        document.getElementById('settings-panel')?.classList.remove('active');
        
        // 关闭搜索建议
        document.getElementById('search-suggestions').innerHTML = '';
    }
    
    // 处理F5键 - 刷新背景图片
    if (e.key === 'F5' && !e.ctrlKey) {
        e.preventDefault(); // 阻止默认的页面刷新
        setBackgroundImage(); // 刷新背景图片
    }
    
    // 处理/键 - 聚焦搜索框
    if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
    }
    
    // 处理Alt+S - 打开设置
    if (e.key === 's' && e.altKey) {
        e.preventDefault();
        document.getElementById('settings-panel')?.classList.toggle('active');
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

/**
 * 添加事件监听器并存储引用
 * @param {EventTarget} target - 目标元素
 * @param {string} type - 事件类型
 * @param {Function} handler - 处理函数
 * @param {boolean|Object} [options] - 事件选项
 */
function addEventHandler(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    
    // 为目标元素存储事件处理器
    if (!eventListeners.has(target)) {
        eventListeners.set(target, new Map());
    }
    
    const targetEvents = eventListeners.get(target);
    if (!targetEvents.has(type)) {
        targetEvents.set(type, []);
    }
    
    targetEvents.get(type).push({ handler, options });
}

/**
 * 移除事件监听器
 * @param {EventTarget} target - 目标元素
 * @param {string} [type] - 事件类型，如果未指定则移除所有类型
 */
export function removeEventHandlers(target, type) {
    if (!eventListeners.has(target)) return;
    
    const targetEvents = eventListeners.get(target);
    
    if (type) {
        // 移除特定类型的事件
        if (targetEvents.has(type)) {
            targetEvents.get(type).forEach(({ handler, options }) => {
                target.removeEventListener(type, handler, options);
            });
            targetEvents.delete(type);
        }
    } else {
        // 移除所有事件
        targetEvents.forEach((handlers, eventType) => {
            handlers.forEach(({ handler, options }) => {
                target.removeEventListener(eventType, handler, options);
            });
        });
        eventListeners.delete(target);
    }
}

/**
 * 注册自定义快捷键
 * @param {string} key - 快捷键
 * @param {Function} callback - 回调函数
 * @param {Object} [options] - 选项
 */
export function registerShortcut(key, callback, options = {}) {
    const shortcutHandler = (e) => {
        const keyMatch = e.key.toLowerCase() === key.toLowerCase();
        const ctrlMatch = options.ctrl ? e.ctrlKey : !options.ctrl || e.ctrlKey === options.ctrl;
        const altMatch = options.alt ? e.altKey : !options.alt || e.altKey === options.alt;
        const shiftMatch = options.shift ? e.shiftKey : !options.shift || e.shiftKey === options.shift;
        
        if (keyMatch && ctrlMatch && altMatch && shiftMatch) {
            e.preventDefault();
            callback(e);
        }
    };
    
    addEventHandler(document, 'keydown', shortcutHandler);
    
    // 返回一个函数用于注销快捷键
    return () => {
        document.removeEventListener('keydown', shortcutHandler);
    };
}