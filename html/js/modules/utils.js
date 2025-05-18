/**
 * 工具函数模块
 * 包含通用UI处理、通知、模态框等功能
 */
import { Menu } from './menu.js';
import { Notification } from './notification.js';
import { I18n } from './i18n.js';

/**
 * 工具函数命名空间
 */
export const Utils = {
/**
   * 防抖函数
   * @param {Function} func - 要执行的函数
   * @param {number} wait - 等待时间(ms)
   * @returns {Function} - 防抖后的函数
   */
  debounce: function(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  },

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

  /**
   * 统一错误处理
   * @param {Error} error - 错误对象
   * @param {string} customMessage - 自定义错误消息
   * @param {boolean} throwError - 是否继续抛出错误
   */
  handleError: function(error, customMessage = '', throwError = false) {
    console.error(error);
    const message = customMessage || error.message || I18n.getMessage('genericError');
    Notification.notify({
      title: I18n.getMessage('errorTitle') || '错误',
      message: message,
      type: 'error',
      duration: 5000
    });
    
    if (throwError) {
      throw error;
    }
  },

  /**
   * 执行带有加载指示器的任务
   * @param {Function} task - 要执行的异步任务
   * @param {Object} options - 配置选项
   * @returns {Promise<any>} - 任务结果
   */
  withLoading: async function(task, options = {}) {
    const {
      containerId = null,
      startMessage = I18n.getMessage('loading') || '加载中',
      successMessage = I18n.getMessage('ready') || '准备就绪',
      errorMessage = null,
      autoHide = true
    } = options;
    
    try {
      Notification.showLoadingIndicator(containerId);
      Notification.updateLoadingProgress(10, startMessage);
      
      const result = await task();
      
      Notification.updateLoadingProgress(100, successMessage);
      if (autoHide) {
        setTimeout(() => Notification.hideLoadingIndicator(), 500);
      }
      
      return result;
    } catch (error) {
      if (errorMessage) {
        Notification.showErrorMessage(errorMessage);
      } else {
        Notification.showErrorMessage(error.message || I18n.getMessage('genericError') || '发生错误');
      }
      throw error;
    }
  },

  /**
   * 安全地替换元素的事件处理器
   * @param {string} selector - 元素选择器
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  replaceEventHandler: function(selector, event, handler) {
    document.querySelectorAll(selector).forEach(element => {
      const newElement = element.cloneNode(true);
      element.parentNode.replaceChild(newElement, element);
      newElement.addEventListener(event, handler);
    });
  },

  UI: {
    Events: {
      handleDocumentClick: e => {
        document.querySelectorAll('.dropdown-menu.active').forEach(dropdown => {
          if (!dropdown.parentElement.contains(e.target)) {
            dropdown.classList.remove('active');
          }
        });
      },

      handlePageLoad: () => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) setTimeout(() => searchInput.focus(), 100);
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
        Menu.Modal.initEvents();
        Menu.ContextMenu.init(); // 初始化上下文菜单
      }
    },
  }
};