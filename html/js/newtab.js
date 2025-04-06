/**
 * 新标签页主要程序
 * 负责协调各模块的初始化和交互
 */

import { initI18n, getI18nMessage } from './modules/i18n.js';
import { initBackgroundImage, setupBackgroundEvents } from './modules/backgroundImage.js';
import { initSearchEngine, setupSearchEvents } from './modules/searchEngine.js';
import { initBookmarks, setupBookmarkEvents } from './modules/bookmarks.js';
import { initIconManager, preloadIcons } from './modules/iconManager.js';
import { initClock } from './modules/clockWidget.js';

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
        
        // 继续为每个模块添加类似的错误处理...

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
    setupGeneralPageEvents();
    
    // 初始化模态框通用事件
    initModalEvents();
}

/**
 * 设置通用页面事件
 */
function setupGeneralPageEvents() {
    // 处理页面加载完成事件
    window.addEventListener('load', handlePageLoad);
    
    // 处理页面调整大小事件
    window.addEventListener('resize', handleWindowResize);
    
    // 全局键盘快捷键
    document.addEventListener('keydown', handleKeyDown);
    
    // 处理点击事件，关闭弹出菜单等
    document.addEventListener('click', handleDocumentClick);
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
            button.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        });
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });
}

/**
 * 处理文档点击事件
 * @param {Event} e - 事件对象
 */
function handleDocumentClick(e) {
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
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) {
            settingsPanel.classList.remove('active');
        }
        
        // 关闭搜索建议
        const searchSuggestions = document.getElementById('search-suggestions');
        if (searchSuggestions) {
            searchSuggestions.innerHTML = '';
        }
    }
    
    // 处理/键 - 聚焦搜索框
    if (e.key === '/' && !e.target.matches('input, textarea')) {
        e.preventDefault();
        document.getElementById('search-input')?.focus();
    }
    
    // 处理Alt+S - 打开设置
    if (e.key === 's' && e.altKey) {
        e.preventDefault();
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) {
            settingsPanel.classList.toggle('active');
        }
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
        // 创建或获取进度条元素
        let progressBar = document.getElementById('loading-progress-bar');
        if (!progressBar) {
            progressBar = document.createElement('div');
            progressBar.id = 'loading-progress-bar';
            progressBar.style.cssText = 'width:0%;height:4px;background:linear-gradient(90deg,#4285f4,#34a853,#fbbc05,#ea4335);position:absolute;bottom:0;left:0;transition:width 0.3s;border-radius:0 2px 2px 0;';
            loadingScreen.appendChild(progressBar);
        }
        
        // 创建或获取状态文本元素
        let statusText = document.getElementById('loading-status-text');
        if (!statusText) {
            statusText = document.createElement('div');
            statusText.id = 'loading-status-text';
            statusText.style.cssText = 'margin-top:10px;font-size:14px;color:#666;';
            statusText.textContent = '准备加载...';
            loadingScreen.appendChild(statusText);
        }
        
        // 重置进度
        progressBar.style.width = '0%';
        statusText.textContent = '准备加载...';
        
        loadingScreen.style.display = 'flex';
    }
}

/**
 * 隐藏加载指示器
 */
function hideLoadingIndicator() {
    console.log('Hiding loading indicator');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            console.log('Loading screen hidden');
        }, 500);
    }
}

/**
 * 更新加载进度
 * @param {number} percent - 加载百分比(0-100)
 * @param {string} statusMessage - 当前状态消息
 */
function updateLoadingProgress(percent, statusMessage) {
    const progressBar = document.getElementById('loading-progress-bar');
    const statusText = document.getElementById('loading-status-text');
    
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    
    if (statusText && statusMessage) {
        statusText.textContent = statusMessage;
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

// 在 newtab.js 文件中添加
document.addEventListener('DOMContentLoaded', () => {
  // 加载超时保护
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
document.addEventListener('DOMContentLoaded', () => {
    // 首先初始化核心功能
    initCoreFeatures();
    
    // 延迟加载非核心功能
    setTimeout(() => {
        initNonCriticalFeatures();
    }, 500);
});

// 导出一些可能在外部使用的函数
export {
    VERSION,
    showNotification,
    showErrorMessage
};