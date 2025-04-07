/**
 * 新标签页主要程序
 * 负责协调各模块的初始化和交互
 */

import { initI18n, getI18nMessage } from './modules/i18n.js';
import { 
    initBackgroundImage, 
    setupBackgroundEvents,
    refreshBackgroundImage
} from './modules/backgroundImage.js';
import { 
    initSearchEngine, 
    setupSearchEvents 
} from './modules/searchEngine.js';
import { 
    initBookmarks, 
    setupBookmarkEvents 
} from './modules/bookmarks.js';
import { 
    initIconManager, 
    preloadIcons,
    cleanupIconCache
} from './modules/iconManager.js';
import { 
    updateClock,
    initClockWidget   
} from './modules/clockWidget.js';
import { 
    showLoadingIndicator,
    hideLoadingIndicator,
    updateLoadingProgress,
    showErrorMessage,
    showNotification,
    initUIEvents,
    showModal,
    createElement // 添加这一行导入createElement函数
} from './modules/utils.js';

// 版本号
let VERSION = '0.0.0'; 

// 全局状态标志
let isInitialized = false;

/**
 * 从manifest.json获取扩展版本号
 * @returns {Promise<string>} 版本号
 */
async function getExtensionVersion() {
    try {
        const response = await fetch('/manifest.json');
        const manifest = await response.json();
        return manifest.version || '0.0.0';
    } catch (error) {
        console.error('获取版本信息失败', error);
        return '0.0.0';
    }
}

/**
 * 带超时的异步函数执行
 * @param {Function} asyncFunc - 异步函数
 * @param {number} timeout - 超时时间(毫秒)
 * @param {string} moduleName - 模块名称(用于错误信息)
 * @returns {Promise} - 处理结果
 */
async function executeWithTimeout(asyncFunc, timeout = 10000, moduleName = '') {
    return Promise.race([
        asyncFunc(),
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${moduleName}初始化超时`));
            }, timeout);
        })
    ]);
}

/**
 * 初始化应用
 */
async function init() {
    try {
        // 创建基本 UI 结构
        createBasicUI();
        
        // 显示加载界面
        showLoadingIndicator();
        
        // 获取扩展版本
        VERSION = await getExtensionVersion();
        console.log(`New Tab Page v${VERSION} initializing...`);
        
        // 初始化步骤计数
        const totalModules = 7; // 总模块数
        let completedModules = 0;
        
        // 定义初始化步骤
        const initSteps = [
            {
                name: '国际化',
                action: initI18n,
                message: '正在加载国际化资源...',
                completeMessage: '国际化资源加载完成',
                timeout: 5000
            },
            {
                name: '图标管理器',
                action: initIconManager,
                message: '正在加载图标资源...',
                completeMessage: '图标资源加载完成',
                timeout: 5000
            },
            {
                name: '背景图像',
                action: initBackgroundImage,
                message: '正在加载背景图像...',
                completeMessage: '背景图像加载完成',
                timeout: 5000
            },
            {
                name: '搜索引擎',
                action: initSearchEngine,
                message: '正在加载搜索引擎...',
                completeMessage: '搜索引擎加载完成',
                timeout: 5000
            },
            {
                name: '书签',
                action: initBookmarks,
                message: '正在加载书签...',
                completeMessage: '书签加载完成',
                timeout: 5000
            },
            {
                name: '时钟组件',
                action: initClockWidget,
                message: '正在加载时钟组件...',
                completeMessage: '时钟组件加载完成',
                timeout: 5000
            },
            {
                name: '事件初始化',
                action: () => {
                    setupEvents();
                    return Promise.resolve();
                },
                message: '正在初始化事件处理...',
                completeMessage: '加载完成！',
                timeout: 5000
            }
        ];

        // 依次执行初始化步骤
        for (const step of initSteps) {
            try {
                updateLoadingProgress((completedModules / totalModules) * 100, step.message);
                await executeWithTimeout(step.action, step.timeout, step.name);
                completedModules++;
                updateLoadingProgress((completedModules / totalModules) * 100, step.completeMessage);
                console.log(`${step.name} initialized`);
            } catch (error) {
                console.error(`Failed to initialize ${step.name}:`, error);
                throw new Error(`${step.name}加载失败: ${error.message}`);
            }
        }
        
        // 执行应用启动后的额外操作
        await performPostInitTasks();
        
        // 标记初始化完成
        isInitialized = true;
        console.log('New tab page initialization complete');
        
        // 立即隐藏加载界面
        hideLoadingIndicator();
        
    } catch (error) {
        // 处理初始化错误
        console.error('Failed to initialize new tab page:', error);
        showErrorMessage('初始化失败，请刷新页面重试。');
        // 确保在错误情况下也隐藏加载界面
        hideLoadingIndicator();
    }
}

/**
 * 创建基本 UI 结构
 */
function createBasicUI() {
    const container = document.getElementById('container');
    
    // 创建搜索框
    const searchBox = createElement('div', 'search-box', { id: 'search-box' });
    const searchEngineIcon = createElement('img', '', { 
        id: 'search-engine-icon', 
        alt: 'Search Engine' 
    });
    const searchForm = createElement('form', '', { id: 'search-form' });
    const searchInput = createElement('input', '', { 
        id: 'search-input',
        type: 'text',
        placeholder: '搜索...',
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        spellcheck: 'false'
    });
    
    searchForm.appendChild(searchInput);
    searchBox.appendChild(searchEngineIcon);
    searchBox.appendChild(searchForm);
    
    // 创建书签盒子
    const bookmarkBox = createElement('div', '', { id: 'bookmark-box' });
    const folderList = createElement('div', '', { id: 'folder-list' });
    const shortcutList = createElement('div', '', { id: 'shortcut-list' });
    
    bookmarkBox.appendChild(folderList);
    bookmarkBox.appendChild(shortcutList);
    
    // 创建背景按钮
    const backgroundButton = createElement('button', '', { 
        id: 'background-button',
        'data-i18n': 'backgroundButton'
    });
    
    // 添加所有元素到容器
    container.appendChild(searchBox);
    container.appendChild(bookmarkBox);
    container.appendChild(backgroundButton);
}

/**
 * 设置所有模块的事件处理
 */
function setupEvents() {
    // 设置背景相关事件
    setupBackgroundEvents();
    
    // 设置搜索相关事件
    setupSearchEvents();
    
    // 设置书签相关事件
    setupBookmarkEvents();
    
    // 设置通用页面事件
    initUIEvents();
}

/**
 * 启动后执行的任务
 */
async function performPostInitTasks() {
    try {
        // 检查更新或首次安装
        await checkForUpdates();
        
        // 清理过期的缓存数据
        await cleanupCacheData();
        
    } catch (error) {
        console.error('Error in post-initialization tasks:', error);
    }
}

/**
 * 检查更新或首次安装
 */
async function checkForUpdates() {
    try {
        const result = await chrome.storage.local.get('version');
        const oldVersion = result.version || null;
        
        // 保存当前版本
        await chrome.storage.local.set({ version: VERSION });
        
        if (!oldVersion) {
            // 首次安装
            showWelcomeMessage();
        } else if (oldVersion !== VERSION) {
            // 版本更新
            showUpdateMessage(oldVersion, VERSION);
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}


/**
 * 清理过期的缓存数据
 */
async function cleanupCacheData() {
    try {
        // 清理图标缓存
        await cleanupIconCache();
    } catch (error) {
        console.error('Failed to cleanup cache data:', error);
    }
}

/**
 * 显示欢迎消息
 */
function showWelcomeMessage() {
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        // 使用 utils.js 中的 showModal 函数
        showModal('welcome-modal');
    } else {
        // 如果没有预定义的欢迎模态框，使用通知
        showNotification(
            getI18nMessage('welcomeTitle'), 
            getI18nMessage('welcomeMessage'),
            8000,  // 延长显示时间为 8 秒
            'success'  // 使用成功类型的通知样式
        );
    }
}

/**
 * 显示更新消息
 * @param {string} oldVersion - 旧版本号
 * @param {string} newVersion - 新版本号
 */
function showUpdateMessage(oldVersion, newVersion) {
    showNotification(
        getI18nMessage('updateTitle'),
        getI18nMessage('updateMessage').replace('{oldVersion}', oldVersion).replace('{newVersion}', newVersion),
        6000,  // 延长显示时间为 6 秒
        'info'  // 使用信息类型的通知样式
    );
}

/**
 * 刷新页面内容
 * 用于在标签页重新激活时更新内容
 */
async function refreshPageContent() {
    try {
        // 刷新背景图片
        await refreshBackgroundImage();
        // 更新时钟
        updateClock();
    } catch (error) {
        console.error('Failed to refresh page content:', error);
    }
}

/**
 * 处理页面可见性变化
 */
function handleVisibilityChange() {
    if (!document.hidden && isInitialized) {
        // 如果页面变为可见且已初始化，执行刷新操作
        refreshPageContent();
    }
}

// 添加可见性变化事件监听
document.addEventListener('visibilitychange', handleVisibilityChange);

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', init);

// 统一处理加载超时保护
document.addEventListener('DOMContentLoaded', () => {
  // 主超时保护，8秒后如果仍在加载则强制隐藏
  setTimeout(() => {
    hideLoadingIndicator(true);
  }, 8000);
  
  // 页面加载后的备份保护
  window.addEventListener('load', () => {
    setTimeout(() => {
      hideLoadingIndicator(true);
    }, 2000);
  });
});

// 导出版本号
export { VERSION };