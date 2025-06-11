// ==UserScript==
// @name         微博自适应深色模式（修复版）
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  自动根据系统模式设置微博深色/浅色模式，尊重用户手动切换，支持扩展通知
// @author       You
// @match        https://*.weibo.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';    // 扩展通知API引用
    let ExtensionAPI = null;
    
    // 用户手动覆盖标志
    let userOverride = GM_getValue('userOverride', false);
      // 脚本操作标识（防止脚本自己的操作被误判为用户操作）
    let isScriptOperation = false;

    // DOM观察器，确保主题在页面动态变化时也能正确应用
    let observer = null;

    // 检查系统颜色模式
    const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // 保存最后一次系统模式
    GM_setValue('lastSystemMode', prefersDarkMode);

    // 初始化
    initializeExtensionAPI();    // 监听系统模式变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const newDarkMode = e.matches;
        GM_setValue('lastSystemMode', newDarkMode);        // 如果没有用户手动覆盖，则跟随系统变化
        if (!userOverride) {
            isScriptOperation = true; // 标记为脚本操作
            setWebsiteMode(newDarkMode);
            showNotification('已自动切换', `${newDarkMode ? '深色' : '浅色'}模式`, 'info');
            isScriptOperation = false; // 重置标记
        }
    });

    // 添加键盘快捷键来重置自动跟随状态
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+R 重置自动跟随
        if (e.ctrlKey && e.shiftKey && e.key === 'R') {
            e.preventDefault();
            userOverride = false;
            GM_setValue('userOverride', false);
            const systemIsDark = GM_getValue('lastSystemMode', window.matchMedia('(prefers-color-scheme: dark)').matches);
            isScriptOperation = true;
            setWebsiteMode(systemIsDark);
            showNotification('已重置', '恢复自动跟随系统模式', 'success');
            isScriptOperation = false;
        }
    });

    // 等待扩展通知API准备就绪
    function waitForExtensionAPI(timeout = 5000) {
        return new Promise((resolve) => {
            let resolved = false;
            
            // 创建API代理对象
            const createAPIProxy = () => {
                let requestIdCounter = 0;
                const pendingRequests = new Map();
                
                // 监听响应
                const messageHandler = (event) => {
                    if (event.origin !== window.location.origin) return;
                    
                    if (event.data?.type === 'EXTENSION_NOTIFICATION_RESPONSE') {
                        const { requestId, success, result, error } = event.data;
                        const pendingRequest = pendingRequests.get(requestId);
                        
                        if (pendingRequest) {
                            pendingRequests.delete(requestId);
                            if (success) {
                                pendingRequest.resolve(result);
                            } else {
                                pendingRequest.reject(new Error(error));
                            }
                        }
                    }
                };
                
                window.addEventListener('message', messageHandler);
                
                // 创建API方法包装器
                const createMethod = (method) => {
                    return (title, message, duration) => {
                        return new Promise((resolve, reject) => {
                            const requestId = `req_${++requestIdCounter}_${Date.now()}`;
                            
                            pendingRequests.set(requestId, { resolve, reject });
                            
                            window.postMessage({
                                type: 'EXTENSION_NOTIFICATION_REQUEST',
                                method,
                                params: { title, message, duration },
                                requestId
                            }, '*');
                            
                            setTimeout(() => {
                                if (pendingRequests.has(requestId)) {
                                    pendingRequests.delete(requestId);
                                    reject(new Error(`${method} request timeout`));
                                }
                            }, 3000);
                        });
                    };
                };
                
                return {
                    info: createMethod('info'),
                    success: createMethod('success'),
                    warning: createMethod('warning'),
                    error: createMethod('error'),
                    isAvailable: () => true
                };
            };
            
            // 设置超时
            const timeoutId = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            }, timeout);

            // 监听API准备事件
            const handleAPIReady = (event) => {
                if (event.origin !== window.location.origin) return;
                
                if (event.data?.type === 'EXTENSION_NOTIFICATION_READY') {
                    if (!resolved) {
                        clearTimeout(timeoutId);
                        resolved = true;
                        resolve(createAPIProxy());
                        window.removeEventListener('message', handleAPIReady);
                    }
                }
            };
            
            window.addEventListener('message', handleAPIReady);
        });
    }    // 统一的通知函数
    async function showNotification(title, message, type = 'info', duration = 3000) {
        console.log(`%c[微博主题] ${title}: ${message}`, 
            `color: ${type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : type === 'success' ? '#28a745' : '#17a2b8'}; font-weight: bold;`);
        
        try {
            if (ExtensionAPI && ExtensionAPI.isAvailable()) {
                // 使用扩展通知API
                switch (type) {
                    case 'success':
                        await ExtensionAPI.success(`[微博] ${title}`, message, duration);
                        break;
                    case 'warning':
                        await ExtensionAPI.warning(`[微博] ${title}`, message, duration);
                        break;
                    case 'error':
                        await ExtensionAPI.error(`[微博] ${title}`, message, duration);
                        break;
                    default:
                        await ExtensionAPI.info(`[微博] ${title}`, message, duration);
                }
            }
        } catch (error) {
            console.error('通知显示失败:', error);
            // 降级到控制台输出已经在上面完成
        }
    }

    // 获取当前网站的模式
    function getCurrentWebsiteMode() {
        try {
            const darkModeHistory = localStorage.getItem('darkModeHistory');
            if (darkModeHistory) {
                const parsed = JSON.parse(darkModeHistory);
                if (parsed && parsed.length > 0 && parsed[0].length > 1) {
                    return parsed[0][1] === 1;
                }
            }
        } catch (e) {
            // 静默处理错误
        }

        if (document.body) {
            return document.body.classList.contains("woo-theme-dark");
        }

        return false;
    }    // 设置网站模式
    function setWebsiteMode(isDark) {
        try {
            isScriptOperation = true; // 标记为脚本操作
            const userId = getUserId();
            const modeValue = isDark ? 1 : 0;
            localStorage.setItem('darkModeHistory', `[[${userId},${modeValue}]]`);            // 等待DOM加载完成后再设置class
            const applyTheme = () => {
                if (document.body) {
                    // 先移除可能存在的主题类
                    document.body.classList.remove("woo-theme-dark", "woo-theme-light");
                    
                    if (isDark) {
                        document.body.classList.add("woo-theme-dark");
                        // 也尝试添加到html元素上，有些网站主题是应用在html上的
                        document.documentElement.setAttribute('data-theme', 'dark');
                    } else {
                        document.body.classList.add("woo-theme-light");
                        document.documentElement.setAttribute('data-theme', 'light');
                    }
                      console.log(`[微博主题] 已设置为${isDark ? '深色' : '浅色'}模式`);
                    
                    // 启动DOM观察器，确保主题在页面变化时保持
                    startThemeObserver(isDark);
                    
                    // 触发一个自定义事件，让微博的JS知道主题已改变
                    try {
                        const event = new CustomEvent('themechange', { 
                            detail: { theme: isDark ? 'dark' : 'light' } 
                        });
                        window.dispatchEvent(event);
                    } catch (e) {
                        // 静默处理事件创建失败
                    }
                } else {
                    // 如果body还不存在，等待一下再试
                    setTimeout(applyTheme, 100);
                }
            };

            if (document.readyState === 'loading') {
                // 如果文档还在加载，等待DOM内容加载完成
                document.addEventListener('DOMContentLoaded', applyTheme);
            } else {
                // 文档已加载完成，直接应用主题
                applyTheme();
            }

            isScriptOperation = false; // 重置标记
        } catch (error) {
            isScriptOperation = false; // 确保在错误情况下也重置标记
            showNotification('设置失败', '模式设置出错', 'error');
        }
    }    // 获取用户ID
    function getUserId() {
        let userId = null;

        // 尝试从现有的darkModeHistory中获取用户ID
        try {
            const darkModeHistory = localStorage.getItem('darkModeHistory');
            if (darkModeHistory) {
                const parsed = JSON.parse(darkModeHistory);
                if (parsed && parsed.length > 0 && parsed[0].length > 0) {
                    userId = parsed[0][0];
                }
            }
        } catch (e) {
            console.error("解析darkModeHistory失败:", e);
        }

        // 如果没有找到用户ID，尝试从其他地方获取
        if (!userId) {
            // 尝试从页面获取
            const pageSource = document.documentElement.outerHTML;
            const uidMatch = pageSource.match(/uid=(\d+)/);
            if (uidMatch && uidMatch[1]) {
                userId = parseInt(uidMatch[1], 10);
            }
        }

        // 如果还是没有找到用户ID，使用默认值
        return userId || 0;
    }

    // 启动主题观察器，防止页面动态修改时主题被重置
    function startThemeObserver(isDark) {
        if (observer) {
            observer.disconnect();
        }

        observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && 
                    mutation.attributeName === 'class' && 
                    mutation.target === document.body) {
                    
                    const hasThemeClass = document.body.classList.contains('woo-theme-dark');
                    
                    // 如果主题类被移除或不正确，重新应用
                    if (isDark && !hasThemeClass) {
                        console.log('[微博主题] 检测到主题被重置，重新应用深色主题');
                        document.body.classList.add('woo-theme-dark');
                        document.body.classList.remove('woo-theme-light');
                    } else if (!isDark && hasThemeClass) {
                        console.log('[微博主题] 检测到主题被重置，重新应用浅色主题');
                        document.body.classList.remove('woo-theme-dark');
                        document.body.classList.add('woo-theme-light');
                    }
                }
            });
        });

        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    // 监听localStorage变化以检测用户手动切换模式
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = function(key, value) {
        const result = originalSetItem.apply(this, arguments);        if (key === 'darkModeHistory') {
            try {
                const parsed = JSON.parse(value);
                if (parsed && parsed.length > 0 && parsed[0].length > 1) {
                    const currentIsDark = parsed[0][1] === 1;
                    const systemIsDark = GM_getValue('lastSystemMode', prefersDarkMode);

                    // 只有在非脚本操作且页面已加载完成时才判断为用户操作
                    const isUserAction = !isScriptOperation && document.readyState === 'complete';

                    if (isUserAction) {
                        if (currentIsDark !== systemIsDark) {
                            userOverride = true;
                            GM_setValue('userOverride', true);
                            showNotification('模式已锁定', `${currentIsDark ? '深色' : '浅色'}模式`, 'warning');
                        } else {
                            userOverride = false;
                            GM_setValue('userOverride', false);
                            showNotification('自动跟随', '已恢复系统同步', 'success');
                        }
                    }
                }
            } catch (e) {
                // 静默处理错误
            }
        }

        return result;
    };    // 初始化扩展API
    async function initializeExtensionAPI() {
        try {
            ExtensionAPI = await waitForExtensionAPI();
            
            if (ExtensionAPI && ExtensionAPI.isAvailable()) {
                console.log('扩展通知API已连接');
                // 显示初始化成功通知
                await showNotification('脚本启动', '微博自适应深色模式已激活', 'success', 2000);
            } else {
                console.log('扩展通知API不可用，使用备用通知方式');
                console.log('%c[微博模式助手] 脚本启动: 微博自适应深色模式已激活（备用通知模式）', 'color: #28a745; font-weight: bold;');
            }
            
            // 等待页面加载完成后设置初始模式
            const setInitialMode = () => {
                if (!userOverride) {
                    isScriptOperation = true;
                    setWebsiteMode(prefersDarkMode);
                    isScriptOperation = false;
                } else {
                    const currentWebsiteMode = getCurrentWebsiteMode();
                    console.log(`用户手动设置为${currentWebsiteMode ? '深色' : '浅色'}模式，保持不变`);
                    showNotification('用户设置', `保持${currentWebsiteMode ? '深色' : '浅色'}模式（用户手动设置）`, 'info', 2000);
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', setInitialMode);
            } else {
                setInitialMode();
            }
        } catch (error) {
            isScriptOperation = false; // 确保在错误情况下也重置标记
            console.error('初始化扩展API失败:', error);
            // 使用备用通知方式
            console.log('%c[微博模式助手] 脚本启动: 微博自适应深色模式已激活（备用通知模式）', 'color: #28a745; font-weight: bold;');        }
    }

    // 页面完全加载后添加状态指示器
    window.addEventListener('load', function() {
        // 延迟显示状态，确保API已经完全就绪
        setTimeout(async () => {
            if (ExtensionAPI && ExtensionAPI.isAvailable()) {
                const currentMode = getCurrentWebsiteMode();
                const isSystemMode = !userOverride;
                
                // 创建状态提示
                if (isSystemMode) {
                    await showNotification('状态提醒', `当前${currentMode ? '深色' : '浅色'}模式 - 自动跟随系统`, 'info', 2000);
                } else {
                    await showNotification('状态提醒', `当前${currentMode ? '深色' : '浅色'}模式 - 用户锁定`, 'warning', 2000);
                }
            }
        }, 3000);
    });

})();
