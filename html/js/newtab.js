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
import { AI } from './modules/ai.js';

// 版本号
let VERSION = '0.0.0'; 
// 全局状态标志
let isInitialized = false;
// 直接读取的翻译数据缓存
let directTranslations = {};
let currentLanguage = 'en';

// 添加全局错误处理（静默处理）
window.addEventListener('error', (event) => {
    // 静默处理 ResizeObserver 错误，这是一个常见的浏览器行为
    if (event.message && event.message.includes('ResizeObserver loop completed with undelivered notifications')) {
        event.preventDefault();
        return;
    }
    console.error('JavaScript错误:', event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Promise错误:', event.reason);
});

/**
 * 直接从JSON文件获取翻译文本（不依赖I18n模块）
 * @param {string} key - 翻译键值
 * @param {string} defaultValue - 默认值（中文）
 * @returns {string} - 翻译后的文本
 */
async function getDirectMessage(key, defaultValue = '') {
    try {
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
    } catch (error) {
        console.error('翻译获取错误:', key, error);
        return defaultValue || key;
    }
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
            console.warn('无法获取存储的语言设置:', error);
            currentLanguage = 'zh'; // 错误时默认中文
        }
        
        // 根据语言确定文件路径
        let locale = currentLanguage === 'zh' ? 'zh_CN' : 'en';
        
        try {
            const response = await fetch(`/_locales/${locale}/messages.json`);
            if (!response.ok) {
                console.warn('主语言文件加载失败，尝试回退');
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
            console.error('文件加载失败:', error);
            // 使用硬编码的中文翻译作为最后后备
            directTranslations = {
                loading: { message: "加载中..." },
                loadingI18n: { message: "加载国际化资源..." },
                welcomeTitle: { message: "欢迎使用" },
                welcomeMessage: { message: "欢迎使用本扩展！" },
                updateTitle: { message: "扩展已更新" },
                updateMessage: { message: "扩展已从 {0} 升级到 {1}" },
                settingsTitle: { message: "设置" },
                setNewTab: { message: "设置新标签页" },
                mobileInstructionMessage: { message: "请在浏览器设置中将新标签页设置为：{0}" },
                desktopInstructionMessage: { message: "请在桌面浏览器设置中将本扩展设为新标签页" },
                copyLink: { message: "复制链接" },
                close: { message: "关闭" },
                ok: { message: "确定" },
                success: { message: "成功" },
                linkCopied: { message: "链接已复制" },
                copyError: { message: "复制失败:" },
                copyLinkFailed: { message: "复制链接失败" },
                error: { message: "错误" }
            };
        }
    } catch (error) {
        console.error('翻译加载发生严重错误:', error);
    }
}

/**
 * 从manifest.json获取扩展版本号
 * @returns {Promise<string>} 版本号
 */
async function getExtensionVersion() {
    try {
        const response = await fetch('/manifest.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const manifest = await response.json();
        return manifest.version || '0.0.0';
    } catch (error) {
        console.error('版本获取失败:', error);
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
                reject(new Error(`Module ${moduleName} initialization timeout`));
            }, timeout);
        })
    ]);
}

/**
 * 初始化应用
 */
async function init() {
    try {        // 首先加载直接翻译数据
        await loadDirectTranslations();
          // 尽早应用主题设置以避免主题闪烁
        const savedTheme = localStorage.getItem('theme') || 'auto';
        const root = document.documentElement;
        if (savedTheme === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
            
            // 监听系统主题变化
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                const currentTheme = localStorage.getItem('theme') || 'auto';
                if (currentTheme === 'auto') {
                    root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                }
            });
        } else {
            root.setAttribute('data-theme', savedTheme);
        }
        
        // 创建基本 UI 结构
        createBasicUI();
        
        // 显示加载界面
        const loadingText = await getDirectMessage('loading', '加载中...');
        Notification.showLoadingIndicator(loadingText);
        
        // 先初始化国际化模块
        const i18nLoadingText = await getDirectMessage('loadingI18n', '加载国际化资源...');
        Notification.updateLoadingProgress(10, i18nLoadingText);
        
        await executeWithTimeout(() => I18n.init(), 5000, 'I18n');
        
        // 国际化初始化完成后，重新应用翻译到UI元素
        I18n.applyTranslations();
        
        // 获取扩展版本
        VERSION = await getExtensionVersion();
          // 初始化基础模块
        const basicModules = [
            {
                name: 'Background',
                action: backgroundManager.initialize.bind(backgroundManager),
                timeout: 5000
            },
            {
                name: 'SearchEngine',
                action: SearchEngineAPI.initialize.bind(SearchEngineAPI),
                timeout: 5000
            },
            {
                name: 'Bookmarks',
                action: BookmarkManager.init.bind(BookmarkManager),
                timeout: 5000
            },
            {
                name: 'Clock',
                action: ClockWidget.init.bind(ClockWidget),
                timeout: 5000
            },            {
                name: 'AI',
                action: AI.initialize.bind(AI),
                timeout: 5000
            },
            {
                name: 'Settings',
                action: () => {
                    // 初始化设置模块并确保主题设置正确应用
                    if (typeof Settings !== 'undefined' && Settings.applyTheme) {
                        const currentTheme = localStorage.getItem('theme') || 'auto';
                        Settings.applyTheme(currentTheme);
                    }
                    return Promise.resolve();
                },
                timeout: 5000
            },
            {
                name: 'Events',
                action: () => {
                    setupEvents();
                    I18n.setupEvents();
                    return Promise.resolve();
                },
                timeout: 5000
            }
        ];

        // 依次执行基础模块初始化步骤
        for (let i = 0; i < basicModules.length; i++) {
            const step = basicModules[i];
            try {
                await executeWithTimeout(step.action, step.timeout, step.name);
                Notification.updateLoadingProgress(((i + 2) / (basicModules.length + 2)) * 100);
            } catch (error) {
                console.error(`模块初始化失败: ${step.name}`, error);
                throw error;
            }
        }
        
        // 最后初始化小部件系统
        try {
            await executeWithTimeout(() => WidgetSystem.init(), 5000, 'WidgetSystem');
            Notification.updateLoadingProgress(100);
        } catch (error) {
            console.error('小部件系统初始化失败:', error);
            // 小部件系统错误不阻止其他功能
            Notification.notify({
                title: await getDirectMessage('error', '错误'),
                message: '小部件系统加载失败',
                type: 'warning',
                duration: 3000
            });
        }
        
        await performPostInitTasks();
        isInitialized = true;
        Notification.hideLoadingIndicator();
        
    } catch (error) {
        console.error('初始化失败:', error);
        Notification.hideLoadingIndicator();
        throw error;
    }
}

/**
 * 创建基本 UI 结构
 */
function createBasicUI() {
    try {
        const container = document.getElementById('container');
        if (!container) {
            throw new Error('找不到container元素');
        }
        
        // 创建书签盒子
        const bookmarkBox = Utils.createElement('div', '', { id: 'bookmark-box' });
        const folderList = Utils.createElement('div', '', { id: 'folder-list' });
        const shortcutList = Utils.createElement('div', '', { id: 'shortcut-list' });
        
        bookmarkBox.appendChild(folderList);
        bookmarkBox.appendChild(shortcutList);
          // 创建背景按钮
        const backgroundButton = Utils.createElement('button', '', { 
            id: 'background-button',
            title: '更换背景',
            'data-i18n': 'backgroundButton'
        });
        
        // 创建设置按钮
        const settingsButton = Utils.createElement('button', '', { 
            id: 'settings-btn',
            title: '设置',
            'data-i18n-title': 'settingsTitle'
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
            try {
                if (typeof Settings !== 'undefined' && Settings.open) {
                    Settings.open();
                }
            } catch (error) {
                console.error('设置按钮点击事件错误:', error);
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
        
    } catch (error) {
        console.error('创建基本UI失败:', error);
        throw error;
    }
}

/**
 * 设置所有模块的事件处理
 */
function setupEvents() {
    try {
        backgroundManager.setupEvents();
        SearchEngineAPI.setupEvents();
        BookmarkManager.init();
        Utils.UI.Events.initUIEvents();
    } catch (error) {
        console.error('事件设置失败:', error);
    }
}

/**
 * 启动后执行的任务
 */
async function performPostInitTasks() {
    try {
        await checkForUpdates();
    } catch (error) {
        console.error('初始化后任务错误:', error);
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
        console.error('版本检查失败:', error);
    }
}

/**
 * 显示欢迎消息
 */
async function showWelcomeMessage() {
    try {
        const welcomeModal = document.getElementById('welcome-modal');
        if (welcomeModal) {
            Menu.Modal.show('welcome-modal');
        } else {
            Notification.notify({
                title: await getDirectMessage('welcomeTitle', '欢迎使用'),
                message: await getDirectMessage('welcomeMessage', '欢迎使用本扩展！'),
                duration: 8000,
                type: 'success'
            });
        }
    } catch (error) {
        console.error('显示欢迎消息失败:', error);
    }
}

/**
 * 显示更新消息
 * @param {string} oldVersion - 旧版本号
 * @param {string} newVersion - 新版本号
 */
async function showUpdateMessage(oldVersion, newVersion) {
    try {
        const title = await getDirectMessage('updateTitle', '扩展已更新');
        const messageTemplate = await getDirectMessage('updateMessage', '扩展已从 {0} 升级到 {1}');
        const message = messageTemplate.replace('{0}', oldVersion).replace('{1}', newVersion);
        
        Notification.notify({
            title,
            message,
            duration: 6000,
            type: 'info'
        });
    } catch (error) {
        console.error('显示更新消息失败:', error);
    }
}

/**
 * 显示新标签页设置指导通知（根据设备类型显示不同内容）
 * @param {string} url - 扩展页面URL
 */
async function showMobileInstruction(url) {
    try {
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
                            console.error('复制失败:', err);
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
    } catch (error) {
        console.error('显示移动设备指导失败:', error);
    }
}

// 在DOMContentLoaded时启动应用
document.addEventListener('DOMContentLoaded', () => {
    init().catch(error => {
        console.error('初始化失败:', error);
    });
});

// 导出版本号
export { VERSION, showMobileInstruction };