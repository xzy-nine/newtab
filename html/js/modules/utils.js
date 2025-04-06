/**
 * 工具函数模块
 * 包含通用UI处理、通知、模态框等功能
 */

import { getI18nMessage } from './i18n.js';

/**
 * 从URL获取数据并解析为JSON
 * @param {string} url - 请求的URL
 * @returns {Promise<Object>} - 解析后的JSON对象
 */
export async function fetchData(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch data from', url, error);
        throw error;
    }
}

/**
 * 将Blob对象转换为base64字符串
 * @param {Blob} blob - 需要转换的Blob对象
 * @returns {Promise<string>} - 转换后的base64字符串
 */
export function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 获取域名
 * @param {string} url - 完整URL
 * @returns {string} - 域名
 */
export function getDomain(url) {
    try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (e) {
        console.error('Invalid URL:', url);
        return '';
    }
}

/**
 * 异步函数：将Blob对象转换为Base64字符串
 * 保留此函数以保持兼容性，内部调用blobToBase64实现
 * @param {Blob} blob - Blob对象
 * @returns {Promise<string>} - Base64字符串
 */
export function convertBlobToBase64(blob) {
    return blobToBase64(blob);
}

/**
 * 显示加载指示器
 */
export function showLoadingIndicator() {
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
 * @param {boolean} [immediate=false] - 是否立即隐藏，无过渡动画
 */
export function hideLoadingIndicator(immediate = false) {
    console.log('Hiding loading indicator');
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        if (immediate) {
            loadingScreen.style.display = 'none';
            console.log('Loading screen hidden immediately');
            return;
        }
        
        loadingScreen.style.opacity = '0';
        // 强制触发重排以确保过渡动画生效
        loadingScreen.offsetHeight;
        
        // 添加额外的保障，确保即使过渡动画失败也能隐藏
        const hideTimeout = setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
                console.log('Loading screen hidden via timeout');
            }
        }, 600); // 略大于过渡时间
        
        // 同时监听过渡结束事件
        loadingScreen.addEventListener('transitionend', () => {
            clearTimeout(hideTimeout);
            loadingScreen.style.display = 'none';
            console.log('Loading screen hidden via transition');
        }, { once: true });
    }
}

/**
 * 更新加载进度
 * @param {number} percent - 加载百分比(0-100)
 * @param {string} statusMessage - 当前状态消息
 */
export function updateLoadingProgress(percent, statusMessage) {
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
export function showErrorMessage(message) {
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
 * 显示通知
 * @param {string} title - 通知标题
 * @param {string} message - 通知内容
 * @param {number} [duration=5000] - 显示持续时间(毫秒)
 */
export function showNotification(title, message, duration = 5000) {
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
 * 初始化模态框事件
 */
export function initModalEvents() {
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
 * 显示指定的模态框
 * @param {string} modalId - 模态框的ID
 * @param {Function} [onShown] - 模态框显示后的回调函数
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
    }
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 如果是第一次显示，初始化模态框事件
    if (!modal.dataset.initialized) {
        // 获取关闭按钮
        const closeButtons = modal.querySelectorAll('.modal-close');
        closeButtons.forEach(button => {
            // 移除旧的事件监听器并添加新的
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            
            newButton.addEventListener('click', () => {
                hideModal(modalId);
            });
        });
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideModal(modalId);
            }
        });
        
        // 标记已初始化
        modal.dataset.initialized = 'true';
    }
}

/**
 * 隐藏指定的模态框
 * @param {string} modalId - 模态框的ID
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
    }
    
    // 隐藏模态框
    modal.style.display = 'none';
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
export function handleKeyDown(e) {
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
 * 设置通用页面事件
 */
export function initUIEvents() {
    // 处理页面加载完成事件
    window.addEventListener('load', handlePageLoad);
    
    // 处理页面调整大小事件
    window.addEventListener('resize', handleWindowResize);
    
    // 全局键盘快捷键
    document.addEventListener('keydown', handleKeyDown);
    
    // 处理点击事件，关闭弹出菜单等
    document.addEventListener('click', handleDocumentClick);

    // 初始化模态框事件
    initModalEvents();
}