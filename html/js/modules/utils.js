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
 * 创建DOM元素的通用函数
 * @param {string} tag - 标签名
 * @param {string} className - 类名
 * @param {Object} attributes - 属性对象
 * @param {string} content - 内容
 * @returns {HTMLElement} - 创建的DOM元素
 */
export function createElement(tag, className, attributes = {}, content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    
    if (content) element.innerHTML = content;
    return element;
}

/**
 * 检查元素是否在视口内
 * @param {HTMLElement} el - 要检查的元素
 * @returns {boolean} - 如果元素在视口内则返回true
 */
export function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

/**
 * 计算元素总高度
 * @param {HTMLElement} element - 要计算高度的元素
 * @returns {number} - 总高度
 */
export function calculateTotalHeight(element) {
    return element.scrollHeight * 1.1;
}

// UI相关函数集中管理
// 加载指示器、通知、模态框等功能

/**
 * 显示加载指示器
 */
export function showLoadingIndicator() {
    // 检查是否已存在加载指示器
    let loadingScreen = document.getElementById('loading-screen');
    if (!loadingScreen) {
        // 创建加载指示器
        loadingScreen = createElement('div', '', { id: 'loading-screen' });
        
        const loaderIcon = createElement('div', 'loader-icon', {
            style: 'background:rgba(255,255,255,0.7);border-radius:50%;padding:10px;box-shadow:0 0 10px rgba(0,0,0,0.1);'
        });
        
        loaderIcon.innerHTML = `
            <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="18" fill="none" stroke="#ddd" stroke-width="4"></circle>
                <path d="M20 2 A18 18 0 0 1 38 20" fill="none" stroke="#4285f4" stroke-width="4" stroke-linecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 20 20" to="360 20 20" dur="1s" repeatCount="indefinite"></animateTransform>
                </path>
            </svg>
        `;
        
        const loadingText = createElement('h3', '', {
            style: 'background:rgba(255,255,255,0.7);padding:5px 15px;border-radius:4px;margin-top:10px;'
        });
        loadingText.textContent = '新标签页加载中...';
        
        loadingScreen.appendChild(loaderIcon);
        loadingScreen.appendChild(loadingText);
        document.body.appendChild(loadingScreen);
    }
    
    loadingScreen.style.display = 'flex';
    
    // 添加进度条
    if (!document.getElementById('loading-progress')) {
        const progressContainer = createElement('div', 'progress-container', { id: 'loading-progress-container' });
        const progressBar = createElement('div', 'progress-bar', { id: 'loading-progress' });
        const statusText = createElement('div', 'status-text', { id: 'loading-status' });
        
        progressContainer.appendChild(progressBar);
        loadingScreen.appendChild(progressContainer);
        loadingScreen.appendChild(statusText);
    }
}

/**
 * 隐藏加载指示器
 * @param {boolean} [immediate=false] - 是否立即隐藏，无过渡动画
 */
export function hideLoadingIndicator(immediate = false) {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        if (immediate) {
            loadingScreen.style.display = 'none';
            return;
        }
        
        loadingScreen.style.opacity = '0';
        loadingScreen.offsetHeight;
        
        const hideTimeout = setTimeout(() => {
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
            }
        }, 600);
        
        loadingScreen.addEventListener('transitionend', () => {
            clearTimeout(hideTimeout);
            loadingScreen.style.display = 'none';
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
 * @param {number} [duration=5000] - 显示持续时间(毫秒)
 */
export function showErrorMessage(message, duration = 5000) {
    showNotification('错误', message, duration, 'error');
}

/**
 * 显示通知
 * @param {string} title - 通知标题
 * @param {string} message - 通知内容
 * @param {number} [duration=5000] - 显示持续时间(毫秒)，设为0则不自动关闭
 * @param {string} [type='info'] - 通知类型 ('info', 'error', 'warning', 'success')
 * @param {Array} [buttons] - 可选的按钮配置 [{text, class, callback}]
 * @param {Function} [onClose] - 关闭时的回调函数
 * @returns {Object} - {close} 返回控制对象
 */
export function showNotification(title, message, duration = 5000, type = 'info', buttons = null, onClose = null) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.classList.add('notification', `notification-${type}`);
    
    // 构建按钮HTML
    let buttonsHtml = '';
    if (buttons && buttons.length > 0) {
        buttonsHtml = '<div class="notification-actions">' +
            buttons.map((btn, index) => 
                `<button class="btn ${btn.class || ''}" data-button-index="${index}">${btn.text}</button>`
            ).join('') +
            '</div>';
    }
    
    // 添加通知内容 - 使用结构化HTML
    notification.innerHTML = `
        <div class="notification-content">
            <div class="notification-header">
                <h3 class="notification-title">${title}</h3>
                <button class="notification-close">&times;</button>
            </div>
            <p class="notification-message">${message}</p>
            ${buttonsHtml}
        </div>
    `;
    
    // 添加到文档
    document.body.appendChild(notification);
    
    // 获取当前所有通知并计算位置偏移
    const notifications = document.querySelectorAll('.notification');
    const offset = (notifications.length - 1) * 10; // 每个通知堆叠时上移10px
    
    // 使用setTimeout确保样式先应用
    setTimeout(() => {
        notification.style.transform = `translateY(0) translateY(-${offset}px)`;
    }, 10);
    
    // 添加关闭按钮事件
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        closeNotification();
    });
    
    // 添加自定义按钮事件
    if (buttons && buttons.length > 0) {
        buttons.forEach((btn, index) => {
            const btnElement = notification.querySelector(`[data-button-index="${index}"]`);
            if (btnElement && typeof btn.callback === 'function') {
                btnElement.addEventListener('click', () => {
                    btn.callback();
                    closeNotification();
                });
            }
        });
    }
    
    // 定时关闭 (仅当duration > 0时)
    let timeoutId;
    if (duration > 0) {
        timeoutId = setTimeout(() => {
            closeNotification();
        }, duration);
    }
    
    // 关闭通知函数
    function closeNotification() {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        notification.style.transform = 'translateY(100%)';
        
        // 动画结束后移除DOM
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
                // 重新计算其他通知的位置
                adjustNotificationPositions();
                
                // 执行回调
                if (typeof onClose === 'function') {
                    onClose();
                }
            }
        }, 300);
    }
    
    // 返回控制对象
    return { close: closeNotification };
}

/**
 * 调整所有通知的位置
 * 在删除通知后重新排列剩余通知
 */
function adjustNotificationPositions() {
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach((notification, index) => {
        notification.style.transform = `translateY(0) translateY(-${index * 10}px)`;
    });
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

/**
 * 强制隐藏加载指示器
 * @returns {boolean} - 是否成功隐藏
 */
export function forceHideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
        return true;
    }
    return false;
}

/**
 * 弹出确认对话框的通用函数
 * @param {string} message - 确认消息
 * @param {Function} onConfirm - 确认回调
 * @param {Function} [onCancel] - 取消回调
 * @returns {Object} - {close} 返回控制对象
 */
export function showConfirmDialog(message, onConfirm, onCancel) {
    // 定义按钮
    const buttons = [
        {
            text: getI18nMessage('confirm') || '确认',
            class: 'btn-primary confirm-yes',
            callback: () => {
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            }
        },
        {
            text: getI18nMessage('cancel') || '取消',
            class: 'confirm-no',
            callback: () => {
                if (typeof onCancel === 'function') {
                    onCancel();
                }
            }
        }
    ];
    
    // 使用showNotification实现确认对话框
    return showNotification(
        getI18nMessage('confirm') || '确认',
        message,
        0, // 0 表示不自动关闭
        'confirm',
        buttons
    );
}

/**
 * 创建并显示一个表单模态框
 * @param {string} title - 模态框标题
 * @param {Array} formItems - 表单项配置数组，格式为 [{type, id, label, placeholder, required}]
 * @param {Function} onConfirm - 确认回调，传入表单数据对象
 * @param {string} [confirmText] - 确认按钮文本
 * @param {string} [cancelText] - 取消按钮文本
 * @returns {Object} - {close: Function} 返回控制对象
 */
export function showFormModal(title, formItems, onConfirm, confirmText, cancelText) {
    // 生成唯一ID
    const modalId = 'form-modal-' + Date.now();
    
    // 创建模态框元素
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // 添加标题和关闭按钮
    modalContent.innerHTML = `<span class="modal-close">&times;</span><h2>${title}</h2>`;
    
    // 创建表单元素
    const formContainer = document.createElement('div');
    formContainer.className = 'modal-form';
    
    // 添加表单项
    formItems.forEach(item => {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', item.id);
        label.textContent = item.label;
        formGroup.appendChild(label);
        
        let input;
        if (item.type === 'textarea') {
            input = document.createElement('textarea');
        } else {
            input = document.createElement('input');
            input.type = item.type || 'text';
        }
        
        input.id = item.id;
        if (item.placeholder) input.placeholder = item.placeholder;
        if (item.required) input.required = true;
        if (item.value) input.value = item.value;
        
        formGroup.appendChild(input);
        formContainer.appendChild(formGroup);
    });
    
    // 添加按钮
    const actionDiv = document.createElement('div');
    actionDiv.className = 'form-actions';
    
    const cancelButton = document.createElement('button');
    cancelButton.id = `${modalId}-cancel`;
    cancelButton.className = 'btn';
    cancelButton.textContent = cancelText || getI18nMessage('cancel') || '取消';
    
    const confirmButton = document.createElement('button');
    confirmButton.id = `${modalId}-confirm`;
    confirmButton.className = 'btn btn-primary';
    confirmButton.textContent = confirmText || getI18nMessage('confirm') || '确认';
    
    actionDiv.appendChild(cancelButton);
    actionDiv.appendChild(confirmButton);
    formContainer.appendChild(actionDiv);
    
    modalContent.appendChild(formContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // 显示模态框
    modal.style.display = 'block';
    
    // 关闭模态框的函数
    const close = () => {
        modal.style.display = 'none';
        setTimeout(() => {
            if (document.body.contains(modal)) {
                document.body.removeChild(modal);
            }
        }, 300);
    };
    
    // 绑定按钮事件
    confirmButton.addEventListener('click', () => {
        // 收集表单数据
        const formData = {};
        formItems.forEach(item => {
            const input = document.getElementById(item.id);
            if (input) {
                formData[item.id] = input.value.trim();
                
                // 检查必填项
                if (item.required && !formData[item.id]) {
                    input.classList.add('error');
                    return;
                }
            }
        });
        
        // 如果有必填项未填，不关闭模态框
        const requiredItems = formItems.filter(item => item.required);
        const allFilled = requiredItems.every(item => {
            const value = formData[item.id];
            return value && value.trim().length > 0;
        });
        
        if (!allFilled) {
            // 显示错误提示
            let errorMessage = document.getElementById(`${modalId}-error`);
            if (!errorMessage) {
                errorMessage = document.createElement('div');
                errorMessage.id = `${modalId}-error`;
                errorMessage.className = 'form-error';
                errorMessage.textContent = getI18nMessage('pleaseCompleteAllFields') || '请填写所有必填项';
                formContainer.insertBefore(errorMessage, actionDiv);
            }
            return;
        }
        
        // 调用确认回调
        onConfirm(formData);
        close();
    });
    
    cancelButton.addEventListener('click', close);
    
    // 关闭按钮事件
    const closeButton = modal.querySelector('.modal-close');
    closeButton.addEventListener('click', close);
    
    // 点击外部关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            close();
        }
    });
    
    // 返回控制对象
    return { close };
}

/**
 * 创建并显示一个错误提示模态框
 * @param {string} message - 错误消息
 * @param {Function} [onClose] - 关闭回调
 * @returns {Object} - {close} 返回控制对象
 */
export function showErrorModal(message, onClose) {
    // 定义按钮
    const buttons = [
        {
            text: getI18nMessage('ok') || '确定',
            class: 'btn-primary error-ok',
            callback: () => {}
        }
    ];
    
    // 使用showNotification实现错误提示
    return showNotification(
        getI18nMessage('error') || '错误',
        message,
        0, // 0 表示不自动关闭
        'error',
        buttons,
        onClose
    );
}
