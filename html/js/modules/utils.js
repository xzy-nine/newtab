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
        loadingOverlay = Utils.createElement('div', 'compact-loading', { id: 'loading-overlay' });
        
        const loaderContainer = Utils.createElement('div', 'loader-container');
        
        const spinner = Utils.createElement('div', 'loader-spinner');
        
        const progress = Utils.createElement('div', '', { id: 'loading-progress' }, 
          '<div id="loading-progress-bar"></div>');
        
        const message = Utils.createElement('div', '', { id: 'loading-message' }, '正在加载...');
        
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

      const notification = Utils.createElement('div', `notification notification-${type}`);
      notification.dataset.visible = 'false';
      
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
      
      // 设置位置偏移
      setTimeout(() => {
        notification.classList.add('visible');
        Utils.UI.adjustNotificationPositions();
      }, 10);
      
      const closeNotification = () => {
        notification.classList.remove('visible');
        
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
      
      // 添加可见性检查函数
      const checkVisibilityAndSetTimeout = () => {
        if (notification.dataset.visible === 'true' && duration > 0) {
          timeoutId = setTimeout(closeNotification, duration);
        }
      };
      
      // 添加到通知管理系统
      Utils.UI.notificationManager.add(notification, duration, closeNotification, checkVisibilityAndSetTimeout);
      
      return { 
        close: closeNotification,
        getElement: () => notification 
      };
    },

    // 通知管理系统
    notificationManager: {
      notifications: [],
      visibleLimit: 3, // 最大同时显示数量
      
      add: (notification, duration, closeCallback, visibilityCallback) => {
        const notificationItem = {
          element: notification,
          duration,
          close: closeCallback,
          checkVisibility: visibilityCallback
        };
        
        Utils.UI.notificationManager.notifications.push(notificationItem);
        Utils.UI.notificationManager.updateVisibility();
      },
      
      updateVisibility: () => {
        const notifications = Utils.UI.notificationManager.notifications;
        
        // 更新所有通知的可见状态
        notifications.forEach((item, index) => {
          if (index < Utils.UI.notificationManager.visibleLimit) {
            item.element.dataset.visible = 'true';
            item.checkVisibility(); // 对可见通知检查是否需要启动定时器
          } else {
            item.element.dataset.visible = 'false';
            // 隐藏的通知不触发消失
          }
        });
      },
      
      remove: (notification) => {
        const index = Utils.UI.notificationManager.notifications.findIndex(
          item => item.element === notification
        );
        
        if (index !== -1) {
          Utils.UI.notificationManager.notifications.splice(index, 1);
          Utils.UI.notificationManager.updateVisibility();
        }
      }
    },

    adjustNotificationPositions: () => {
      const notifications = document.querySelectorAll('.notification');
      notifications.forEach((notification, index) => {
        // 清除所有偏移类
        notification.classList.remove(
          'notification-offset-0', 'notification-offset-1', 'notification-offset-2', 
          'notification-offset-3', 'notification-offset-4', 'notification-offset-5'
        );
        
        // 重新添加正确的偏移类
        notification.classList.add(`notification-offset-${index}`);
      });
      
      // 更新通知管理系统
      Utils.UI.notificationManager.updateVisibility();
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
    const modal = Utils.createElement('div', 'modal', { id: modalId });
    
    const modalContent = Utils.createElement('div', 'modal-content', {}, 
      `<span class="modal-close">&times;</span><h2>${title}</h2>`);
    
    const formContainer = Utils.createElement('div', 'modal-form');
    
    formItems.forEach(item => {
      const formGroup = Utils.createElement('div', 'form-group');
      
      const label = Utils.createElement('label', '', { for: item.id }, item.label);
      
      let input;
      if (item.type === 'textarea') {
        input = Utils.createElement('textarea', '', { id: item.id });
      } else {
        input = Utils.createElement('input', '', { 
          id: item.id, 
          type: item.type || 'text' 
        });
      }
      
      if (item.placeholder) input.placeholder = item.placeholder;
      if (item.required) input.required = true;
      if (item.value) input.value = item.value;
      
      formGroup.append(label, input);
      formContainer.appendChild(formGroup);
    });
    
    const actionDiv = Utils.createElement('div', 'form-actions');

    const cancelButton = Utils.createElement(
      'button', 
      'btn', 
      { id: `${modalId}-cancel` },
      cancelText || I18n.getMessage('cancel') || '取消'
    );

    const confirmButton = Utils.createElement(
      'button', 
      'btn btn-primary', 
      { id: `${modalId}-confirm` },
      confirmText || I18n.getMessage('confirm') || '确认'
    );
    
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
          errorMessage = Utils.createElement(
            'div', 
            'form-error', 
            { id: `${modalId}-error` }, 
            I18n.getMessage('pleaseCompleteAllFields') || '请填写所有必填项'
          );
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

  ContextMenu: {
    /**
     * 初始化上下文菜单功能
     */
    init: function() {
      // 通用关闭菜单事件
      document.addEventListener('click', () => {
        document.querySelectorAll('.context-menu.visible').forEach(menu => {
          menu.classList.remove('visible');
        });
      });

      // ESC键关闭菜单
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          document.querySelectorAll('.context-menu.visible').forEach(menu => {
            menu.classList.remove('visible');
          });
        }
      });
    },

    /**
     * 显示自定义上下文菜单
     * @param {Event} event - 触发事件
     * @param {Array} items - 菜单项数组，每项包含 {id, text, callback, disabled, divider} 属性
     * @param {Object} options - 配置选项
     * @param {string} options.menuId - 菜单ID，默认为general-context-menu
     * @param {boolean} options.preventDefaultAndStopPropagation - 是否阻止默认事件和冒泡
     * @returns {HTMLElement} 菜单元素
     */
    show: function(event, items = [], options = {}) {
      const menuId = options.menuId || 'general-context-menu';
      
      if (options.preventDefaultAndStopPropagation !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
      
      // 创建或获取上下文菜单
      let contextMenu = document.getElementById(menuId);
      if (!contextMenu) {
        contextMenu = Utils.createElement('div', 'context-menu', {id: menuId});
        document.body.appendChild(contextMenu);
      }
      
      // 清空旧内容
      contextMenu.innerHTML = '';
      
      // 创建菜单项
      items.forEach(item => {
        if (item.divider) {
          contextMenu.appendChild(Utils.createElement('div', 'context-menu-divider'));
          return;
        }
        
        const menuItem = Utils.createElement(
          'div', 
          `context-menu-item${item.disabled ? ' disabled' : ''}${item.class ? ' ' + item.class : ''}`, 
          {id: item.id || ''},
          item.text || ''
        );
        
        if (!item.disabled && typeof item.callback === 'function') {
          menuItem.addEventListener('click', () => {
            item.callback();
            contextMenu.classList.remove('visible');
          });
        }
        
        contextMenu.appendChild(menuItem);
      });
      
      // 设置菜单位置
      contextMenu.style.left = `${event.pageX}px`;
      contextMenu.style.top = `${event.pageY}px`;
      contextMenu.classList.add('visible');
      
      return contextMenu;
    },

    /**
     * 隐藏所有上下文菜单
     */
    hideAll: function() {
      document.querySelectorAll('.context-menu').forEach(menu => {
        menu.classList.remove('visible');
      });
    },

    /**
     * @deprecated 请使用 ContextMenu.show() 代替
     */
    showFolderMenu: function(event, folder, callbacks = {}) {
      console.warn('Utils.ContextMenu.showFolderMenu() 已弃用，请使用 Utils.ContextMenu.show() 代替');
      
      const items = [
        {
          id: 'open-folder',
          text: I18n.getMessage('openFolder'),
          callback: () => callbacks.onOpenFolder && callbacks.onOpenFolder(folder)
        },
        {
          id: 'open-all-bookmarks',
          text: I18n.getMessage('openAllBookmarks'),
          callback: () => callbacks.onOpenAllBookmarks && callbacks.onOpenAllBookmarks(folder)
        }
      ];
      
      return this.show(event, items, {menuId: 'folder-context-menu'});
    },

    /**
     * @deprecated 请使用 ContextMenu.show() 代替
     */
    showShortcutMenu: function(event, shortcut, callbacks = {}) {
      console.warn('Utils.ContextMenu.showShortcutMenu() 已弃用，请使用 Utils.ContextMenu.show() 代替');
      
      const items = [
        {
          id: 'custom-icon',
          text: I18n.getMessage('customIcon'),
          callback: () => callbacks.onCustomIcon && callbacks.onCustomIcon(shortcut)
        },
        {
          id: 'reset-icon',
          text: I18n.getMessage('resetIcon'),
          callback: () => callbacks.onResetIcon && callbacks.onResetIcon(shortcut)
        }
      ];
      
      return this.show(event, items, {menuId: 'shortcut-context-menu'});
    },

    /**
     * @deprecated 请使用 ContextMenu.show() 代替
     */
    showGeneralMenu: function(event, items = []) {
      console.warn('Utils.ContextMenu.showGeneralMenu() 已弃用，请使用 Utils.ContextMenu.show() 代替');
      return this.show(event, items, {menuId: 'general-context-menu'});
    },

    /**
     * @deprecated 请使用 ContextMenu.show() 代替
     */
    showBookmarkMenu: function(event, index, bookmarks, callbacks = {}) {
      console.warn('Utils.ContextMenu.showBookmarkMenu() 已弃用，请使用 Utils.ContextMenu.show() 代替');
      
      const items = [
        {
          id: 'bookmark-delete',
          text: I18n.getMessage('delete'),
          callback: () => {
            Utils.UI.notify({
              title: I18n.getMessage('confirm'),
              message: I18n.getMessage('confirmDeleteBookmark'),
              type: 'confirm',
              duration: 0,
              buttons: [
                {
                  text: I18n.getMessage('confirm'),
                  class: 'btn-primary',
                  callback: () => callbacks.onDelete && callbacks.onDelete(index)
                },
                {
                  text: I18n.getMessage('cancel'),
                  callback: () => {}
                }
              ]
            });
          }
        },
        {
          id: 'bookmark-move-up',
          text: I18n.getMessage('moveUp'),
          disabled: index === 0,
          callback: () => callbacks.onMoveUp && callbacks.onMoveUp(index)
        },
        {
          id: 'bookmark-move-down',
          text: I18n.getMessage('moveDown'),
          disabled: index === bookmarks.length - 1,
          callback: () => callbacks.onMoveDown && callbacks.onMoveDown(index)
        }
      ];
      
      return this.show(event, items, {menuId: 'bookmark-context-menu'});
    },
    
    /**
     * @deprecated 请使用 ContextMenu.hideAll() 代替
     */
    hideAllMenus: function() {
      console.warn('Utils.ContextMenu.hideAllMenus() 已弃用，请使用 Utils.ContextMenu.hideAll() 代替');
      return this.hideAll();
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
      Utils.ContextMenu.init(); // 初始化上下文菜单
    }
  }
};