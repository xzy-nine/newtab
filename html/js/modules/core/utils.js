/**
 * 工具函数模块
 * 包含通用处理功能
 * 
 * 自动检测环境（DOM/Service Worker）并提供相应功能
 * 减少了对单独 background.js 文件的需求
 */

// 环境检测
const isDOMEnvironment = typeof document !== 'undefined';
const isServiceWorker = typeof importScripts === 'function';

// 动态导入依赖模块（仅在需要时）
let Notification, I18n;

// 延迟加载依赖模块
async function loadDependencies() {
  if (!Notification && isDOMEnvironment) {
    try {
      const notificationModule = await import('../notifications/notification.js');
      Notification = notificationModule.Notification;
    } catch (error) {
      console.warn('通知模块加载失败:', error);
    }
  }
  
  if (!I18n) {
    try {
      const i18nModule = await import('./i18n.js');
      I18n = i18nModule.I18n;
    } catch (error) {
      console.warn('国际化模块加载失败:', error);
    }
  }
}

/**
 * 工具函数命名空间
 * 集成了原 background.js 中的功能，根据环境自动选择合适的实现
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

  /**
   * 节流函数（合并自background.js）
   * @param {Function} func - 要执行的函数
   * @param {number} limit - 节流间隔(ms)
   * @returns {Function} - 节流后的函数
   */
  throttle: function(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * 延迟执行函数（来自background.js）
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise} - 延迟Promise
   */
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

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
    // 只在 DOM 环境中执行
    if (typeof document === 'undefined') {
      console.warn('createElement called in non-DOM environment');
      return null;
    }
    
    const element = document.createElement(tag);
    if (className) element.className = className;
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (content) element.innerHTML = content;
    return element;
  },
  isElementInViewport: el => {
    // 只在 DOM 环境中执行
    if (typeof document === 'undefined' || !el) {
      return false;
    }
    
    const { top, left, bottom, right } = el.getBoundingClientRect();
    return (
      top >= 0 &&
      left >= 0 &&
      bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  },

  calculateTotalHeight: element => {
    // 只在 DOM 环境中执行
    if (typeof document === 'undefined' || !element) {
      return 0;
    }
    return element.scrollHeight * 1.1;
  },
  /**
   * 统一错误处理
   * @param {Error} error - 错误对象
   * @param {string} customMessage - 自定义错误消息
   * @param {boolean} throwError - 是否继续抛出错误
   */
  handleError: async function(error, customMessage = '', throwError = false) {
    console.error(error);
    
    // 确保依赖模块已加载
    await loadDependencies();
    
    const message = customMessage || error.message || (I18n ? I18n.getMessage('genericError', '发生错误') : '发生错误');
    
    if (Notification && isDOMEnvironment) {
      Notification.notify({
        title: I18n ? I18n.getMessage('errorTitle', '错误') : '错误',
        message: message,
        type: 'error',
        duration: 5000
      });
    }
    
    if (throwError) {
      throw error;
    }
  },

  /**
   * 格式化日期（来自background.js）
   * @param {Date} date - 日期对象
   * @param {string} locale - 本地化设置
   * @returns {string} - 格式化后的日期字符串
   */
  formatDate: (date, locale = 'zh-CN') => {
    return new Intl.DateTimeFormat(locale).format(date);
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
      startMessage = '加载中',
      successMessage = '准备就绪',
      errorMessage = null,
      autoHide = true
    } = options;
    
    try {
      // 确保依赖模块已加载
      await loadDependencies();
      
      if (Notification && isDOMEnvironment) {
        Notification.showLoadingIndicator(null, containerId);
        Notification.updateLoadingProgress(10, startMessage);
      }
      
      const result = await task();
      
      if (Notification && isDOMEnvironment) {
        Notification.updateLoadingProgress(100, successMessage);
        if (autoHide) {
          setTimeout(() => Notification.hideLoadingIndicator(), 500);
        }
      }
      
      return result;
    } catch (error) {
      if (Notification && isDOMEnvironment) {
        const message = errorMessage || error.message || '发生错误';
        Notification.showErrorMessage(message);
      }
      throw error;
    }
  },

  /**
   * 环境检测工具
   * 合并原有的环境相关功能
   */
  Environment: {
    isDOMEnvironment,
    isServiceWorker,
    
    /**
     * 检查是否在主线程中
     * @returns {boolean}
     */
    isMainThread: () => isDOMEnvironment && typeof window !== 'undefined',
    
    /**
     * 安全地执行DOM操作
     * @param {Function} operation - DOM操作函数
     * @param {any} fallback - 非DOM环境下的返回值
     * @returns {any}
     */
    safeDOMOperation: (operation, fallback = null) => {
      if (isDOMEnvironment) {
        try {
          return operation();
        } catch (error) {
          console.error('DOM操作失败:', error);
          return fallback;
        }
      }
      return fallback;
    }
  },
  /**
   * 安全地替换元素的事件处理器
   * @param {string} selector - 元素选择器
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  replaceEventHandler: function(selector, event, handler) {
    // 只在 DOM 环境中执行
    if (typeof document === 'undefined') {
      return;
    }
    
    document.querySelectorAll(selector).forEach(element => {
      const newElement = element.cloneNode(true);
      element.parentNode.replaceChild(newElement, element);
      newElement.addEventListener(event, handler);
    });
  },

  UI: {
    Events: {
      handleDocumentClick: e => {
        // 只在 DOM 环境中执行
        if (typeof document === 'undefined') {
          return;
        }
        
        document.querySelectorAll('.dropdown-menu.active').forEach(dropdown => {
          if (!dropdown.parentElement.contains(e.target)) {
            dropdown.classList.remove('active');
          }
        });
      },      handlePageLoad: () => {
        // 只在 DOM 环境中执行
        if (typeof document === 'undefined') {
          return;
        }
        
        const searchInput = document.getElementById('search-input');
        if (searchInput) setTimeout(() => searchInput.focus(), 100);
      },
      
      handleKeyDown: e => {
        // 只在 DOM 环境中执行
        if (typeof document === 'undefined') {
          return;
        }
        
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal').forEach(modal => {
            modal.style.display = 'none';
          });
        }
      },

      handleWindowResize: function() {
        // 只在 DOM 环境中执行
        if (typeof document === 'undefined' || typeof window === 'undefined') {
          return;
        }
        
        // 处理窗口大小变化
        // 这里可以添加响应式布局调整逻辑
        document.dispatchEvent(new CustomEvent('window-resized', {
          detail: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        }));
      },

      initUIEvents: function() {
        // 只在 DOM 环境中执行
        if (typeof document === 'undefined' || typeof window === 'undefined') {
          return;
        }
        
        window.addEventListener('load', this.handlePageLoad);
        window.addEventListener('resize', this.handleWindowResize);
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('click', this.handleDocumentClick);
        
        // 触发事件让其他模块可以初始化自己的UI事件
        document.dispatchEvent(new CustomEvent('utils-ui-events-initialized'));
      }
    },
  },

  /**
   * 简化的模块初始化辅助工具
   * 替代复杂的initManager，通过判断而不是单独文件减少维护成本
   */
  ModuleInit: {
    /**
     * 已初始化的模块记录
     */
    _initialized: new Set(),
    
    /**
     * 初始化状态
     */
    _status: new Map(),
    
    /**
     * 注册并初始化模块
     * @param {string} name - 模块名称
     * @param {Function} initFunction - 初始化函数
     * @param {Object} options - 选项
     */
    async register(name, initFunction, options = {}) {
      const { 
        requiresDOM = true, 
        dependencies = [], 
        timeout = 10000,
        retries = 1 
      } = options;
      
      // 环境检查
      if (requiresDOM && !isDOMEnvironment) {
        console.log(`模块 ${name} 需要DOM环境，跳过初始化`);
        return false;
      }
      
      // 防止重复初始化
      if (this._initialized.has(name)) {
        return true;
      }
      
      this._status.set(name, 'initializing');
      
      try {
        // 等待依赖模块
        for (const dep of dependencies) {
          if (!this._initialized.has(dep)) {
            await this.waitFor(dep, timeout);
          }
        }
        
        // 带超时的初始化
        await Promise.race([
          initFunction(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`模块 ${name} 初始化超时`)), timeout)
          )
        ]);
        
        this._initialized.add(name);
        this._status.set(name, 'initialized');
        console.log(`模块 ${name} 初始化成功`);
        return true;
        
      } catch (error) {
        this._status.set(name, 'error');
        console.error(`模块 ${name} 初始化失败:`, error);
        
        // 重试机制
        if (retries > 0) {
          console.log(`模块 ${name} 将在1秒后重试...`);
          await this.delay(1000);
          return this.register(name, initFunction, { ...options, retries: retries - 1 });
        }
        
        throw error;
      }
    },
    
    /**
     * 等待模块初始化完成
     * @param {string} name - 模块名称
     * @param {number} timeout - 超时时间
     */
    async waitFor(name, timeout = 10000) {
      if (this._initialized.has(name)) {
        return true;
      }
      
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (this._initialized.has(name)) {
          return true;
        }
        await this.delay(100);
      }
      
      throw new Error(`等待模块 ${name} 初始化超时`);
    },
    
    /**
     * 检查模块是否已初始化
     * @param {string} name - 模块名称
     */
    isInitialized(name) {
      return this._initialized.has(name);
    },
    
    /**
     * 获取所有模块状态
     */
    getStatus() {
      return {
        initialized: Array.from(this._initialized),
        status: Object.fromEntries(this._status)
      };
    },
    
    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     */
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
  }
};