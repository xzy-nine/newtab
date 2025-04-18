/**
 * 新标签页主要程序
 * 负责协调各模块的初始化和交互
 */

import { I18n } from './modules/i18n.js';
// 导入背景管理器实例
import backgroundManager from './modules/backgroundImage.js';
import { SearchEngineAPI } from './modules/searchEngine.js';  // 更新导入，使用新API
import { BookmarkManager } from './modules/bookmarks.js';
import { ClockWidget } from './modules/clockWidget.js';
import { Utils } from './modules/utils.js';

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
                reject(new Error(I18n.getMessage('moduleInitTimeout').replace('{0}', moduleName)));
            }, timeout);
        })
    ]);
}

/**
 * 初始化应用
 */
async function init() {
    try {
        // 创建基本 UI 结构（不包括搜索框）
        createBasicUI();
        
        // 显示加载界面
        Utils.UI.showLoadingIndicator();
        
        // 先初始化国际化模块，这样后面才能使用它
        await executeWithTimeout(
            () => I18n.init(), 
            5000, 
            '国际化'
        );
        
        // 获取扩展版本
        VERSION = await getExtensionVersion();
        console.log(`${I18n.getMessage('initializingTitle')} v${VERSION}`);
        
        // 初始化步骤计数
        const totalModules = 5; // 减少一个模块，因为国际化已经初始化了
        let completedModules = 1; // 已经完成了一个模块(国际化)
        
        // 定义初始化步骤 - 移除国际化步骤，因为已经初始化了
        const initSteps = [
            {
                name: '背景图像',
                action: backgroundManager.initialize.bind(backgroundManager),
                message: I18n.getMessage('loadingBackground'),
                completeMessage: '背景图像加载完成',
                timeout: 5000
            },
            {
                name: '搜索引擎',
                action: SearchEngineAPI.initialize.bind(SearchEngineAPI),
                message: I18n.getMessage('loadingSearch'),
                completeMessage: '搜索引擎加载完成',
                timeout: 5000
            },
            {
                name: '书签',
                action: BookmarkManager.init.bind(BookmarkManager),
                message: I18n.getMessage('loadingBookmarks'),
                completeMessage: '书签加载完成',
                timeout: 5000
            },
            {
                name: '时钟组件',
                action: ClockWidget.init.bind(ClockWidget),
                message: I18n.getMessage('loadingClock'),
                completeMessage: '时钟组件加载完成',
                timeout: 5000
            },
            {
                name: '事件初始化',
                action: () => {
                    setupEvents();
                    // 确保国际化的事件也被设置
                    I18n.setupEvents();
                    return Promise.resolve();
                },
                message: I18n.getMessage('loadingEvents'),
                completeMessage: I18n.getMessage('loadingComplete'),
                timeout: 5000
            }
        ];

        // 依次执行初始化步骤
        for (const step of initSteps) {
            try {
                Utils.UI.updateLoadingProgress((completedModules / totalModules) * 100, step.message);
                await executeWithTimeout(step.action, step.timeout, step.name);
                completedModules++;
                Utils.UI.updateLoadingProgress((completedModules / totalModules) * 100, step.completeMessage);
        } catch (error) {
                throw new Error(I18n.getMessage('moduleLoadingFailed')
                    .replace('{0}', step.name)
                    .replace('{1}', error.message));
            }
        }
        
        await performPostInitTasks();
        isInitialized = true;
        Utils.UI.hideLoadingIndicator();
        
    } catch (error) {
        Utils.UI.showErrorMessage(I18n.getMessage('initializationFailed'));
        Utils.UI.hideLoadingIndicator();
    }
}

/**
 * 创建基本 UI 结构
 */
function createBasicUI() {
    const container = document.getElementById('container');
    
    // 创建书签盒子
    const bookmarkBox = Utils.createElement('div', '', { id: 'bookmark-box' });
    const folderList = Utils.createElement('div', '', { id: 'folder-list' });
    const shortcutList = Utils.createElement('div', '', { id: 'shortcut-list' });
    
    bookmarkBox.appendChild(folderList);
    bookmarkBox.appendChild(shortcutList);
    
    // 创建背景按钮
    const backgroundButton = Utils.createElement('button', '', { 
        id: 'background-button',
        'data-i18n': 'backgroundButton'
    });
    
    // 添加所有元素到容器
    container.appendChild(bookmarkBox);
    container.appendChild(backgroundButton);
}

/**
 * 设置所有模块的事件处理
 */
function setupEvents() {
    // 设置背景相关事件 - 使用新API
    backgroundManager.setupEvents();
    
    // 设置搜索相关事件 - 使用新API
    SearchEngineAPI.setupEvents();
    
    // 设置书签相关事件
    BookmarkManager.initEvents();
    
    // 设置通用页面事件
    Utils.Events.initUIEvents();
}

/**
 * 启动后执行的任务
 */
async function performPostInitTasks() {
    try {
        // 检查更新或首次安装
        await checkForUpdates();
        
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
        await chrome.storage.local.set({ version: VERSION });
        
        if (!oldVersion) {
            showWelcomeMessage();
        } else if (oldVersion !== VERSION) {
            showUpdateMessage(oldVersion, VERSION);
        }
    } catch (error) {
        // 静默处理错误
    }
}

/**
 * 显示欢迎消息
 */
function showWelcomeMessage() {
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        // 使用模块化API
        Utils.Modal.show('welcome-modal');
    } else {
        // 如果没有预定义的欢迎模态框，使用通知
        Utils.UI.showNotification(
            I18n.getMessage('welcomeTitle'), 
            I18n.getMessage('welcomeMessage'),
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
    Utils.UI.showNotification(
        I18n.getMessage('updateTitle'),
        I18n.getMessage('updateMessage').replace('{oldVersion}', oldVersion).replace('{newVersion}', newVersion),
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
        // 使用新的背景管理器API
        await backgroundManager.refresh();
        ClockWidget.update();
    } catch (error) {
        // 静默处理错误
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
    Utils.UI.hideLoadingIndicator(true);
  }, 8000);
  
  // 页面加载后的备份保护
  window.addEventListener('load', () => {
    setTimeout(() => {
      Utils.UI.hideLoadingIndicator(true);
    }, 2000);
  });
});

// 导出版本号
export { VERSION };