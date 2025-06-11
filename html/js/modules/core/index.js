/**
 * 核心模块统一导出文件
 * 提供统一的导入入口，简化其他模块的导入过程
 * 
 * 导出顺序说明：
 * 1. 基础工具模块 - 无依赖
 * 2. 基础功能模块 - 依赖基础工具
 * 3. 复合功能模块 - 依赖前面的模块
 * 
 * 注意：已将background.js的功能合并到utils.js中，减少文件维护成本
 */

// ==================== 基础工具模块（无依赖） ====================
// 初始化管理器 - 核心初始化系统，无依赖
export { InitManager, initManager } from './init/initManager.js';

// 国际化模块 - 基础功能，无依赖
export { I18n } from './i18n.js';

// ==================== 基础功能模块 ====================
// 通知系统 - 依赖 I18n
export { Notification } from '../notifications/notification.js';
export { NotificationManager } from '../notifications/notificationManager.js';

// 工具函数模块 - 已合并background.js功能，自动环境检测
export { Utils } from './utils.js';

// 工具函数的后台专用别名 - 为了向后兼容
// 简化实现，直接重新定义避免循环依赖
export const BackgroundUtils = {
  // 延迟函数
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // 防抖函数
  debounce: function(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  },

  // 节流函数
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

  // 简化版的其他功能，延迟加载完整Utils
  getDomain: function(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  },

  // 基础错误处理
  handleError: function(error, context = '') {
    console.error(`${context}: ${error}`);
  },

  // 基础格式化日期
  formatDate: function(date) {
    return new Date(date).toLocaleString();
  },

  // 基础数据获取
  fetchData: async function(url, options = {}) {
    try {
      const response = await fetch(url, options);
      return await response.json();
    } catch (error) {
      this.handleError(error, 'fetchData');
      return null;
    }
  }
};

// ==================== 核心交互模块 ====================
// 菜单系统模块 - 依赖 Utils, I18n
export { Menu } from './menu.js';

// 图标管理 - 依赖 Utils, I18n
export { IconManager } from './iconManager.js';

// 网格系统模块 - 依赖 Notification, I18n, Utils
export { GridSystem } from './gridSystem.js';

// ==================== 高级功能模块 ====================
// 主题管理 - 依赖核心模块
export { ThemeManager } from '../themeManager.js';

// 设置管理 - 依赖多个核心模块
export { Settings } from '../settings.js';

// ==================== 应用功能模块 ====================
// 搜索引擎
export { SearchEngineAPI } from '../searchEngine.js';

// 书签管理
export { BookmarkManager } from '../bookmarks.js';

// 时钟小部件
export { ClockWidget } from '../clockWidget.js';

// 背景图片管理
export { default as backgroundManager, BackgroundManager } from '../backgroundImage.js';

// AI助手
export { AI } from '../ai.js';

// 数据同步
export { DataSync } from '../dataSync.js';

// ==================== 小部件系统 ====================
// 小部件系统核心
export { WidgetSystem } from '../widgets/widgetSystem.js';

// 小部件注册中心
export { WidgetRegistry } from '../widgets/widgetRegistry.js';
