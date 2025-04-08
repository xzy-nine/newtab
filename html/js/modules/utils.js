/**
 * 工具函数模块
 * 包含通用UI处理、通知、模态框等功能
 */

import { I18n } from './i18n.js';

/**
 * 工具函数命名空间
 * @namespace
 */
export const Utils = {
  /**
   * 从URL获取数据并解析为JSON
   * @param {string} url - 请求的URL
   * @returns {Promise<Object>} - 解析后的JSON对象
   */
  fetchData: async function(url) {
    try {
      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch data from', url, error);
      throw error;
    }
  },

  /**
   * 将Blob对象转换为base64字符串
   * @param {Blob} blob - 需要转换的Blob对象
   * @returns {Promise<string>} - 转换后的base64字符串
   */
  blobToBase64: function(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  /**
   * 获取域名
   * @param {string} url - 完整URL
   * @returns {string} - 域名
   */
  getDomain: function(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.hostname}`;
    } catch (e) {
      console.error('Invalid URL:', url);
      return '';
    }
  },

  /**
   * 创建DOM元素的通用函数
   * @param {string} tag - 标签名
   * @param {string} className - 类名
   * @param {Object} attributes - 属性对象
   * @param {string} content - 内容
   * @returns {HTMLElement} - 创建的DOM元素
   */
  createElement: function(tag, className, attributes = {}, content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    
    if (content) element.innerHTML = content;
    return element;
  },

  /**
   * 检查元素是否在视口内
   * @param {HTMLElement} el - 要检查的元素
   * @returns {boolean} - 如果元素在视口内则返回true
   */
  isElementInViewport: function(el) {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  /**
   * 计算元素总高度
   * @param {HTMLElement} element - 要计算高度的元素
   * @returns {number} - 总高度
   */
  calculateTotalHeight: function(element) {
    return element.scrollHeight * 1.1;
  },

  UI: {
    /**
     * 显示加载指示器
     */
    showLoadingIndicator: () => {
      const loadingOverlay = document.getElementById('loading-overlay');
      if (!loadingOverlay) {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        
        const loaderContainer = document.createElement('div');
        loaderContainer.className = 'loader-container';
        
        // 添加转圈动画
        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';
        
        // 添加进度条
        const progress = document.createElement('div');
        progress.id = 'loading-progress';
        const progressBar = document.createElement('div');
        progressBar.id = 'loading-progress-bar';
        progress.appendChild(progressBar);
        
        // 添加消息区域
        const message = document.createElement('div');
        message.id = 'loading-message';
        message.textContent = '正在加载...';
        
        loaderContainer.appendChild(spinner);
        loaderContainer.appendChild(progress);
        loaderContainer.appendChild(message);
        overlay.appendChild(loaderContainer);
        
        document.body.appendChild(overlay);
      } else {
        loadingOverlay.classList.remove('hiding');
        loadingOverlay.style.display = 'flex';
      }
    },

    /**
     * 更新加载进度
     * @param {number} percent - 加载百分比 (0-100)
     * @param {string} message - 加载消息
     */
    updateLoadingProgress: (percent, message) => {
      const progressBar = document.getElementById('loading-progress-bar');
      const loadingMessage = document.getElementById('loading-message');
      
      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
      
      if (loadingMessage && message) {
        // 添加淡出效果
        loadingMessage.style.opacity = '0';
        
        setTimeout(() => {
          loadingMessage.textContent = message;
          loadingMessage.style.opacity = '1';
        }, 200);
      }
      
      // 如果进度达到100%，显示完成状态
      if (percent >= 100) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
          loadingOverlay.classList.add('load-complete');
        }
      }
    },

    /**
     * 隐藏加载指示器
     * @param {boolean} force - 是否强制隐藏
     */
    hideLoadingIndicator: (force = false) => {
      const loadingOverlay = document.getElementById('loading-overlay');
      if (loadingOverlay) {
        if (force) {
          loadingOverlay.style.display = 'none';
        } else {
          loadingOverlay.classList.add('hiding');
          // 完全移除DOM元素，在过渡完成后
          setTimeout(() => {
            loadingOverlay.style.display = 'none';
          }, 500);
        }
      }
    },

    /**
     * 显示错误消息
     * @param {string} message - 错误消息
     */
    showErrorMessage: (message) => {
      const loadingMessage = document.getElementById('loading-message');
      const progressBar = document.getElementById('loading-progress-bar');
      
      if (loadingMessage) {
        loadingMessage.textContent = message;
        loadingMessage.style.color = '#e53935';
      }
      
      if (progressBar) {
        progressBar.style.backgroundColor = '#e53935';
      }
      
      // 5秒后隐藏错误消息
      setTimeout(() => {
        Utils.UI.hideLoadingIndicator(true);
      }, 5000);
    },

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
    showNotification: function(title, message, duration = 5000, type = 'info', buttons = null, onClose = null) {
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
        notification.style.transform = `translateY(0) translateY(${offset}px)`;  // 修改为正向偏移
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
            Utils.UI.adjustNotificationPositions();
            
            // 执行回调
            if (typeof onClose === 'function') {
              onClose();
            }
          }
        }, 300);
      }
      
      // 返回控制对象
      return { close: closeNotification };
    },

    /**
     * 调整所有通知的位置
     * 在删除通知后重新排列剩余通知
     */
    adjustNotificationPositions: function() {
      const notifications = document.querySelectorAll('.notification');
      notifications.forEach((notification, index) => {
        notification.style.transform = `translateY(0) translateY(${index * 10}px)`;  // 改为向下堆叠
      });
    },

    /**
     * 弹出确认对话框的通用函数
     * @param {string} message - 确认消息
     * @param {Function} onConfirm - 确认回调
     * @param {Function} [onCancel] - 取消回调
     * @returns {Object} - {close} 返回控制对象
     */
    showConfirmDialog: function(message, onConfirm, onCancel) {
      // 定义按钮
      const buttons = [
        {
          text: I18n.getMessage('confirm') || '确认',
          class: 'btn-primary confirm-yes',
          callback: () => {
            if (typeof onConfirm === 'function') {
              onConfirm();
            }
          }
        },
        {
          text: I18n.getMessage('cancel') || '取消',
          class: 'confirm-no',
          callback: () => {
            if (typeof onCancel === 'function') {
              onCancel();
            }
          }
        }
      ];
      
      // 使用showNotification实现确认对话框
      return this.showNotification(
        I18n.getMessage('confirm') || '确认',
        message,
        0, // 0 表示不自动关闭
        'confirm',
        buttons
      );
    },

    /**
     * 创建并显示一个错误提示模态框
     * @param {string} title - 错误标题
     * @param {string} message - 错误消息内容
     * @param {boolean} [logOnly=true] - 如果为false，则显示错误通知；默认仅记录到控制台
     * @returns {Object|undefined} - {close} 返回控制对象，logOnly为true时返回undefined
     */
    showErrorModal: function(title, message, logOnly = true) {
      // 记录到浏览器的错误API
      console.error(message);
      
      // 如果只需记录不需显示，则直接返回
      if (logOnly) {
        return undefined;
      }
      
      // 定义按钮
      const buttons = [
        {
          text: I18n.getMessage('ok') || '确定',
          class: 'btn-primary error-ok',
          callback: () => {}
        }
      ];
      
      // 使用showNotification实现错误提示
      return this.showNotification(
        title || I18n.getMessage('error') || '错误',
        message,
        0, // 0 表示不自动关闭
        'error',
        buttons
      );
    },
    /**
     * 创建并显示一个表单模态框
     * @param {string} title - 模态框标题
     * @param {Array} formItems - 表单项配置数组，格式为 [{type, id, label, placeholder, required}]
     * @param {Function} onConfirm - 确认回调，传入表单数据对象
     * @param {string} [confirmText] - 确认按钮文本
     * @param {string} [cancelText] - 取消按钮文本
     * @returns {Object} - {close: Function} 返回控制对象
     */
    showFormModal: function(title, formItems, onConfirm, confirmText, cancelText) {
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
      cancelButton.textContent = cancelText || I18n.getMessage('cancel') || '取消';
      
      const confirmButton = document.createElement('button');
      confirmButton.id = `${modalId}-confirm`;
      confirmButton.className = 'btn btn-primary';
      confirmButton.textContent = confirmText || I18n.getMessage('confirm') || '确认';
      
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
            errorMessage.textContent = I18n.getMessage('pleaseCompleteAllFields') || '请填写所有必填项';
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
    },
  },

  Modal: {
    /**
     * 初始化模态框事件
     */
    initEvents: function() {
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
    },

    /**
     * 显示指定的模态框
     * @param {string} modalId - 模态框的ID
     */
    show: function(modalId) {
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
            this.hide(modalId);
          });
        });
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            this.hide(modalId);
          }
        });
        
        // 标记已初始化
        modal.dataset.initialized = 'true';
      }
    },

    /**
     * 隐藏指定的模态框
     * @param {string} modalId - 模态框的ID
     */
    hide: function(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
      }
      
      // 隐藏模态框
      modal.style.display = 'none';
    }
  },

  Events: {
    /**
     * 处理文档点击事件
     * @param {Event} e - 事件对象
     */
    handleDocumentClick: function(e) {
      // 关闭下拉菜单
      const dropdowns = document.querySelectorAll('.dropdown-menu.active');
      dropdowns.forEach(dropdown => {
        if (!dropdown.parentElement.contains(e.target)) {
          dropdown.classList.remove('active');
        }
      });
    },

    /**
     * 处理页面加载完成事件
     */
    handlePageLoad: function() {
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
    },

    /**
     * 处理窗口调整大小事件
     */
    handleWindowResize: function() {
      // 在这里处理响应式布局的调整
      // 例如根据窗口大小调整元素位置、大小等
    },

    /**
     * 处理键盘按键事件
     * @param {KeyboardEvent} e - 键盘事件对象
     */
    handleKeyDown: function(e) {
      // 处理ESC键 - 关闭模态框/面板
      if (e.key === 'Escape') {
        // 关闭所有模态框
        document.querySelectorAll('.modal').forEach(modal => {
          modal.style.display = 'none';
        });
      }
    },

    /**
     * 设置通用页面事件
     */
    initUIEvents: function() {
      // 处理页面加载完成事件
      window.addEventListener('load', this.handlePageLoad);
      
      // 处理页面调整大小事件
      window.addEventListener('resize', this.handleWindowResize);
      
      // 全局键盘快捷键
      document.addEventListener('keydown', this.handleKeyDown);
      
      // 处理点击事件，关闭弹出菜单等
      document.addEventListener('click', this.handleDocumentClick);

      // 初始化模态框事件
      Utils.Modal.initEvents();
    }
  }
};

// 以下是向后兼容的导出函数，使用新的模块化API实现

/**
 * @deprecated 使用 Utils.fetchData 代替
 */
export async function fetchData(url) {
  console.warn('函数 fetchData 已弃用，请使用 Utils.fetchData 代替');
  return Utils.fetchData(url);
}

/**
 * @deprecated 使用 Utils.blobToBase64 代替
 */
export function blobToBase64(blob) {
  console.warn('函数 blobToBase64 已弃用，请使用 Utils.blobToBase64 代替');
  return Utils.blobToBase64(blob);
}

/**
 * @deprecated 使用 Utils.getDomain 代替
 */
export function getDomain(url) {
  console.warn('函数 getDomain 已弃用，请使用 Utils.getDomain 代替');
  return Utils.getDomain(url);
}

/**
 * @deprecated 使用 Utils.createElement 代替
 */
export function createElement(tag, className, attributes = {}, content = '') {
  console.warn('函数 createElement 已弃用，请使用 Utils.createElement 代替');
  return Utils.createElement(tag, className, attributes, content);
}

/**
 * @deprecated 使用 Utils.isElementInViewport 代替
 */
export function isElementInViewport(el) {
  console.warn('函数 isElementInViewport 已弃用，请使用 Utils.isElementInViewport 代替');
  return Utils.isElementInViewport(el);
}

/**
 * @deprecated 使用 Utils.calculateTotalHeight 代替
 */
export function calculateTotalHeight(element) {
  console.warn('函数 calculateTotalHeight 已弃用，请使用 Utils.calculateTotalHeight 代替');
  return Utils.calculateTotalHeight(element);
}

/**
 * @deprecated 使用 Utils.Events.handleKeyDown 代替
 */
export function handleKeyDown(e) {
  console.warn('函数 handleKeyDown 已弃用，请使用 Utils.Events.handleKeyDown 代替');
  return Utils.Events.handleKeyDown(e);
}

/**
 * @deprecated 使用 Utils.Events.initUIEvents 代替
 */
export function initUIEvents() {
  console.warn('函数 initUIEvents 已弃用，请使用 Utils.Events.initUIEvents 代替');
  return Utils.Events.initUIEvents();
}

// 以下是弃用的函数，移至文件末尾

/**
 * @deprecated 使用 Utils.UI.showLoadingIndicator 代替
 */
export function showLoadingIndicator() {
  console.warn('函数 showLoadingIndicator 已弃用，请使用 Utils.UI.showLoadingIndicator 代替');
  return Utils.UI.showLoadingIndicator();
}

/**
 * @deprecated 使用 Utils.UI.hideLoadingIndicator 代替
 */
export function hideLoadingIndicator(immediate = false) {
  console.warn('函数 hideLoadingIndicator 已弃用，请使用 Utils.UI.hideLoadingIndicator 代替');
  return Utils.UI.hideLoadingIndicator(immediate);
}

/**
 * @deprecated 使用 Utils.UI.updateLoadingProgress 代替
 */
export function updateLoadingProgress(percent, statusMessage) {
  console.warn('函数 updateLoadingProgress 已弃用，请使用 Utils.UI.updateLoadingProgress 代替');
  return Utils.UI.updateLoadingProgress(percent, statusMessage);
}

/**
 * @deprecated 使用 Utils.UI.showErrorMessage 代替
 */
export function showErrorMessage(message, duration = 5000) {
  console.warn('函数 showErrorMessage 已弃用，请使用 Utils.UI.showErrorMessage 代替');
  return Utils.UI.showErrorMessage(message, duration);
}

/**
 * @deprecated 使用 Utils.UI.showNotification 代替
 */
export function showNotification(title, message, duration = 5000, type = 'info', buttons = null, onClose = null) {
  console.warn('函数 showNotification 已弃用，请使用 Utils.UI.showNotification 代替');
  return Utils.UI.showNotification(title, message, duration, type, buttons, onClose);
}

/**
 * @deprecated 使用 Utils.Modal.initEvents 代替
 */
export function initModalEvents() {
  console.warn('函数 initModalEvents 已弃用，请使用 Utils.Modal.initEvents 代替');
  return Utils.Modal.initEvents();
}

/**
 * @deprecated 使用 Utils.Modal.show 代替
 */
export function showModal(modalId) {
  console.warn('函数 showModal 已弃用，请使用 Utils.Modal.show 代替');
  return Utils.Modal.show(modalId);
}

/**
 * @deprecated 使用 Utils.Modal.hide 代替
 */
export function hideModal(modalId) {
  console.warn('函数 hideModal 已弃用，请使用 Utils.Modal.hide 代替');
  return Utils.Modal.hide(modalId);
}

/**
 * @deprecated 使用 Utils.UI.forceHideLoading 代替
 */
export function forceHideLoading() {
  console.warn('函数 forceHideLoading 已弃用，请使用 Utils.UI.forceHideLoading 代替');
  return Utils.UI.forceHideLoading();
}

/**
 * @deprecated 使用 Utils.UI.showConfirmDialog 代替
 */
export function showConfirmDialog(message, onConfirm, onCancel) {
  console.warn('函数 showConfirmDialog 已弃用，请使用 Utils.UI.showConfirmDialog 代替');
  return Utils.UI.showConfirmDialog(message, onConfirm, onCancel);
}

/**
 * @deprecated 使用 Utils.UI.showFormModal 代替
 */
export function showFormModal(title, formItems, onConfirm, confirmText, cancelText) {
  console.warn('函数 showFormModal 已弃用，请使用 Utils.UI.showFormModal 代替');
  return Utils.UI.showFormModal(title, formItems, onConfirm, confirmText, cancelText);
}

/**
 * @deprecated 使用 Utils.UI.showErrorModal 代替
 */
export function showErrorModal(message, onClose) {
  console.warn('函数 showErrorModal 已弃用，请使用 Utils.UI.showErrorModal 代替');
  return Utils.UI.showErrorModal(message, onClose);
}