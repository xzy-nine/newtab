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
    initClock, 
    updateClock 
} from './modules/clockWidget.js';
import { 
    showLoadingIndicator,
    hideLoadingIndicator,
    updateLoadingProgress,
    showErrorMessage,
    showNotification,
    initUIEvents,
    handleKeyDown
} from './modules/utils.js';

// 当前版本号
const VERSION = '1.1.5';

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
        
        // 初始化各模块 (按依赖顺序)
        console.log('Initializing new tab page...');
        
        // 定义模块总数，用于计算进度
        const totalModules = 7; // 包括 i18n, 图标, 背景, 搜索, 书签, 时钟, 事件初始化
        let completedModules = 0;
        
        try {
            // 1. 首先初始化国际化，因为其他模块可能需要翻译文本
            updateLoadingProgress(0, '正在加载国际化资源...');
            await executeWithTimeout(initI18n, 5000, '国际化');
            completedModules++;
            updateLoadingProgress((completedModules / totalModules) * 100, '国际化资源加载完成');
            console.log('Internationalization initialized');
        } catch (error) {
            console.error('Failed to initialize i18n:', error);
            throw new Error('国际化资源加载失败: ' + error.message);
        }
        
        try {
            // 2. 初始化图标管理器
            updateLoadingProgress((completedModules / totalModules) * 100, '正在加载图标资源...');
            await executeWithTimeout(initIconManager, 5000, '图标管理器');
            completedModules++;
            updateLoadingProgress((completedModules / totalModules) * 100, '图标资源加载完成');
            console.log('Icon manager initialized');
        } catch (error) {
            console.error('Failed to initialize icon manager:', error);
            throw new Error('图标资源加载失败: ' + error.message);
        }

        try {
            // 3. 初始化背景图像
            updateLoadingProgress((completedModules / totalModules) * 100, '正在加载背景图像...');
            await executeWithTimeout(initBackgroundImage, 5000, '背景图像');
            completedModules++;
            updateLoadingProgress((completedModules / totalModules) * 100, '背景图像加载完成');
            console.log('Background image initialized');
        } catch (error) {
            console.error('Failed to initialize background image:', error);
            throw new Error('背景图像加载失败: ' + error.message);
        }
        
        // 在 init 函数内，可以添加一个标记确保只初始化一次
        let searchEngineInitialized = false;

        try {
            // 4. 初始化搜索引擎
            if (!searchEngineInitialized) {
                updateLoadingProgress((completedModules / totalModules) * 100, '正在加载搜索引擎...');
                await executeWithTimeout(initSearchEngine, 5000, '搜索引擎');
                searchEngineInitialized = true;
                completedModules++;
                updateLoadingProgress((completedModules / totalModules) * 100, '搜索引擎加载完成');
                console.log('Search engine initialized');
            }
        } catch (error) {
            console.error('Failed to initialize search engine:', error);
            throw new Error('搜索引擎加载失败: ' + error.message);
        }
        
        try {
            // 5. 初始化书签
            updateLoadingProgress((completedModules / totalModules) * 100, '正在加载书签...');
            await executeWithTimeout(initBookmarks, 5000, '书签');
            completedModules++;
            updateLoadingProgress((completedModules / totalModules) * 100, '书签加载完成');
            console.log('Bookmarks initialized');
        } catch (error) {
            console.error('Failed to initialize bookmarks:', error);
            throw new Error('书签加载失败: ' + error.message);
        }
        
        try {
            // 6. 初始化时钟
            updateLoadingProgress((completedModules / totalModules) * 100, '正在加载时钟组件...');
            initClock();
            completedModules++;
            updateLoadingProgress((completedModules / totalModules) * 100, '时钟组件加载完成');
            console.log('Clock initialized');
        } catch (error) {
            console.error('Failed to initialize clock:', error);
            throw new Error('时钟组件加载失败: ' + error.message);
        }
        
        try {
            // 7. 设置各模块事件
            updateLoadingProgress((completedModules / totalModules) * 100, '正在初始化事件处理...');
            setupEvents();
            completedModules++;
            updateLoadingProgress(100, '加载完成！');
            console.log('Events initialized');
        } catch (error) {
            console.error('Failed to initialize events:', error);
            throw new Error('事件初始化失败: ' + error.message);
        }
        
        // 8. 执行应用启动后的额外操作
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
        welcomeModal.style.display = 'block';
        
        // 添加关闭事件
        const closeBtn = welcomeModal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                welcomeModal.style.display = 'none';
            });
        }
        
        // 点击模态框外部关闭
        window.addEventListener('click', (e) => {
            if (e.target === welcomeModal) {
                welcomeModal.style.display = 'none';
            }
        });
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

// 加载超时保护
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(function() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen && loadingScreen.style.display !== 'none') {
      console.warn('Loading timeout - force hiding loading screen');
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        loadingScreen.style.display = 'none';
      }, 500);
    }
  }, 10000);
});

// 在开始初始化前，设置一个绝对的超时保护
document.addEventListener('DOMContentLoaded', () => {
  // 保持现有的超时保护
  setTimeout(function() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen && loadingScreen.style.display !== 'none') {
      console.warn('Loading timeout - force hiding loading screen');
      // 使用立即模式强制隐藏
      hideLoadingIndicator(true);
    }
  }, 8000); // 缩短到8秒，确保不会等待太久
  
  // 添加备份保护机制，确保页面加载后显示内容
  window.addEventListener('load', () => {
    setTimeout(() => {
      hideLoadingIndicator(true);
    }, 2000); // 页面加载完成2秒后强制隐藏
  });
});

// 导出一些可能在外部使用的函数
export {
    VERSION
};