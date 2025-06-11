/**
 * Content Script - 向网页注入通知 API
 * 使得其他网页或油猴脚本可以使用扩展的通知功能
 */

// 检查外部通知API是否被用户启用
async function isExternalNotificationEnabled() {
  try {
    // 通过storage API检查设置
    const result = await chrome.storage.local.get(['external-notifications-enabled']);
    return result['external-notifications-enabled'] !== 'false'; // 默认启用
  } catch (error) {
    console.warn('无法检查外部通知设置，默认启用:', error);
    return true; // 如果无法检查，默认启用
  }
}

// 缓存设置状态，避免重复查询
let cachedSettings = null;
let settingsLastChecked = 0;
const SETTINGS_CACHE_DURATION = 5000; // 5秒缓存

async function getCachedNotificationSettings() {
  const now = Date.now();
  if (cachedSettings === null || (now - settingsLastChecked) > SETTINGS_CACHE_DURATION) {
    cachedSettings = await isExternalNotificationEnabled();
    settingsLastChecked = now;
  }
  return cachedSettings;
}

// 注入的全局通知 API
const ExtensionNotificationAPI = {
  /**
   * 显示通知
   * @param {Object} options 通知选项
   * @param {string} options.title 通知标题
   * @param {string} options.message 通知消息
   * @param {string} options.type 通知类型: 'info', 'success', 'warning', 'error'
   * @param {number} options.duration 显示持续时间(毫秒)，0表示不自动关闭
   * @param {Array} options.buttons 按钮配置: [{text, callback}]
   * @returns {Promise} 通知结果
   */  async notify(options) {
    console.log('=== Content Script notify调用 ===');
    console.log('options:', options);
    console.log('chrome.runtime:', chrome.runtime);
    console.log('chrome.runtime.sendMessage:', chrome.runtime.sendMessage);
    
    try {
      console.log('正在发送消息到background...');
      const response = await chrome.runtime.sendMessage({
        action: 'showExternalNotification',
        options: options
      });
      console.log('background响应:', response);
      return response;
    } catch (error) {
      console.error('ExtensionNotification API 调用失败:', error);
      throw error;
    }
  },

  /**
   * 显示信息通知
   * @param {string} title 通知标题
   * @param {string} message 通知消息
   * @param {number} duration 显示时间(毫秒)
   */
  info(title, message, duration = 3000) {
    return this.notify({ title, message, type: 'info', duration });
  },

  /**
   * 显示成功通知
   * @param {string} title 通知标题
   * @param {string} message 通知消息
   * @param {number} duration 显示时间(毫秒)
   */
  success(title, message, duration = 2000) {
    return this.notify({ title, message, type: 'success', duration });
  },

  /**
   * 显示警告通知
   * @param {string} title 通知标题
   * @param {string} message 通知消息
   * @param {number} duration 显示时间(毫秒)
   */
  warning(title, message, duration = 5000) {
    return this.notify({ title, message, type: 'warning', duration });
  },

  /**
   * 显示错误通知
   * @param {string} title 通知标题
   * @param {string} message 通知消息
   * @param {number} duration 显示时间(毫秒)
   */
  error(title, message, duration = 8000) {
    return this.notify({ title, message, type: 'error', duration });
  },

  /**
   * 显示加载指示器
   * @param {string} message 加载消息
   * @returns {Promise<Object>} 返回控制对象 {hide}
   */
  async showLoading(message = '加载中...') {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'showExternalLoading',
        message: message
      });
      
      return {
        hide: async () => {
          await chrome.runtime.sendMessage({
            action: 'hideExternalLoading'
          });
        },
        updateProgress: async (percent, newMessage) => {
          await chrome.runtime.sendMessage({
            action: 'updateExternalLoadingProgress',
            percent: percent,
            message: newMessage
          });
        }
      };
    } catch (error) {
      console.error('ExtensionNotification showLoading 调用失败:', error);
      throw error;
    }
  },  /**
   * 检查扩展是否可用
   * @returns {boolean} 扩展是否可用
   */
  isAvailable() {
    // 只检查Chrome扩展API是否可用，设置检查留给实际调用时
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  },

  /**
   * 获取扩展版本信息
   * @returns {Promise<string>} 扩展版本
   */
  async getVersion() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getExtensionVersion'
      });
      return response?.version || 'unknown';
    } catch (error) {
      console.error('获取扩展版本失败:', error);
      return 'unknown';
    }
  }
};

// 修改 ExtensionNotificationAPI 中的方法，添加启用状态检查
const OriginalNotify = ExtensionNotificationAPI.notify;
ExtensionNotificationAPI.notify = async function(options) {
  const enabled = await getCachedNotificationSettings();
  if (!enabled) {
    console.warn('外部通知API已被用户禁用');
    throw new Error('外部通知API已被禁用，请在扩展设置中启用');
  }
  return OriginalNotify.call(this, options);
};

// 为其他快捷方法也添加检查
['info', 'success', 'warning', 'error', 'showLoading'].forEach(method => {
  const original = ExtensionNotificationAPI[method];
  ExtensionNotificationAPI[method] = async function(...args) {
    const enabled = await getCachedNotificationSettings();
    if (!enabled) {
      console.warn('外部通知API已被用户禁用');
      throw new Error('外部通知API已被禁用，请在扩展设置中启用');
    }
    return original.apply(this, args);
  };
});

// 使用 postMessage 与页面脚本通信
function setupPostMessageCommunication() {
  console.log('=== Content Script 设置 postMessage 通信 ===');
  
  // 监听来自页面脚本的消息
  window.addEventListener('message', async (event) => {
    // 只处理来自同一源的消息
    if (event.origin !== window.location.origin) {
      return;
    }
    
    // 检查消息类型
    if (event.data && event.data.type === 'EXTENSION_NOTIFICATION_REQUEST') {
      console.log('Content Script 收到通知请求:', event.data);
      
      const { method, params, requestId } = event.data;
      
      try {
        let result;
          // 根据方法调用相应的 API
        switch (method) {
          case 'isAvailable':
            result = ExtensionNotificationAPI.isAvailable();
            break;
          case 'notify':
            result = await ExtensionNotificationAPI.notify({
              title: params.title,
              message: params.message,
              type: 'info',
              duration: params.duration || 3000
            });
            break;
          case 'info':
            result = await ExtensionNotificationAPI.notify({
              title: params.title,
              message: params.message,
              type: 'info',
              duration: params.duration || 3000
            });
            break;
          case 'success':
            result = await ExtensionNotificationAPI.notify({
              title: params.title,
              message: params.message,
              type: 'success',
              duration: params.duration || 2000
            });
            break;
          case 'warning':
            result = await ExtensionNotificationAPI.notify({
              title: params.title,
              message: params.message,
              type: 'warning',
              duration: params.duration || 5000
            });
            break;
          case 'error':
            result = await ExtensionNotificationAPI.notify({
              title: params.title,
              message: params.message,
              type: 'error',
              duration: params.duration || 8000
            });
            break;
          default:
            throw new Error(`Unknown method: ${method}`);
        }
        
        // 发送成功响应
        window.postMessage({
          type: 'EXTENSION_NOTIFICATION_RESPONSE',
          requestId,
          success: true,
          result
        }, '*');
        
      } catch (error) {
        console.error('Content Script 处理通知请求失败:', error);
        
        // 发送错误响应
        window.postMessage({
          type: 'EXTENSION_NOTIFICATION_RESPONSE',
          requestId,
          success: false,
          error: error.message
        }, '*');
      }
    }
  });
  
  // 向页面发送 API 就绪通知
  const notifyAPIReady = () => {
    const message = {
      type: 'EXTENSION_NOTIFICATION_READY',
      version: chrome.runtime.getManifest?.()?.version || 'unknown',
      timestamp: Date.now()
    };
    
    console.log('Content Script 发送 API 就绪通知:', message);
    window.postMessage(message, '*');
  };
  
  // 立即发送通知
  notifyAPIReady();
  
  // 延迟发送，确保页面脚本有时间设置监听器
  setTimeout(notifyAPIReady, 100);
  setTimeout(notifyAPIReady, 500);
  
  console.log('postMessage 通信已设置完成');
}// 只在非扩展页面中设置 postMessage 通信
if (window.location.protocol !== 'chrome-extension:') {
  console.log('=== Content Script 开始执行 ===');
  console.log('当前页面URL:', window.location.href);
  console.log('document.readyState:', document.readyState);
  
  // 立即设置通信，不等待DOM加载完成，以支持 @run-at document-start 的用户脚本
  try {
    setupPostMessageCommunication();
  } catch (error) {
    console.error('立即设置通信失败:', error);
  }
  
  // 为了确保在各种情况下都能正确设置，在DOM加载完成后再次设置
  if (document.readyState === 'loading') {
    console.log('文档仍在加载中，添加DOMContentLoaded监听器');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOMContentLoaded触发，确保通信已设置');
      // 再次发送就绪通知，确保用户脚本能收到
      window.postMessage({
        type: 'EXTENSION_NOTIFICATION_READY',
        version: chrome.runtime.getManifest?.()?.version || 'unknown',
        timestamp: Date.now()
      }, '*');
    });
  } else {
    console.log('文档已加载完成，无需添加监听器');
  }
} else {
  console.log('扩展页面，跳过API设置');
}
