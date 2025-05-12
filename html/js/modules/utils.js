/**
 * 工具函数模块
 * 包含通用UI处理、通知、模态框等功能
 */
import { Notification } from './notification.js';
import { Menu } from './menu.js';

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
      // 不需要再处理旧的全屏加载元素
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
      Menu.Modal.initEvents();
      Menu.ContextMenu.init(); // 初始化上下文菜单
    }
  },

  /**
   * 将文件转换为 Base64 编码
   * @param {File} file - 要转换的文件
   * @returns {Promise<string>} - 返回 Base64 编码的字符串
   */
  fileToBase64: (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
   }
  }
};