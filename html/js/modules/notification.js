/**
 * 通知系统模块
 * 包含通知、加载指示器等功能
 */

import { I18n } from './i18n.js';
import { Utils } from './utils.js';

/**
 * 通知系统命名空间
 */
export const Notification = {
  /**
   * 检查是否为 Service Worker 环境
   * @returns {boolean} 是否为 Service Worker 环境
   */
  isServiceWorker: () => {
    return typeof window === 'undefined' && typeof document === 'undefined' && typeof importScripts === 'function';
  },

  /**
   * 检查是否有 DOM 环境
   * @returns {boolean} 是否有 DOM 环境
   */
  hasDOMEnvironment: () => {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
  },

  /**
   * 获取通知配置
   * @param {string} type - 通知类型
   * @returns {Object} 通知配置
   */
  getNotificationConfig: (type) => {
    // 错误通知始终使用固定配置，不受设置控制
    if (type === 'error') {
      // 在 Service Worker 中使用默认值
      const errorDuration = Notification.hasDOMEnvironment() ? 
        parseInt(localStorage.getItem('notification-duration-error') || '8000') : 8000;
      return {
        duration: errorDuration,
        autoClose: true
      };
    }
    
    // 加载通知始终不自动关闭
    if (type === 'loading') {
      return {
        duration: 0,
        autoClose: false
      };
    }
    
    // 从设置中获取其他类型通知的配置
    const defaultDurations = {
      'info': 3000,
      'success': 2000,
      'warning': 5000
    };
    
    const duration = Notification.hasDOMEnvironment() ? 
      parseInt(localStorage.getItem(`notification-duration-${type}`) || defaultDurations[type] || 3000) :
      defaultDurations[type] || 3000;
    
    return {
      duration: duration,
      autoClose: true
    };
  },

  /**
   * 显示通知 - 支持 Service Worker 环境
   * @param {Object} options 通知选项
   * @param {string} options.title 通知标题
   * @param {string} options.message 通知消息
   * @param {string} options.type 通知类型: 'info', 'success', 'warning', 'error', 'loading'
   * @param {number} options.duration 显示持续时间(毫秒)，null表示使用默认时间(普通通知3秒，错误通知8秒)，0表示不自动关闭
   * @param {Array} options.buttons 按钮配置: [{text, class, callback}]
   * @param {Function} options.onClose 关闭回调函数
   * @param {boolean} options.sendToPopup 是否同时发送到弹出页面(默认true)
   * @param {boolean} options.forceLocal 强制只显示本地通知，不发送到弹出页面
   * @param {boolean} options.showInBadge 是否在徽标中显示未读状态(默认true，但新标签页通知为false)
   * @returns {Object} 通知控制对象: {close, getElement}
   */  
  notify: (options) => {
    const { 
      title = '', 
      message = '', 
      type = 'info', 
      duration = null, 
      buttons = null, 
      onClose = null,
      sendToPopup = true,
      forceLocal = false,
      showInBadge = null
    } = options;

    // 在 Service Worker 环境中，只处理消息发送
    if (Notification.isServiceWorker()) {
      if (sendToPopup && !forceLocal) {
        const shouldShowInBadge = showInBadge !== null ? showInBadge : true;
        Notification.sendToPopup({ 
          title, 
          message, 
          type,
          showInBadge: shouldShowInBadge
        });
      }
      
      // 返回一个简化的控制对象
      return { 
        close: () => console.log('通知关闭（Service Worker环境）'),
        getElement: () => null 
      };
    }

    // 原有的 DOM 环境逻辑
    if (!Notification.hasDOMEnvironment()) {
      console.warn('通知模块需要 DOM 环境');
      return { close: () => {}, getElement: () => null };
    }

    // 智能判断是否发送到弹出页面
    const shouldSendToPopup = sendToPopup && 
                              !forceLocal && 
                              type !== 'loading' && 
                              Notification.isExtensionEnvironment();

    // 智能判断是否在徽标中显示
    const shouldShowInBadge = showInBadge !== null ? showInBadge : !Notification.isNewTabPage();

    if (shouldSendToPopup) {
      Notification.sendToPopup({ 
        title, 
        message, 
        type,
        showInBadge: shouldShowInBadge
      });
    }

    // 获取通知配置
    const config = Notification.getNotificationConfig(type);
    
    // 智能设置持续时间
    let finalDuration = duration;
    if (finalDuration === null) {
      finalDuration = config.duration;
    }

    const notification = Utils.createElement('div', `notification notification-${type}`);
    notification.dataset.visible = 'false';
    
    let buttonsHtml = '';
    if (buttons?.length) {
      buttonsHtml = '<div class="notification-actions">' +
        buttons.map((btn, index) => 
          `<button class="btn ${btn.class || ''}" data-button-index="${index}">${btn.text}</button>`
        ).join('') + '</div>';
    }
    
    const copyButtonHtml = type !== 'loading' ? 
      '<button class="notification-copy" title="' + I18n.getMessage('copyToClipboard', '复制内容') + '">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
      '</svg></button>' : '';
    
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-header">
          <h3 class="notification-title">${title}</h3>
          <button class="notification-close">&times;</button>
        </div>
        <p class="notification-message">${message}</p>
        ${buttonsHtml}
        ${copyButtonHtml}
      </div>
    `;    document.body.appendChild(notification);
    
    let timeoutId;
    
    const closeNotification = () => {
      // 清除定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      notification.classList.remove('visible');
      notification.dataset.visible = 'false';
      
      // 从通知管理系统中移除
      Notification.notificationManager.remove(notification);
      
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
          Notification.adjustNotificationPositions();
          if (typeof onClose === 'function') onClose();
        }
      }, 300);
    };
    
    // 设置位置偏移
    setTimeout(() => {
      notification.classList.add('visible');
      notification.dataset.visible = 'true';
      Notification.adjustNotificationPositions();
      
      // 在通知变为可见后，启动自动关闭定时器（如果需要的话）
      if (finalDuration > 0) {
        timeoutId = setTimeout(closeNotification, finalDuration);
      }
    }, 10);
    
    notification.querySelector('.notification-close')
      .addEventListener('click', closeNotification);
    
    // 为复制按钮添加点击事件
    if (type !== 'loading') {
      const copyButton = notification.querySelector('.notification-copy');
      if (copyButton) {
        copyButton.addEventListener('click', () => {
          const contentToCopy = `${title}\n${message}`.trim();
          navigator.clipboard.writeText(contentToCopy).then(() => {
            // 显示复制成功的反馈
            const originalTitle = copyButton.getAttribute('title');
            copyButton.setAttribute('title', I18n.getMessage('copied', '已复制'));
            copyButton.classList.add('copied');
            
            // 1.5秒后恢复原始状态
            setTimeout(() => {
              copyButton.setAttribute('title', originalTitle);
              copyButton.classList.remove('copied');
            }, 1500);
          }).catch(err => {
            console.error('复制失败: ', err);
          });
        });
      }
    }

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
    
    // 添加可见性检查函数
    const checkVisibilityAndSetTimeout = () => {
      // 这个函数主要用于通知管理系统调用
      // 如果通知变为可见且还没有设置定时器，则设置定时器
      if (notification.dataset.visible === 'true' && finalDuration > 0 && !timeoutId) {
        timeoutId = setTimeout(closeNotification, finalDuration);
      }
    };
    
    // 添加到通知管理系统
    Notification.notificationManager.add(notification, finalDuration, closeNotification, checkVisibilityAndSetTimeout);
    
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
      if (!Notification.hasDOMEnvironment()) return;
      
      const notificationItem = {
        element: notification,
        duration,
        close: closeCallback,
        checkVisibility: visibilityCallback
      };
      
      Notification.notificationManager.notifications.push(notificationItem);
      Notification.notificationManager.updateVisibility();
    },

    updateVisibility: () => {
      if (!Notification.hasDOMEnvironment()) return;
      
      const notifications = Notification.notificationManager.notifications;
      
      // 更新所有通知的可见状态
      notifications.forEach((item, index) => {
        const wasVisible = item.element.dataset.visible === 'true';
        
        if (index < Notification.notificationManager.visibleLimit) {
          item.element.dataset.visible = 'true';
          // 如果通知从不可见变为可见，检查是否需要启动定时器
          if (!wasVisible) {
            item.checkVisibility();
          }
        } else {
          item.element.dataset.visible = 'false';
          // 隐藏的通知不触发消失
        }
      });
    },
    
    remove: (notification) => {
      if (!Notification.hasDOMEnvironment()) return;
      
      const index = Notification.notificationManager.notifications.findIndex(
        item => item.element === notification
      );
      
      if (index !== -1) {
        Notification.notificationManager.notifications.splice(index, 1);
        Notification.notificationManager.updateVisibility();
      }
    }
  },

  adjustNotificationPositions: () => {
    if (!Notification.hasDOMEnvironment()) return;
    
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
    Notification.notificationManager.updateVisibility();
  },
  // 加载指示器相关方法
  showLoadingIndicator: (loadingText = null, containerId = null) => {
    if (!Notification.hasDOMEnvironment()) {
      console.log('加载指示器仅在DOM环境中可用');
      return null;
    }

    const displayText = loadingText || I18n.getMessage('loading', '加载中');
    
    // 移除原有的全屏加载逻辑
    let loadingNotification = document.querySelector('.notification.loading-notification');
    
    if (!loadingNotification) {
      // 创建加载通知
      const notification = Notification.notify({
        title: displayText,
        message: '<div class="loading-content">' +
                 '<div class="mini-loader-spinner"></div>' + 
                 '<div class="mini-progress">' +
                 '<div class="notification-loading-bar"></div></div>' +
                 '<div class="notification-loading-message">' + displayText + '</div>' +
                 '</div>',
        type: 'loading',
        duration: 0 // 不自动关闭
      });
      
      loadingNotification = notification.getElement();
      loadingNotification.classList.add('loading-notification');
      
      // 确保加载通知始终显示在顶部
      if (containerId) {
        const container = document.getElementById(containerId);
        if (container) {
          // 如果指定了容器，则确保通知在容器内部可见
          container.style.position = 'relative';
        }
      }
    } else {
      // 如果已存在，确保它是可见的
      loadingNotification.classList.add('visible');
      Notification.adjustNotificationPositions();
    }
    
    return loadingNotification;
  },

  updateLoadingProgress: (() => {
    let lastUpdateTime = 0;
    let lastPercent = 0;
    let pendingUpdate = null;
    const MIN_DISPLAY_TIME = 500; // 最低显示时间为500毫秒(0.5秒)

    return (percent, message) => {
      if (!Notification.hasDOMEnvironment()) return;
      
      const loadingNotification = document.querySelector('.notification.loading-notification');
      if (!loadingNotification) return;
      
      const progressBar = loadingNotification.querySelector('.notification-loading-bar');
      const loadingMessage = loadingNotification.querySelector('.notification-loading-message');
      
      const currentTime = Date.now();
      const timeElapsed = currentTime - lastUpdateTime;
      
      // 计算实际显示的百分比，确保平滑过渡
      let displayPercent = percent;
      
      // 如果有待处理的更新，取消它
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
      
      // 如果距离上次更新不足最低显示时间，则延迟更新
      if (lastUpdateTime > 0 && timeElapsed < MIN_DISPLAY_TIME) {
        pendingUpdate = setTimeout(() => {
          // 递归调用以执行实际更新
          Notification.updateLoadingProgress(percent, message);
        }, MIN_DISPLAY_TIME - timeElapsed);
        return;
      }
      
      // 更新进度条
      if (progressBar) {
        // 如果百分比增加很大，使用平滑过渡
        if (percent > lastPercent) {
          progressBar.style.transition = `width ${Math.min(300, MIN_DISPLAY_TIME)}ms ease-out`;
        }
        progressBar.style.width = `${displayPercent}%`;
      }
      
      // 更新消息文本
      if (loadingMessage && message) {
        loadingMessage.style.opacity = '0';
        setTimeout(() => {
          loadingMessage.textContent = message;
          loadingMessage.style.opacity = '1';
        }, 200);
      }
      
      // 如果达到100%，添加完成样式
      if (percent >= 100) {
        loadingNotification.classList.add('load-complete');
      }
      
      // 更新状态追踪变量
      lastUpdateTime = currentTime;
      lastPercent = displayPercent;
    };
  })(),

  hideLoadingIndicator: (force = false) => {
    if (!Notification.hasDOMEnvironment()) return;
    
    const loadingNotification = document.querySelector('.notification.loading-notification');
    if (!loadingNotification) return;
    
    if (force) {
      loadingNotification.classList.remove('visible');
      setTimeout(() => {
        if (document.body.contains(loadingNotification)) {
          document.body.removeChild(loadingNotification);
          Notification.adjustNotificationPositions();
        }
      }, 300);
    } else {
      // 添加完成动画，然后隐藏
      loadingNotification.classList.add('load-complete');
      setTimeout(() => {
        loadingNotification.classList.remove('visible');
        setTimeout(() => {
          if (document.body.contains(loadingNotification)) {
            document.body.removeChild(loadingNotification);
            Notification.adjustNotificationPositions();
          }
        }, 300);
      }, 1000); // 显示完成状态1秒后关闭
    }
  },

  showErrorMessage: message => {
    if (!Notification.hasDOMEnvironment()) return;
    
    const loadingNotification = document.querySelector('.notification.loading-notification');
    if (!loadingNotification) return;
    
    const loadingMessage = loadingNotification.querySelector('.notification-loading-message');
    const progressBar = loadingNotification.querySelector('.notification-loading-bar');
    
    if (loadingMessage) {
      loadingMessage.textContent = message;
      loadingMessage.style.color = '#e53935';
    }
    if (progressBar) progressBar.style.backgroundColor = '#e53935';
    
    setTimeout(() => Notification.hideLoadingIndicator(true), 5000);
  },

  /**
   * 发送通知到扩展弹出页面 - 改进的错误处理
   * @param {Object} notification 通知对象
   */
  sendToPopup: async (notification) => {
    try {
      // 检查是否为扩展环境
      if (Notification.isExtensionEnvironment() || Notification.isServiceWorker()) {
        // 发送消息到background script
        const response = await chrome.runtime.sendMessage({
          action: 'addPopupNotification',
          notification: notification
        });
        
        if (!response?.success) {
          console.warn('发送通知到弹出页面失败');
        }
      }
    } catch (error) {
      console.log('发送通知到弹出页面失败:', error);
    }
  },

  /**
   * 检查是否为扩展环境 - 改进的检测
   * @returns {boolean} 是否为扩展环境
   */
  isExtensionEnvironment: () => {
    try {
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             chrome.runtime.sendMessage;
    } catch (error) {
      return false;
    }
  },

  /**
   * 检查当前是否为新标签页
   * @returns {boolean} 是否为新标签页
   */
  isNewTabPage: () => {
    try {
      if (Notification.isServiceWorker()) return false;
      return window.location.pathname.includes('newtab.html') || 
             window.location.protocol === 'chrome-extension:';
    } catch (error) {
      return false;
    }
  },

  /**
   * 简化的通知API，专为后台脚本和弹出页面设计
   */
  background: {
    /**
     * 发送通知到弹出页面（后台专用）
     */
    sendNotification: (type, title, message, options = {}) => {
      return Notification.sendToPopup({
        type,
        title,
        message,
        showInBadge: options.showInBadge !== false,
        ...options
      });
    },

    /**
     * 显示信息通知
     */
    info: (title, message, options) => Notification.background.sendNotification('info', title, message, options),

    /**
     * 显示成功通知
     */
    success: (title, message, options) => Notification.background.sendNotification('success', title, message, options),

    /**
     * 显示警告通知
     */
    warning: (title, message, options) => Notification.background.sendNotification('warning', title, message, options),

    /**
     * 显示错误通知
     */
    error: (title, message, options) => Notification.background.sendNotification('error', title, message, options)
  },

  /**
   * 简化的通知API，专为弹出页面设计
   */
  popup: {
    info: (title, message) => Notification.notify({
      title, message, type: 'info', forceLocal: true
    }),

    success: (title, message) => Notification.notify({
      title, message, type: 'success', forceLocal: true
    }),

    warning: (title, message) => Notification.notify({
      title, message, type: 'warning', forceLocal: true
    }),

    error: (title, message) => Notification.notify({
      title, message, type: 'error', forceLocal: true
    })
  }
};