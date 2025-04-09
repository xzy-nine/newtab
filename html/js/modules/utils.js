/**
 * 工具函数模块
 * 包含通用UI处理、通知、模态框等功能
 */

import { I18n } from './i18n.js';

/**
 * 工具函数命名空间
 */
export const Utils = {
  fetchData: async url => {
    try {
      return await (await fetch(url)).json();
    } catch (error) {
      console.error('Failed to fetch data from', url, error);
      throw error;
    }
  },

  blobToBase64: blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }),

  getDomain: url => {
    try {
      const { protocol, hostname } = new URL(url);
      return `${protocol}//${hostname}`;
    } catch (e) {
      console.error('Invalid URL:', url);
      return '';
    }
  },

  createElement: (tag, className, attributes = {}, content = '') => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (content) element.innerHTML = content;
    return element;
  },

  isElementInViewport: el => {
    const { top, left, bottom, right } = el.getBoundingClientRect();
    return (
      top >= 0 &&
      left >= 0 &&
      bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  calculateTotalHeight: element => element.scrollHeight * 1.1,

  UI: {
    showLoadingIndicator: (containerId = null) => {
      let loadingOverlay = document.getElementById('loading-overlay');
      
      if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.className = 'compact-loading'; // 添加新的类名用于非全屏显示
        
        const loaderContainer = document.createElement('div');
        loaderContainer.className = 'loader-container';
        
        const spinner = document.createElement('div');
        spinner.className = 'loader-spinner';
        
        const progress = document.createElement('div');
        progress.id = 'loading-progress';
        progress.innerHTML = '<div id="loading-progress-bar"></div>';
        
        const message = document.createElement('div');
        message.id = 'loading-message';
        message.textContent = '正在加载...';
        
        loaderContainer.append(spinner, progress, message);
        loadingOverlay.appendChild(loaderContainer);
        
        // 如果指定了容器ID，则将加载指示器追加到该容器内
        // 否则添加到body并使用固定位置而非全屏
        if (containerId) {
          const container = document.getElementById(containerId);
          if (container) {
            container.appendChild(loadingOverlay);
          } else {
            document.body.appendChild(loadingOverlay);
          }
        } else {
          document.body.appendChild(loadingOverlay);
        }
      } else {
        loadingOverlay.classList.remove('hiding');
        loadingOverlay.style.display = 'flex';
      }
    },

    updateLoadingProgress: (percent, message) => {
      const progressBar = document.getElementById('loading-progress-bar');
      const loadingMessage = document.getElementById('loading-message');
      
      if (progressBar) progressBar.style.width = `${percent}%`;
      
      if (loadingMessage && message) {
        loadingMessage.style.opacity = '0';
        setTimeout(() => {
          loadingMessage.textContent = message;
          loadingMessage.style.opacity = '1';
        }, 200);
      }
      
      if (percent >= 100) {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.classList.add('load-complete');
      }
    },

    hideLoadingIndicator: (force = false) => {
      const loadingOverlay = document.getElementById('loading-overlay');
      if (loadingOverlay) {
        if (force) {
          loadingOverlay.style.display = 'none';
        } else {
          loadingOverlay.classList.add('hiding');
          setTimeout(() => {
            loadingOverlay.style.display = 'none';
          }, 500);
        }
      }
    },

    showErrorMessage: message => {
      const loadingMessage = document.getElementById('loading-message');
      const progressBar = document.getElementById('loading-progress-bar');
      
      if (loadingMessage) {
        loadingMessage.textContent = message;
        loadingMessage.style.color = '#e53935';
      }
      
      if (progressBar) progressBar.style.backgroundColor = '#e53935';
      
      setTimeout(() => Utils.UI.hideLoadingIndicator(true), 5000);
    },

    notify: (options) => {
      const { 
        title = '', 
        message = '', 
        type = 'info', 
        duration = 5000, 
        buttons = null, 
        onClose = null 
      } = options;

      const notification = document.createElement('div');
      notification.className = `notification notification-${type}`;
      
      let buttonsHtml = '';
      if (buttons?.length) {
        buttonsHtml = '<div class="notification-actions">' +
          buttons.map((btn, index) => 
            `<button class="btn ${btn.class || ''}" data-button-index="${index}">${btn.text}</button>`
          ).join('') + '</div>';
      }
      
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
      
      document.body.appendChild(notification);
      
      const notifications = document.querySelectorAll('.notification');
      const index = notifications.length - 1;
      
      setTimeout(() => {
        notification.classList.add(`notification-offset-${index}`);
      }, 10);
      
      const closeNotification = () => {
        if (timeoutId) clearTimeout(timeoutId);
        notification.style.transform = 'translateY(100%)';
        
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
            Utils.UI.adjustNotificationPositions();
            if (typeof onClose === 'function') onClose();
          }
        }, 300);
      };
      
      notification.querySelector('.notification-close')
        .addEventListener('click', closeNotification);
      
      if (buttons?.length) {
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
      
      let timeoutId;
      if (duration > 0) {
        timeoutId = setTimeout(closeNotification, duration);
      }
      
      return { close: closeNotification };
    },

    adjustNotificationPositions: () => {
      document.querySelectorAll('.notification').forEach((notification, index) => {
        notification.classList.remove('notification-offset-1', 'notification-offset-2', 
          'notification-offset-3', 'notification-offset-4', 'notification-offset-5');
        notification.classList.add(`notification-offset-${index}`);
      });
    },

    /**
     * @deprecated 请使用 Utils.UI.notify() 代替
     */
    showNotification: (title, message, duration = 5000, type = 'info', buttons = null, onClose = null) => {
      console.warn('Utils.UI.showNotification() 已弃用，请使用 Utils.UI.notify() 代替');
      return Utils.UI.notify({ title, message, duration, type, buttons, onClose });
    },

    /**
     * @deprecated 请使用 Utils.UI.notify() 代替
     */
    showConfirmDialog: (message, onConfirm, onCancel) => {
      console.warn('Utils.UI.showConfirmDialog() 已弃用，请使用 Utils.UI.notify() 代替');
      const buttons = [
        {
          text: I18n.getMessage('confirm') || '确认',
          class: 'btn-primary confirm-yes',
          callback: () => { if (typeof onConfirm === 'function') onConfirm(); }
        },
        {
          text: I18n.getMessage('cancel') || '取消',
          class: 'confirm-no',
          callback: () => { if (typeof onCancel === 'function') onCancel(); }
        }
      ];
      
      return Utils.UI.notify({
        title: I18n.getMessage('confirm') || '确认',
        message,
        duration: 0,
        type: 'confirm',
        buttons
      });
    },

    /**
     * @deprecated 请使用 Utils.UI.notify() 代替
     */
    showErrorModal: (title, message, logOnly = true) => {
      console.warn('Utils.UI.showErrorModal() 已弃用，请使用 Utils.UI.notify() 代替');
      console.error(message);
      if (logOnly) return undefined;
      
      return Utils.UI.notify({
        title: title || I18n.getMessage('error') || '错误',
        message,
        duration: 0,
        type: 'error',
        buttons: [{
          text: I18n.getMessage('ok') || '确定',
          class: 'btn-primary error-ok',
          callback: () => {}
        }]
      });
    }
  },

  showFormModal: (title, formItems, onConfirm, confirmText, cancelText) => {
    const modalId = 'form-modal-' + Date.now();
    const modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.innerHTML = `<span class="modal-close">&times;</span><h2>${title}</h2>`;
    
    const formContainer = document.createElement('div');
    formContainer.className = 'modal-form';
    
    formItems.forEach(item => {
      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', item.id);
      label.textContent = item.label;
      
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
      
      formGroup.append(label, input);
      formContainer.appendChild(formGroup);
    });
    
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
    
    actionDiv.append(cancelButton, confirmButton);
    formContainer.appendChild(actionDiv);
    modalContent.appendChild(formContainer);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    modal.style.display = 'block';
    
    const close = () => {
      modal.style.display = 'none';
      setTimeout(() => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      }, 300);
    };
    
    confirmButton.addEventListener('click', () => {
      const formData = {};
      let allFilled = true;
      
      formItems.forEach(item => {
        const input = document.getElementById(item.id);
        if (input) {
          formData[item.id] = input.value.trim();
          if (item.required && !formData[item.id]) {
            input.classList.add('error');
            allFilled = false;
          }
        }
      });
      
      if (!allFilled) {
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
      
      onConfirm(formData);
      close();
    });
    
    cancelButton.addEventListener('click', close);
    
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    
    return { close };
  },

  Modal: {
    initEvents: () => {
      document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelectorAll('.modal-close').forEach(button => {
          button.addEventListener('click', () => {
            modal.style.display = 'none';
          });
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) modal.style.display = 'none';
        });
      });
    },

    show: modalId => {
      const modal = document.getElementById(modalId);
      if (!modal) {
        console.error(`Modal with id ${modalId} not found`);
        return;
      }
      
      modal.classList.add('visible');
      
      if (!modal.dataset.initialized) {
        modal.querySelectorAll('.modal-close').forEach(button => {
          const newButton = button.cloneNode(true);
          button.parentNode.replaceChild(newButton, button);
          
          newButton.addEventListener('click', () => {
            Utils.Modal.hide(modalId);
          });
        });
        
        modal.addEventListener('click', e => {
          if (e.target === modal) Utils.Modal.hide(modalId);
        });
        
        modal.dataset.initialized = 'true';
      }
    },

    hide: modalId => {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('visible');
    }
  },

  Events: {
    handleDocumentClick: e => {
      document.querySelectorAll('.dropdown-menu.active').forEach(dropdown => {
        if (!dropdown.parentElement.contains(e.target)) {
          dropdown.classList.remove('active');
        }
      });
    },

    handlePageLoad: () => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        setTimeout(() => {
          loadingScreen.style.display = 'none';
        }, 500);
      }
      
      const searchInput = document.getElementById('search-input');
      if (searchInput) setTimeout(() => searchInput.focus(), 100);
    },

    handleWindowResize: () => {
      // 处理响应式布局调整
    },

    handleKeyDown: e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(modal => {
          modal.style.display = 'none';
        });
      }
    },

    initUIEvents: function() {
      window.addEventListener('load', this.handlePageLoad);
      window.addEventListener('resize', this.handleWindowResize);
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('click', this.handleDocumentClick);
      Utils.Modal.initEvents();
    }
  }
};