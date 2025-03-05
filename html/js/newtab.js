/**
 * 新标签页主要程序
 * 负责协调各模块的初始化和交互
 */

import { initI18n, getI18nMessage } from './modules/i18n.js';
import { initBackgroundImage } from './modules/backgroundImage.js';
import { initSearchEngine } from './modules/searchEngine.js';
import { initBookmarks } from './modules/bookmarks.js';
import { initIconManager, preloadIcons } from './modules/iconManager.js';
import { initEventHandlers } from './modules/eventHandlers.js';

// 当前版本号
const VERSION = '1.0.0';

// 全局状态标志
let isInitialized = false;

/**
 * 初始化应用
 */
async function init() {
    try {
        // 显示加载指示器
        showLoadingIndicator();
        
        // 初始化各模块 (按依赖顺序)
        console.log('Initializing new tab page...');
        
        // 1. 首先初始化国际化，因为其他模块可能需要翻译文本
        await initI18n();
        console.log('Internationalization initialized');
        
        // 2. 初始化图标管理器
        await initIconManager();
        console.log('Icon manager initialized');
        
        // 3. 初始化背景图像
        await initBackgroundImage();
        console.log('Background image initialized');
        
        // 4. 初始化搜索引擎
        await initSearchEngine();
        console.log('Search engine initialized');
        
        // 5. 初始化书签
        await initBookmarks();
        console.log('Bookmarks initialized');
        
        // 6. 初始化事件处理
        initEventHandlers();
        console.log('Event handlers initialized');
        
        // 7. 执行应用启动后的额外操作
        await performPostInitTasks();
        
        // 标记初始化完成
        isInitialized = true;
        console.log('New tab page initialization complete');
        
    } catch (error) {
        // 处理初始化错误
        console.error('Failed to initialize new tab page:', error);
        showErrorMessage('初始化失败，请刷新页面重试。');
    } finally {
        // 无论成功或失败，都隐藏加载指示器
        hideLoadingIndicator();
    }
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
 * 显示加载指示器
 */
function showLoadingIndicator() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }
}

/**
 * 隐藏加载指示器
 */
function hideLoadingIndicator() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500); // 500ms过渡动画
    }
}

/**
 * 显示错误消息
 * @param {string} message - 错误消息
 */
function showErrorMessage(message) {
    const errorContainer = document.getElementById('error-container');
    if (!errorContainer) {
        // 如果不存在错误容器，创建一个
        const container = document.createElement('div');
        container.id = 'error-container';
        container.style.cssText = 'position:fixed;top:10px;right:10px;background:#f44336;color:white;padding:10px 20px;border-radius:5px;z-index:1000;box-shadow:0 2px 5px rgba(0,0,0,0.2);';
        
        const messageElement = document.createElement('span');
        messageElement.textContent = message;
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.cssText = 'margin-left:10px;background:none;border:none;color:white;font-size:16px;cursor:pointer;';
        closeButton.addEventListener('click', () => {
            container.style.display = 'none';
        });
        
        container.appendChild(messageElement);
        container.appendChild(closeButton);
        document.body.appendChild(container);
    } else {
        // 如果存在，更新消息
        const messageElement = errorContainer.querySelector('span') || errorContainer;
        messageElement.textContent = message;
        errorContainer.style.display = 'block';
    }
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
 * 显示通知
 * @param {string} title - 通知标题
 * @param {string} message - 通知内容
 * @param {number} [duration=5000] - 显示持续时间(毫秒)
 */
function showNotification(title, message, duration = 5000) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.classList.add('notification');
    notification.style.cssText = 'position:fixed;bottom:20px;right:20px;width:300px;background:white;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);overflow:hidden;z-index:1000;transform:translateY(100%);transition:transform 0.3s;';
    
    // 添加通知内容
    notification.innerHTML = `
        <div style="padding:15px;border-bottom:1px solid #eee;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <h3 style="margin:0;font-size:16px;">${title}</h3>
                <button class="close-btn" style="background:none;border:none;font-size:16px;cursor:pointer;">&times;</button>
            </div>
            <p style="margin:10px 0 0;font-size:14px;">${message}</p>
        </div>
    `;
    
    // 添加到文档
    document.body.appendChild(notification);
    
    // 显示通知
    setTimeout(() => {
        notification.style.transform = 'translateY(0)';
    }, 100);
    
    // 添加关闭按钮事件
    const closeBtn = notification.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        closeNotification();
    });
    
    // 定时关闭
    const timeoutId = setTimeout(() => {
        closeNotification();
    }, duration);
    
    // 关闭通知函数
    function closeNotification() {
        notification.style.transform = 'translateY(100%)';
        clearTimeout(timeoutId);
        
        // 动画结束后移除DOM
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }
}

/**
 * 处理页面可见性变化
 * 当页面从隐藏变为可见时，可能需要刷新某些数据
 */
function handleVisibilityChange() {
    if (!document.hidden && isInitialized) {
        // 如果页面变为可见且已初始化，执行刷新操作
        refreshPageContent();
    }
}

/**
 * 刷新页面内容
 * 用于在标签页重新激活时更新内容
 */
async function refreshPageContent() {
    try {
        // 这里可以添加需要刷新的内容
        // 例如刷新背景图片、更新时间等
    } catch (error) {
        console.error('Failed to refresh page content:', error);
    }
}

// 添加可见性变化事件监听
document.addEventListener('visibilitychange', handleVisibilityChange);

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', init);

// 导出一些可能在外部使用的函数
export {
    VERSION,
    showNotification,
    showErrorMessage
};