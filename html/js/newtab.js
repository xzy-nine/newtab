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
import { Settings } from './modules/settings.js';

// 版本号
let VERSION = '0.0.0'; 
// 全局状态标志
let isInitialized = false;
// 直接读取的翻译数据缓存
let directTranslations = {};
let currentLanguage = 'en';

/**
 * 直接从JSON文件获取翻译文本（不依赖I18n模块）
 * @param {string} key - 翻译键值
 * @param {string} defaultValue - 默认值（中文）
 * @returns {string} - 翻译后的文本
 */
async function getDirectMessage(key, defaultValue = '') {
    if (!key) return defaultValue;
    
    // 如果当前是中文且提供了默认值，直接返回默认值
    if (currentLanguage === 'zh' && defaultValue) {
        return defaultValue;
    }
    
    // 如果已经有缓存的翻译数据，直接使用
    if (directTranslations[key] && directTranslations[key].message) {
        return directTranslations[key].message;
    }
    
    // 如果没有缓存，尝试加载翻译文件
    if (Object.keys(directTranslations).length === 0) {
        await loadDirectTranslations();
        
        // 再次尝试获取翻译
        if (directTranslations[key] && directTranslations[key].message) {
            return directTranslations[key].message;
        }
    }
    
    // 如果仍然找不到翻译，返回默认值
    return defaultValue;
}

/**
 * 直接加载翻译文件（同步方法，不依赖I18n模块）
 * @returns {Promise<void>}
 */
async function loadDirectTranslations() {
    try {
        // 首先尝试获取用户设置的语言
        try {
            const result = await chrome.storage.sync.get('language');
            if (result.language) {
                currentLanguage = result.language;
            } else {
                // 默认使用中文，如果浏览器语言不是中文相关，则保持中文
                const browserLang = navigator.language.slice(0, 2);
                currentLanguage = ['zh', 'en'].includes(browserLang) ? browserLang : 'zh';
            }
        } catch (error) {
            currentLanguage = 'zh'; // 错误时默认中文
        }
        
        // 根据语言确定文件路径
        let locale = currentLanguage === 'zh' ? 'zh_CN' : 'en';
        
        try {
            const response = await fetch(`/_locales/${locale}/messages.json`);
            if (!response.ok) {
                // 如果当前语言文件加载失败，回退到中文版本
                const fallbackResponse = await fetch('/_locales/zh_CN/messages.json');
                if (fallbackResponse.ok) {
                    directTranslations = await fallbackResponse.json();
                } else {
                    // 如果中文版本也失败，尝试英文版本
                    const enResponse = await fetch('/_locales/en/messages.json');
                    if (enResponse.ok) {
                        directTranslations = await enResponse.json();
                    }
                }
            } else {
                directTranslations = await response.json();
            }
        } catch (error) {
            console.error('直接加载翻译文件失败:', error);
            // 使用中文翻译作为后备
            directTranslations = {
                loading: { message: "加载中..." },
                loadingI18n: { message: "加载国际化资源..." },
                initializingTitle: { message: "新标签页初始化中..." },
                moduleInitTimeout: { message: "模块 {0} 初始化超时" },
                backgroundModule: { message: "背景模块" },
                searchModule: { message: "搜索引擎" },
                bookmarkModule: { message: "书签" },
                clockModule: { message: "时钟组件" },
                eventsModule: { message: "事件初始化" },
                widgetSystem: { message: "小部件系统" },
                initializationFailed: { message: "初始化失败" },
                error: { message: "错误" },
                widgetSystemError: { message: "小部件系统加载失败" },
                i18nModule: { message: "国际化模块" },
                loadingBackground: { message: "加载背景..." },
                backgroundLoadComplete: { message: "背景加载完成" },
                loadingSearch: { message: "加载搜索引擎..." },
                searchLoadComplete: { message: "搜索引擎加载完成" },
                loadingBookmarks: { message: "加载书签..." },
                bookmarkLoadComplete: { message: "书签加载完成" },
                loadingClock: { message: "加载时钟组件..." },
                clockLoadComplete: { message: "时钟组件加载完成" },
                loadingEvents: { message: "初始化事件..." },
                loadingComplete: { message: "加载完成" },
                loadingWidgets: { message: "加载小部件系统..." },
                widgetsLoadComplete: { message: "小部件系统加载完成" },
                moduleLoadingFailed: { message: "模块加载失败" },
                postInitTasksError: { message: "初始化后任务中的错误" },
                welcomeTitle: { message: "欢迎使用" },
                welcomeMessage: { message: "欢迎使用本扩展！" },
                updateTitle: { message: "扩展已更新" },
                updateMessage: { message: "扩展已从 {0} 升级到 {1}" },
                setNewTab: { message: "设置新标签页" },
                mobileInstructionMessage: { message: "请在浏览器设置中将新标签页设置为：{0}" },
                desktopInstructionMessage: { message: "请在桌面浏览器设置中将本扩展设为新标签页" },
                copyLink: { message: "复制链接" },
                close: { message: "关闭" },
                ok: { message: "确定" },
                success: { message: "成功" },
                linkCopied: { message: "链接已复制" },
                copyError: { message: "复制失败:" },
                copyLinkFailed: { message: "复制链接失败" }
            };
        }
    } catch (error) {
        console.error('加载直接翻译时发生错误:', error);
    }
}

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
                    const timeoutError = new Error((directTranslations.moduleInitTimeout?.message || 'Module {0} initialization timeout').replace('{0}', moduleName));
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
        // 首先加载直接翻译数据
        await loadDirectTranslations();
        
        // 创建基本 UI 结构
        createBasicUI();
        
        // 显示加载界面，使用直接翻译
        const loadingText = await getDirectMessage('loading', '加载中...');
        Notification.showLoadingIndicator(loadingText);
        
        // 先初始化国际化模块，这样后面才能使用它
        const i18nLoadingText = await getDirectMessage('loadingI18n', '加载国际化资源...');
        Notification.updateLoadingProgress(10, i18nLoadingText);
        
        await executeWithTimeout(
            () => I18n.init(), 
            5000, 
            await getDirectMessage('i18nModule', '国际化模块')
        );
        
        // 国际化初始化完成后，重新应用翻译到UI元素
        I18n.applyTranslations();
        
        // 获取扩展版本
        VERSION = await getExtensionVersion();
        
        // 初始化步骤计数 - 先初始化非小部件相关的模块
        const basicModules = [
            {
                name: await getDirectMessage('backgroundModule', '背景模块'),
                action: backgroundManager.initialize.bind(backgroundManager),
                message: await getDirectMessage('loadingBackground', '加载背景...'),
                completeMessage: await getDirectMessage('backgroundLoadComplete', '背景加载完成'),
                timeout: 5000
            },
            {
                name: await getDirectMessage('searchModule', '搜索引擎'),
                action: SearchEngineAPI.initialize.bind(SearchEngineAPI),
                message: await getDirectMessage('loadingSearch', '加载搜索引擎...'),
                completeMessage: await getDirectMessage('searchLoadComplete', '搜索引擎加载完成'),
                timeout: 5000
            },
            {
                name: await getDirectMessage('bookmarkModule', '书签'),
                action: BookmarkManager.init.bind(BookmarkManager),
                message: await getDirectMessage('loadingBookmarks', '加载书签...'),
                completeMessage: await getDirectMessage('bookmarkLoadComplete', '书签加载完成'),
                timeout: 5000
            },
            {
                name: await getDirectMessage('clockModule', '时钟组件'),
                action: ClockWidget.init.bind(ClockWidget),
                message: await getDirectMessage('loadingClock', '加载时钟组件...'),
                completeMessage: await getDirectMessage('clockLoadComplete', '时钟组件加载完成'),
                timeout: 5000
            },
            {
                name: await getDirectMessage('eventsModule', '事件初始化'),
                action: () => {
                    setupEvents();
                    I18n.setupEvents();
                    return Promise.resolve();
                },
                message: await getDirectMessage('loadingEvents', '初始化事件...'),
                completeMessage: await getDirectMessage('loadingComplete', '加载完成'),
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
                const errorMessage = await getDirectMessage('moduleLoadingFailed', '模块加载失败');
                throw new Error(`${errorMessage}: ${step.name} - ${error.message}`);
            }
        }
        
        // 最后初始化小部件系统 - 确保在I18n初始化后调用
        try {
            const widgetStep = {
                name: await getDirectMessage('widgetSystem', '小部件系统'),
                message: await getDirectMessage('loadingWidgets', '加载小部件系统...'),
                completeMessage: await getDirectMessage('widgetsLoadComplete', '小部件系统加载完成'),
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
                title: await getDirectMessage('error', '错误'),
                message: await getDirectMessage('widgetSystemError', '小部件系统加载失败'),
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
        
        const errorMessage = await getDirectMessage('initializationFailed', '初始化失败');
        Notification.showErrorMessage(errorMessage);
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
    const backgroundButton = Utils.createElement('button', '背景', { 
        id: 'background-button',
        'data-i18n': 'backgroundButton'
    });
    
    // 创建设置按钮
    const settingsButton = Utils.createElement('button', '', { 
        id: 'settings-btn',
        title: '设置', // 临时使用中文，稍后通过国际化更新
        'data-i18n-title': 'settingsTitle' // 添加国际化标记用于后续更新
    });
    
    // 设置按钮的SVG图标
    settingsButton.innerHTML = `
        <svg class="settings-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span class="settings-label" data-i18n="settingsTitle">设置</span>
    `;
    
    // 为设置按钮添加点击事件
    settingsButton.addEventListener('click', () => {
        if (typeof Settings !== 'undefined' && Settings.open) {
            Settings.open();
        }
    });
    
    // 添加所有元素到容器
    container.appendChild(bookmarkBox);
    container.appendChild(backgroundButton);
    container.appendChild(settingsButton);
    
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
        const errorMessage = await getDirectMessage('postInitTasksError', '初始化后任务中的错误');
        console.error(errorMessage, error);
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
async function showWelcomeMessage() {
    const welcomeModal = document.getElementById('welcome-modal');
    if (welcomeModal) {
        // 使用模块化API
        Menu.Modal.show('welcome-modal');
    } else {
        // 如果没有预定义的欢迎模态框，使用通知
        Notification.notify({
            title: await getDirectMessage('welcomeTitle', '欢迎使用'),
            message: await getDirectMessage('welcomeMessage', '欢迎使用本扩展！'),
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
async function showUpdateMessage(oldVersion, newVersion) {
    const title = await getDirectMessage('updateTitle', '扩展已更新');
    const messageTemplate = await getDirectMessage('updateMessage', '扩展已从 {0} 升级到 {1}');
    const message = messageTemplate.replace('{0}', oldVersion).replace('{1}', newVersion);
    
    Notification.notify({
        title,
        message,
        duration: 6000,
        type: 'info'
    });
}

/**
 * 显示新标签页设置指导通知（根据设备类型显示不同内容）
 * @param {string} url - 扩展页面URL
 */
async function showMobileInstruction(url) {
    const finalUrl = url || chrome.runtime.getURL('html/newtab.html');
    // 检测是否为移动设备
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    const title = await getDirectMessage('setNewTab', '设置新标签页');
    const mobileMessage = await getDirectMessage('mobileInstructionMessage', '请在浏览器设置中将新标签页设置为：{0}');
    const desktopMessage = await getDirectMessage('desktopInstructionMessage', '请在桌面浏览器设置中将本扩展设为新标签页');
    
    return Notification.notify({
        title,
        message: isMobile 
            ? mobileMessage.replace('{0}', finalUrl)
            : desktopMessage,
        duration: isMobile ? 0 : 5000,
        type: 'info',
        buttons: isMobile ? [
            {
                text: await getDirectMessage('copyLink', '复制链接'),
                class: 'btn-primary',
                callback: async () => {
                    try {
                        await navigator.clipboard.writeText(finalUrl);
                        Notification.notify({
                            title: await getDirectMessage('success', '成功'), 
                            message: await getDirectMessage('linkCopied', '链接已复制'), 
                            duration: 2000, 
                            type: 'success'
                        });
                    } catch (err) {
                        const errorPrefix = await getDirectMessage('copyError', '复制失败:');
                        console.error(errorPrefix, err);
                        Notification.notify({
                            title: await getDirectMessage('error', '错误'), 
                            message: await getDirectMessage('copyLinkFailed', '复制链接失败'), 
                            duration: 2000, 
                            type: 'error'
                        });
                    }
                }
            },
            {
                text: await getDirectMessage('close', '关闭'),
                class: 'btn-secondary'
            }
        ] : [
            {
                text: await getDirectMessage('ok', '确定'),
                class: 'btn-primary'
            }
        ]
    });
}

// 导出版本号
export { VERSION };