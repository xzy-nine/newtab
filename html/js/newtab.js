/**
 * 新标签页主要程序
 * 负责协调各模块的初始化和交互
 */

import { I18n } from './modules/i18n.js';
import backgroundManager from './modules/backgroundImage.js';
import { SearchEngineAPI } from './modules/searchEngine.js'; 
import { BookmarkManager } from './modules/bookmarks.js';
import { ClockWidget } from './modules/clockWidget.js';
import { Utils } from './modules/utils.js';
import { Notification } from './modules/notification.js'; 
import { Menu } from './modules/menu.js'; 
import { WidgetSystem } from './modules/widgetSystem.js';
import './modules/settings.js';

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
 * @param {number} timeout - 超时时间(毫秒),
 * @param {string} moduleName - 模块名称(用于错误信息)
 * @returns {Promise} - 处理结果
 */
async function executeWithTimeout(asyncFunc, timeout = 10000, moduleName = '') {
    // 创建状态标记
    let completed = false;
    
    return Promise.race([
        // 执行异步函数并标记完成状态
        new Promise(async (resolve, reject) => {
            try {
                const result = await asyncFunc();
                completed = true;
                resolve(result);
            } catch (error) {
                completed = 'error';
                console.error(`[模块执行错误] ${moduleName}`, {
                    错误信息: error.message,
                    错误堆栈: error.stack,
                    模块名称: moduleName,
                    超时设置: `${timeout}ms`
                });
                reject(error);
            }
        }),
        // 超时处理，但只在没完成时才报错
        new Promise((_, reject) => {
            setTimeout(() => {
                if (!completed) {
                    const timeoutError = new Error(I18n.getMessage('moduleInitTimeout').replace('{0}', moduleName));
                    console.error(`[模块超时] ${moduleName}`, {
                        超时时间: `${timeout}ms`,
                        模块名称: moduleName
                    });
                    reject(timeoutError);
                }
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
        
        // 显示加载界面，使用静态文本而非国际化文本
        Notification.showLoadingIndicator("加载中...");
        
        // 先初始化国际化模块，这样后面才能使用它
        await executeWithTimeout(
            () => I18n.init(), 
            5000, 
            '国际化' // 不使用 getMessage，因为这时还未初始化
        );
        
        // 获取扩展版本
        VERSION = await getExtensionVersion();
        
        // 初始化步骤计数 - 先初始化非小部件相关的模块
        const basicModules = [
            {
                name: I18n.getMessage('backgroundModule', '背景图像'),
                action: backgroundManager.initialize.bind(backgroundManager),
                message: I18n.getMessage('loadingBackground', '加载背景图像...'),
                completeMessage: I18n.getMessage('backgroundLoadComplete', '背景图像加载完成'),
                timeout: 5000
            },
            {
                name: I18n.getMessage('searchModule', '搜索引擎'),
                action: SearchEngineAPI.initialize.bind(SearchEngineAPI),
                message: I18n.getMessage('loadingSearch', '加载搜索引擎...'),
                completeMessage: I18n.getMessage('searchLoadComplete', '搜索引擎加载完成'),
                timeout: 5000
            },
            {
                name: I18n.getMessage('bookmarkModule', '书签'),
                action: BookmarkManager.init.bind(BookmarkManager),
                message: I18n.getMessage('loadingBookmarks', '加载书签...'),
                completeMessage: I18n.getMessage('bookmarkLoadComplete', '书签加载完成'),
                timeout: 5000
            },
            {
                name: I18n.getMessage('clockModule', '时钟组件'),
                action: ClockWidget.init.bind(ClockWidget),
                message: I18n.getMessage('loadingClock', '加载时钟组件...'),
                completeMessage: I18n.getMessage('clockLoadComplete', '时钟组件加载完成'),
                timeout: 5000
            },
            {
                name: I18n.getMessage('eventsModule', '事件初始化'),
                action: () => {
                    setupEvents();
                    I18n.setupEvents();
                    return Promise.resolve();
                },
                message: I18n.getMessage('loadingEvents', '初始化事件...'),
                completeMessage: I18n.getMessage('loadingComplete', '加载完成'),
                timeout: 5000
            }
        ];

        // 总模块数，包括后面的小部件系统
        const totalModules = basicModules.length + 1;
        let completedModules = 1; // 国际化模块已完成

        // 依次执行基础模块初始化步骤
        for (const step of basicModules) {
            try {
                Notification.updateLoadingProgress((completedModules / totalModules) * 100, step.message);
                await executeWithTimeout(step.action, step.timeout, step.name);
                completedModules++;
                Notification.updateLoadingProgress((completedModules / totalModules) * 100, step.completeMessage);
            } catch (error) {
                console.error(`[初始化错误] 模块: ${step.name}`, {
                    错误信息: error.message,
                    错误堆栈: error.stack,
                    完成进度: `${completedModules}/${totalModules}`,
                    当前步骤: step.message
                });
                throw new Error(I18n.getMessage('moduleLoadingFailed')
                    .replace('{0}', step.name)
                    .replace('{1}', error.message));
            }
        }
        
        // 最后初始化小部件系统 - 确保在I18n初始化后调用
        try {
            const widgetStep = {
                name: I18n.getMessage('widgetSystem', '小部件系统'),
                message: I18n.getMessage('loadingWidgets', '加载小部件系统...'),
                completeMessage: I18n.getMessage('widgetsLoadComplete', '小部件系统加载完成'),
                timeout: 5000
            };
            
            Notification.updateLoadingProgress((completedModules / totalModules) * 100, widgetStep.message);
            await executeWithTimeout(
                () => WidgetSystem.init(), 
                widgetStep.timeout, 
                widgetStep.name
            );
            completedModules++;
            Notification.updateLoadingProgress(100, widgetStep.completeMessage);
        } catch (error) {
            console.error(`[初始化错误] 模块: 小部件系统`, {
                错误信息: error.message,
                错误堆栈: error.stack,
                完成进度: `${completedModules}/${totalModules}`
            });
            // 小部件系统错误不阻止其他功能
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('widgetSystemError', '小部件系统加载失败'),
                type: 'warning',
                duration: 3000
            });
        }
        
        await performPostInitTasks();
        isInitialized = true;
        Notification.hideLoadingIndicator();
        
    } catch (error) {
        // 增强错误日志记录
        console.error('[严重初始化错误]', {
            错误类型: error.name,
            错误信息: error.message,
            错误堆栈: error.stack,
            时间戳: new Date().toISOString(),
            浏览器信息: navigator.userAgent,
            扩展版本: VERSION
        });
        
        Notification.showErrorMessage(I18n.getMessage('initializationFailed', '初始化失败'));
        Notification.hideLoadingIndicator();
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
    
    // 移除可能存在的全屏加载元素
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay && loadingOverlay.parentNode) {
        loadingOverlay.parentNode.removeChild(loadingOverlay);
    }
}

/**
 * 设置所有模块的事件处理
 * @returns {Promise<void>} 完成事件设置的Promise
 */
function setupEvents() {
    // 创建一个记录各模块执行状态的对象
    const moduleStatus = {
        background: false,
        search: false,
        bookmark: false,
        ui: false
    };

    // 为每个模块创建带超时的Promise
    const setupModuleWithTimeout = (setupFunc, moduleName, timeout = 2000) => {
        return Promise.race([
            new Promise(async (resolve) => {
                try {
                    await setupFunc();
                    moduleStatus[moduleName] = true;
                    resolve();
                } catch (error) {
                    console.error(`${moduleName}模块事件设置失败:`, error);
                    // 即使失败也标记为已处理，以便继续其他模块的设置
                    moduleStatus[moduleName] = 'error';
                    // 失败也视为完成，不阻塞整体进度
                    resolve();
                }
            }),
            new Promise(resolve => {
                setTimeout(() => {
                    if (!moduleStatus[moduleName]) {
                        moduleStatus[moduleName] = 'timeout';
                    }
                    resolve(); // 超时也不阻塞整体进度
                }, timeout);
            })
        ]);
    };

    // 并行执行所有模块的事件设置
    return Promise.all([
        setupModuleWithTimeout(() => backgroundManager.setupEvents(), 'background'),
        setupModuleWithTimeout(() => SearchEngineAPI.setupEvents(), 'search'),
        setupModuleWithTimeout(() => BookmarkManager.init(), 'bookmark'),
        setupModuleWithTimeout(() => Utils.UI.Events.initUIEvents(), 'ui')
    ]).then(() => {
        // 检查是否有超时或错误的模块
        const problematicModules = Object.entries(moduleStatus)
            .filter(([_, status]) => status === 'timeout' || status === 'error')
            .map(([name]) => name);
            
        if (problematicModules.length > 0) {
            // 尽管有问题，但函数仍然成功返回，不阻塞整体初始化流程
        }
        
        return Promise.resolve();
    });
}

/**
 * 启动后执行的任务
 */
async function performPostInitTasks() {
    try {
        // 检查更新或首次安装
        await checkForUpdates();
        
    } catch (error) {
        console.error(I18n.getMessage('postInitTasksError','初始化后任务中的错误'), error);
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
        Menu.Modal.show('welcome-modal');
    } else {
        // 如果没有预定义的欢迎模态框，使用通知
        Notification.notify({
            title: I18n.getMessage('welcomeTitle', '欢迎使用'),
            message: I18n.getMessage('welcomeMessage', '欢迎使用本扩展！'),
            duration: 8000,
            type: 'success'
        });
    }
}

/**
 * 显示更新消息
 * @param {string} oldVersion - 旧版本号
 * @param {string} newVersion - 新版本号
 */
function showUpdateMessage(oldVersion, newVersion) {
    Notification.notify({
        title: I18n.getMessage('updateTitle', '扩展已更新'),
        message: I18n.getMessage('updateMessage', '扩展已从 {0} 升级到 {1}').replace('{0}', oldVersion).replace('{1}', newVersion),
        duration: 6000,
        type: 'info'
    });
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
    Notification.hideLoadingIndicator(true);
  }, 8000);
  
  // 页面加载后的备份保护
  window.addEventListener('load', () => {
    setTimeout(() => {
      Notification.hideLoadingIndicator(true);
    }, 2000);
  });
});

// 添加消息监听器，用于接收背景脚本发送的消息
chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showMobileInstruction') {
    // 设置延迟函数，确保在页面初始化后执行
    const showInstruction = () => {
      showMobileInstruction(message.extensionUrl);
      sendResponse({ received: true, status: 'success' });
    };

    // 根据初始化状态决定如何显示通知
    if (isInitialized) {
      showInstruction();
    } else {
      // 使用事件监听等待初始化完成
      const readyStateCheckInterval = setInterval(() => {
        if (document.readyState === "complete" && isInitialized) {
          clearInterval(readyStateCheckInterval);
          showInstruction();
        }
      }, 100);
      
      // 设置超时保护，确保响应不会永远挂起
      setTimeout(() => {
        clearInterval(readyStateCheckInterval);
        showInstruction();
      }, 5000);
    }
    
    return true; // 保持异步响应
  }
});

/**
 * 显示新标签页设置指导通知（根据设备类型显示不同内容）
 * @param {string} url - 扩展页面URL
 */
function showMobileInstruction(url) {
    const finalUrl = url || chrome.runtime.getURL('html/newtab.html');
    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    return Notification.notify({
        title: I18n.getMessage('setNewTab', '设置新标签页'),
        message: isMobile 
            ? I18n.getMessage('mobileInstructionMessage', '请在浏览器设置中将新标签页设置为：{0}').replace('{0}', finalUrl)
            : I18n.getMessage('desktopInstructionMessage', '请在桌面浏览器设置中将本扩展设为新标签页'),
        duration: isMobile ? 0 : 5000,
        type: 'info',
        buttons: isMobile ? [
            {
                text: I18n.getMessage('copyLink', '复制链接'),
                class: 'btn-primary',
                callback: () => {
                    navigator.clipboard.writeText(finalUrl)
                        .then(() => Notification.notify({
                            title: I18n.getMessage('success', '成功'), 
                            message: I18n.getMessage('linkCopied', '链接已复制'), 
                            duration: 2000, 
                            type: 'success'
                        }))
                        .catch(err => {
                            console.error(I18n.getMessage('copyError', '复制失败:'), err);
                            Notification.notify({
                                title: I18n.getMessage('error', '错误'), 
                                message: I18n.getMessage('copyLinkFailed', '复制链接失败'), 
                                duration: 2000, 
                                type: 'error'
                            });
                        });
                }
            },
            {
                text: I18n.getMessage('close', '关闭'),
                class: 'btn-secondary'
            }
        ] : [
            {
                text: I18n.getMessage('ok', '确定'),
                class: 'btn-primary'
            }
        ]
    });
}

// 导出版本号
export { VERSION };