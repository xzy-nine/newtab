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
      // 关闭上下文菜单的通用事件监听
      document.addEventListener('click', (event) => {
        const menus = document.querySelectorAll('.context-menu.visible');
        if (menus.length > 0) {
          menus.forEach(menu => {
            if (!menu.contains(event.target)) {
              menu.classList.remove('visible');
            }
          });
        }
      });

      // 初始化键盘事件 - 按Esc关闭所有菜单
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          document.querySelectorAll('.context-menu.visible').forEach(menu => {
            menu.classList.remove('visible');
          });
        }
      });
    },

    /**
     * 显示文件夹上下文菜单
     * @param {Event} event - 事件对象
     * @param {Object} folder - 文件夹数据
     * @param {Object} callbacks - 回调函数对象
     * @param {Function} callbacks.onOpenFolder - 打开文件夹的回调
     * @param {Function} callbacks.onOpenAllBookmarks - 打开所有书签的回调
     */
    showFolderMenu: function(event, folder, callbacks = {}) {
      // 阻止默认菜单和冒泡
      event.preventDefault();
      event.stopPropagation();
      
      // 创建或获取上下文菜单
      let folderMenu = document.getElementById('folder-context-menu');
      if (!folderMenu) {
        folderMenu = Utils.createElement('div', 'context-menu', {id: 'folder-context-menu'});
        document.body.appendChild(folderMenu);
      }
      
      // 清空旧内容
      folderMenu.innerHTML = '';
      
      // 创建菜单项
      const openFolderItem = Utils.createElement('div', 'context-menu-item', {id: 'open-folder'}, I18n.getMessage('openFolder'));
      const openAllItem = Utils.createElement('div', 'context-menu-item', {id: 'open-all-bookmarks'}, I18n.getMessage('openAllBookmarks'));
      
      folderMenu.appendChild(openFolderItem);
      folderMenu.appendChild(openAllItem);
      
      // 设置菜单位置
      folderMenu.style.left = `${event.pageX}px`;
      folderMenu.style.top = `${event.pageY}px`;
      folderMenu.classList.add('visible');
      
      // 菜单项点击事件
      openFolderItem.addEventListener('click', () => {
        if (typeof callbacks.onOpenFolder === 'function') {
          callbacks.onOpenFolder(folder);
        }
        folderMenu.classList.remove('visible');
      });
      
      openAllItem.addEventListener('click', () => {
        if (typeof callbacks.onOpenAllBookmarks === 'function') {
          callbacks.onOpenAllBookmarks(folder);
        }
        folderMenu.classList.remove('visible');
      });
    },

    /**
     * 显示快捷方式上下文菜单
     * @param {Event} event - 事件对象
     * @param {Object} shortcut - 快捷方式数据
     * @param {Object} callbacks - 回调函数对象
     * @param {Function} callbacks.onCustomIcon - 自定义图标的回调
     * @param {Function} callbacks.onResetIcon - 重置图标的回调
     */
    showShortcutMenu: function(event, shortcut, callbacks = {}) {
      const { pageX, pageY } = event;
      
      // 创建上下文菜单
      let contextMenu = document.getElementById('shortcut-context-menu') || 
        Utils.createElement('div', 'context-menu', {id: 'shortcut-context-menu'});
      
      if (!document.body.contains(contextMenu)) {
        document.body.appendChild(contextMenu);
      }
      
      // 设置菜单内容和位置
      contextMenu.innerHTML = `
        <div class="context-menu-item" id="custom-icon">${I18n.getMessage('customIcon')}</div>
        <div class="context-menu-item" id="reset-icon">${I18n.getMessage('resetIcon')}</div>
      `;
      
      contextMenu.style.left = `${pageX}px`;
      contextMenu.style.top = `${pageY}px`;
      contextMenu.style.display = 'block';
      
      // 菜单项点击事件
      document.getElementById('custom-icon').addEventListener('click', () => {
        if (typeof callbacks.onCustomIcon === 'function') {
          callbacks.onCustomIcon(shortcut);
        }
        contextMenu.style.display = 'none';
      });
      
      document.getElementById('reset-icon').addEventListener('click', () => {
        if (typeof callbacks.onResetIcon === 'function') {
          callbacks.onResetIcon(shortcut);
        }
        contextMenu.style.display = 'none';
      });
    },

    /**
     * 显示通用上下文菜单
     * @param {Event} event - 事件对象 
     * @param {Array} items - 菜单项数组，每项包含 {id, text, callback, disabled} 属性
     */
    showGeneralMenu: function(event, items = []) {
      event.preventDefault();
      
      // 创建或获取上下文菜单
      let contextMenu = document.getElementById('general-context-menu');
      if (!contextMenu) {
        contextMenu = Utils.createElement('div', 'context-menu', {id: 'general-context-menu'});
        document.body.appendChild(contextMenu);
      }
      
      // 清空旧内容
      contextMenu.innerHTML = '';
      
      // 创建菜单项
      items.forEach(item => {
        const menuItem = Utils.createElement(
          'div', 
          `context-menu-item${item.disabled ? ' disabled' : ''}`, 
          {id: item.id},
          item.text
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
    },

    /**
     * 显示书签上下文菜单
     * @param {Event} event - 事件对象
     * @param {number} index - 书签索引
     * @param {Array} bookmarks - 书签数组
     * @param {Object} callbacks - 回调函数对象
     * @param {Function} callbacks.onDelete - 删除书签的回调
     * @param {Function} callbacks.onMoveUp - 上移书签的回调
     * @param {Function} callbacks.onMoveDown - 下移书签的回调
     */
    showBookmarkMenu: function(event, index, bookmarks, callbacks = {}) {
      const contextMenu = document.getElementById('bookmark-context-menu') || 
        Utils.createElement('div', 'context-menu', {id: 'bookmark-context-menu'});
      
      if (!document.body.contains(contextMenu)) {
        document.body.appendChild(contextMenu);
      }
      
      // 设置菜单位置
      contextMenu.style.left = `${event.pageX}px`;
      contextMenu.style.top = `${event.pageY}px`;
      contextMenu.style.display = 'block';
      contextMenu.dataset.index = index;
      
      event.preventDefault();
      event.stopPropagation();
      
      // 构建菜单
      contextMenu.innerHTML = `
        <div id="bookmark-delete" class="context-menu-item">${I18n.getMessage('delete')}</div>
        <div id="bookmark-move-up" class="context-menu-item ${index === 0 ? 'disabled' : ''}">${I18n.getMessage('moveUp')}</div>
        <div id="bookmark-move-down" class="context-menu-item ${index === bookmarks.length - 1 ? 'disabled' : ''}">${I18n.getMessage('moveDown')}</div>
      `;
      
      // 删除按钮事件
      if (typeof callbacks.onDelete === 'function') {
        document.getElementById('bookmark-delete').addEventListener('click', () => {
          Utils.UI.notify({
            title: I18n.getMessage('confirm'),
            message: I18n.getMessage('confirmDeleteBookmark'),
            type: 'confirm',
            duration: 0,
            buttons: [
              {
                text: I18n.getMessage('confirm'),
                class: 'btn-primary',
                callback: () => callbacks.onDelete(index)
              },
              {
                text: I18n.getMessage('cancel'),
                callback: () => {}
              }
            ]
          });
          contextMenu.style.display = 'none';
        });
      }
      
      // 上移按钮事件
      if (typeof callbacks.onMoveUp === 'function' && index > 0) {
        document.getElementById('bookmark-move-up').addEventListener('click', () => {
          callbacks.onMoveUp(index);
          contextMenu.style.display = 'none';
        });
      }
      
      // 下移按钮事件
      if (typeof callbacks.onMoveDown === 'function' && index < bookmarks.length - 1) {
        document.getElementById('bookmark-move-down').addEventListener('click', () => {
          callbacks.onMoveDown(index);
          contextMenu.style.display = 'none';
        });
      }
    },
    
    /**
     * 隐藏所有上下文菜单
     */
    hideAllMenus: function() {
      document.querySelectorAll('.context-menu').forEach(menu => {
        menu.classList.remove('visible');
        menu.style.display = 'none';
      });
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