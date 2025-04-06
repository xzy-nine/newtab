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
    preloadIcons 
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
    handleKeyDown,
    showModal
} from './modules/utils.js';

// 版本号，从manifest.json读取
let VERSION = '0.0.0'; // 默认值，将在初始化时更新

/**
 * 从manifest.json获取扩展版本号
 * @returns {Promise<string>} 版本号
 */
async function getExtensionVersion() {
    try {
        const manifestResponse = await fetch('/manifest.json');
        if (!manifestResponse.ok) {
            throw new Error(`无法加载manifest.json: ${manifestResponse.status}`);
        }
        const manifest = await manifestResponse.json();
        return manifest.version || '0.0.0';
    } catch (error) {
        console.error('读取版本号失败:', error);
        return '0.0.0';
    }
}

// 全局状态标志
let isInitialized = false;

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
        // 显示加载指示器
        showLoadingIndicator();
        
        // 首先读取版本号
        VERSION = await getExtensionVersion();
        console.log(`初始化新标签页，版本: ${VERSION}`);
        
        // 初始化各模块 (按依赖顺序)
        console.log('Initializing new tab page...');
        
        // 定义模块总数，用于计算进度
        const totalModules = 7; // 包括 i18n, 图标, 背景, 搜索, 书签, 时钟, 事件初始化
        let completedModules = 0;
        
        // 定义初始化步骤数组，使代码更统一
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
                action: () => {
                    initClockWidget(); // 将 initClock() 改为 initClockWidget()
                    return Promise.resolve();
                },
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
        
        // 预加载常用网站图标
        await preloadCommonIcons();
        
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
        const result = await chrome.storage.sync.get('version');
        const oldVersion = result.version;
        
        if (!oldVersion) {
            // 首次安装
            console.log('First install detected');
            showWelcomeMessage();
        } else if (oldVersion !== VERSION) {
            // 更新
            console.log('Update detected:', oldVersion, '->', VERSION);
            showUpdateMessage(oldVersion, VERSION);
        }
        
        // 存储当前版本
        await chrome.storage.sync.set({ version: VERSION });
        
    } catch (error) {
        console.error('Failed to check for updates:', error);
    }
}

/**
 * 预加载常用网站图标
 */
async function preloadCommonIcons() {
    // 常用网站列表
    const commonSites = [
        'https://www.google.com',
        'https://www.youtube.com',
        'https://www.facebook.com',
        'https://www.twitter.com',
        'https://www.github.com',
        'https://www.amazon.com',
        'https://www.wikipedia.org',
        'https://www.reddit.com'
    ];
    
    // 预加载图标
    await preloadIcons(commonSites);
}

/**
 * 清理过期的缓存数据
 */
async function cleanupCacheData() {
    // 这里可以清理各种缓存数据
    // 例如过期的背景图片、搜索建议缓存等
}

/**
 * 显示欢迎消息
 */
function showWelcomeMessage() {
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        // 使用utils.js中的函数替代手动显示
        showModal('welcome-modal');
    } else {
        // 如果没有预定义的欢迎模态框，使用通知
        showNotification(
            getI18nMessage('welcomeTitle'), 
            getI18nMessage('welcomeMessage')
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
        getI18nMessage('updateMessage').replace('{oldVersion}', oldVersion).replace('{newVersion}', newVersion)
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

// 导出一些可能在外部使用的函数
export {
    VERSION
};

function initPage() {
    // ...现有的代码...
    
    // 初始化时钟组件
    initClockWidget();
    
    // ...其他初始化代码...
}