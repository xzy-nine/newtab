/**
 * 新标签页扩展的背景脚本
 * 提供扩展页面访问功能，并显示通知
 */

// 导入合并后的核心模块（Utils现在自动检测环境）
import { Notification, I18n, Utils } from './modules/core/index.js';

/**
 * 外部通知统计信息对象
 * @typedef {Object} ExternalNotificationStats
 * @property {number} totalRequests - 总请求数
 * @property {Map<string, {count: number, types: Object}>} requestsByDomain - 按域名统计的请求
 * @property {Array} recentRequests - 最近的请求记录
 */

// 存储当前新标签页的ID
let currentNewTabId = null;

// 外部通知统计和管理
const externalNotificationStats = {
  totalRequests: 0,
  requestsByDomain: new Map(),
  recentRequests: []
};



// 当扩展安装或更新时运行
chrome.runtime.onInstalled.addListener(() => {
  console.log('新标签页扩展已安装或更新');
  setupExtensionPage();
  // 安装或更新时直接打开新标签页并显示提示
  openNewTabWithNotification();
});

// 当浏览器启动时运行
chrome.runtime.onStartup.addListener(() => {
  console.log('浏览器启动，新标签页扩展正在初始化');
  setupExtensionPage();
});

/**
 * 设置扩展页面
 */
function setupExtensionPage() {
  // 计算扩展页面URL
  const extensionPageUrl = chrome.runtime.getURL('html/newtab.html');
  console.log('可访问的扩展页面URL:', extensionPageUrl);

  // 监听特定消息以返回新标签页内容
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getNewTabContent') {
      // 获取新标签页内容并返回
      fetch(chrome.runtime.getURL('html/newtab.html'))
        .then(response => response.text())
        .then(content => {
          sendResponse({ content: content });
        })
        .catch(error => {
          console.error('获取新标签页内容失败:', error);
          sendResponse({ error: error.message });
        });
      return true; // 保持消息通道开放以进行异步响应
    }
  });
}

/**
 * 打开新标签页并显示通知
 */
function openNewTabWithNotification() {
  const extensionPageUrl = chrome.runtime.getURL('html/newtab.html');
  if (currentNewTabId) {
    chrome.tabs.update(currentNewTabId, { active: true });
    // 发送通知
    setTimeout(async () => {
      let title = '扩展已安装';
      let message = '新标签页扩展安装成功';
      if (I18n && typeof I18n.getMessage === 'function') {
        title = I18n.getMessage('extensionInstalled') || title;
        message = I18n.getMessage('extensionInstalledDesc') || message;
      }
      await addPopupNotification({
        type: 'success',
        title: title,
        message: message,
        showInBadge: true
      });
      chrome.tabs.sendMessage(currentNewTabId, {
        action: 'showMobileInstruction',
        extensionUrl: extensionPageUrl
      }).catch(err => {
        console.log('页面可能尚未准备好接收消息，这是正常的:', err);
      });
    }, 1500);
    return;
  }
  if (currentNewTabId) {
    chrome.tabs.update(currentNewTabId, { active: true });
    // 发送通知
    setTimeout(async () => {
      let title = '扩展已安装';
      let message = '新标签页扩展安装成功';
      if (I18n && typeof I18n.getMessage === 'function') {
        title = I18n.getMessage('extensionInstalled') || title;
        message = I18n.getMessage('extensionInstalledDesc') || message;
      }
      await addPopupNotification({
        type: 'success',
        title: title,
        message: message,
        showInBadge: true
      });
      chrome.tabs.sendMessage(currentNewTabId, {
        action: 'showMobileInstruction',
        extensionUrl: extensionPageUrl
      }).catch(err => {
        console.log('页面可能尚未准备好接收消息，这是正常的:', err);
      });
    }, 1500);
    return;
  }
  chrome.tabs.create({
    url: 'html/newtab.html'
  }, tab => {
    currentNewTabId = tab.id;
    setTimeout(async () => {
  }, tab => {
    currentNewTabId = tab.id;
    setTimeout(async () => {
      let title = '扩展已安装';
      let message = '新标签页扩展安装成功';
      if (I18n && typeof I18n.getMessage === 'function') {
        title = I18n.getMessage('extensionInstalled') || title;
        message = I18n.getMessage('extensionInstalledDesc') || message;
      }
      if (I18n && typeof I18n.getMessage === 'function') {
        title = I18n.getMessage('extensionInstalled') || title;
        message = I18n.getMessage('extensionInstalledDesc') || message;
      }
      await addPopupNotification({
        type: 'success',
        title: title,
        title: title,
        message: message,
        showInBadge: true
      });
      chrome.tabs.sendMessage(tab.id, {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showMobileInstruction',
        extensionUrl: extensionPageUrl
      }).catch(err => {
        console.log('页面可能尚未准备好接收消息，这是正常的:', err);
      });
    }, 1500);
  });
}

// 注册一个消息处理程序，用于通知用户如何访问新标签页
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'howToAccess') {
    const extensionPageUrl = chrome.runtime.getURL('html/newtab.html');
    sendResponse({
      message: `请在您的手机浏览器中访问并保存此链接，然后将其设置为主页或新标签页：${extensionPageUrl}`
    });
    return true;
  }
  
  // 显示URL通知的消息处理程序
  if (request.action === 'showUrlNotification') {
    const extensionPageUrl = chrome.runtime.getURL('html/newtab.html');
    // 不再打开notice.html，而是直接返回URL
    sendResponse({ 
      success: true,
      url: extensionPageUrl
    });
    return true;
  }
});

// 提供扩展页面URL的消息处理程序
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getExtensionPageUrl') {
    sendResponse({
      url: chrome.runtime.getURL('html/newtab.html')
    });
    return true;
  }  // 处理弹出页面通知
  if (request.action === 'addPopupNotification') {
    addPopupNotification(request.notification).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('处理弹出通知失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // 保持消息通道开放以进行异步响应
  }
  
  // 处理通知清除
  if (request.action === 'notificationsCleared') {
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ success: true });
    return true;
  }
});

// 处理来自 content script 的外部通知请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理外部通知请求
  if (request.action === 'showExternalNotification') {
    handleExternalNotification(request.options, sender);
    sendResponse({ success: true });
    return true;
  }
  
  // 处理外部加载指示器请求
  if (request.action === 'showExternalLoading') {
    handleExternalLoading(request.message, sender);
    sendResponse({ success: true });
    return true;
  }
  
  // 处理隐藏外部加载指示器
  if (request.action === 'hideExternalLoading') {
    handleHideExternalLoading(sender);
    sendResponse({ success: true });
    return true;
  }
  
  // 处理更新外部加载进度
  if (request.action === 'updateExternalLoadingProgress') {
    handleUpdateExternalLoadingProgress(request.percent, request.message, sender);
    sendResponse({ success: true });
    return true;
  }
  
  // 处理获取扩展版本请求
  if (request.action === 'getExtensionVersion') {
    sendResponse({ 
      version: chrome.runtime.getManifest().version,
      name: chrome.runtime.getManifest().name 
    });
    return true;
  }
  
  // 处理获取外部通知统计请求
  if (request.action === 'getExternalNotificationStats') {
    sendResponse({
      success: true,
      stats: {
        totalRequests: externalNotificationStats.totalRequests,
        requestsByDomain: Object.fromEntries(externalNotificationStats.requestsByDomain),
        recentRequests: externalNotificationStats.recentRequests.slice(0, 20) // 只返回最近20个
      }
    });
    return true;
  }
  
  // 处理清除外部通知统计
  if (request.action === 'clearExternalNotificationStats') {
    externalNotificationStats.totalRequests = 0;
    externalNotificationStats.requestsByDomain.clear();
    externalNotificationStats.recentRequests = [];
    sendResponse({ success: true });
    return true;
  }
});

/**
 * 处理外部通知请求
 * @param {Object} options 通知选项
 * @param {Object} sender 发送者信息
 */
async function handleExternalNotification(options, sender) {
  try {
    console.log('=== 外部通知请求调试信息 ===');
    console.log('sender.tab:', sender.tab);
    console.log('sender.tab.url:', sender.tab?.url);
    console.log('options:', options);
    
    // 验证来源是否可信
    if (!sender.tab || !sender.tab.url || !isTrustedDomain(sender.tab.url)) {
      console.warn('外部通知请求来源无效或不可信:', sender.tab?.url);
      console.log('isTrustedDomain结果:', isTrustedDomain(sender.tab?.url));
      return;
    }

    const hostname = new URL(sender.tab.url).hostname;
    const notificationType = options.type || 'info';
    
    console.log('通过了域名验证, hostname:', hostname);
    
    // 记录统计信息
    recordExternalNotificationStats(hostname, notificationType);

    // 记录外部通知请求
    console.log('收到外部通知请求:', {
      url: sender.tab.url,
      title: sender.tab.title,
      type: notificationType,
      options: options
    });

    // 验证通知选项
    if (!options.title && !options.message) {
      console.warn('外部通知请求缺少标题和消息');
      return;
    }

    console.log('通过了选项验证，准备发送通知');

    // 添加来源信息到通知
    const enhancedOptions = {
      ...options,
      title: `[${hostname}] ${options.title || '通知'}`,
      showInBadge: options.showInBadge !== false // 外部通知默认显示在徽标中
    };

    console.log('enhancedOptions:', enhancedOptions);    // 直接添加到弹出页面通知
    await addPopupNotification({
      type: notificationType,
      title: enhancedOptions.title,
      message: options.message || '',
      showInBadge: enhancedOptions.showInBadge,
      duration: options.duration,
      source: 'external',
      sourceUrl: sender.tab.url,
      sourceTitle: sender.tab.title,
      domain: hostname
    });    
    console.log('通知已成功添加到弹出页面');

  } catch (error) {
    console.error('处理外部通知请求失败:', error);
  }
}

/**
 * 处理外部加载指示器请求
 * @param {string} message - 加载消息
 * @param {Object} sender - 发送者信息
 * @returns {Promise<void>}
 * @param {string} message - 加载消息
 * @param {Object} sender - 发送者信息
 * @returns {Promise<void>}
 */
async function handleExternalLoading(message, sender) {
  try {
    const hostname = new URL(sender.tab.url).hostname;
    const enhancedMessage = `[${hostname}] ${message}`;
      // 发送加载通知到弹出页面
    await addPopupNotification({
      type: 'info',
      title: '外部加载',
      message: enhancedMessage,
      showInBadge: false, // 加载通知不显示在徽标中
      source: 'external-loading',
      sourceUrl: sender.tab.url
    });

  } catch (error) {
    console.error('处理外部加载请求失败:', error);
  }
}

/**
 * 处理隐藏外部加载指示器请求
 * @param {Object} sender - 发送者信息
 * @returns {Promise<void>}
 * 处理隐藏外部加载指示器请求
 * @param {Object} sender - 发送者信息
 * @returns {Promise<void>}
 */
async function handleHideExternalLoading(sender) {
  try {
    const hostname = new URL(sender.tab.url).hostname;
      // 发送完成通知
    await addPopupNotification({
      type: 'success',
      title: '外部加载完成',
      message: `[${hostname}] 加载完成`,
      showInBadge: false,
      source: 'external-loading-complete',
      sourceUrl: sender.tab.url
    });

  } catch (error) {
    console.error('处理隐藏外部加载请求失败:', error);
  }
}

/**
 * 处理更新外部加载进度请求
 * @param {number} percent - 进度百分比
 * @param {string} message - 进度消息
 * @param {Object} sender - 发送者信息
 * @returns {Promise<void>}
 * 处理更新外部加载进度请求
 * @param {number} percent - 进度百分比
 * @param {string} message - 进度消息
 * @param {Object} sender - 发送者信息
 * @returns {Promise<void>}
 */
async function handleUpdateExternalLoadingProgress(percent, message, sender) {
  try {
    const hostname = new URL(sender.tab.url).hostname;
    const enhancedMessage = `[${hostname}] ${message} (${percent}%)`;
      // 更新进度通知
    await addPopupNotification({
      type: 'info',
      title: '外部加载进度',
      message: enhancedMessage,
      showInBadge: false,
      source: 'external-loading-progress',
      sourceUrl: sender.tab.url
    });

  } catch (error) {
    console.error('处理更新外部加载进度失败:', error);
  }
}

/**
 * 记录外部通知统计信息
 * @param {string} domain - 域名
 * @param {string} type - 通知类型
 * 记录外部通知统计信息
 * @param {string} domain - 域名
 * @param {string} type - 通知类型
 */
function recordExternalNotificationStats(domain, type) {
  externalNotificationStats.totalRequests++;
  
  if (!externalNotificationStats.requestsByDomain.has(domain)) {
    externalNotificationStats.requestsByDomain.set(domain, { count: 0, types: {} });
  }
  
  const domainStats = externalNotificationStats.requestsByDomain.get(domain);
  domainStats.count++;
  domainStats.types[type] = (domainStats.types[type] || 0) + 1;
  
  // 记录最近的请求（最多保留100个）
  externalNotificationStats.recentRequests.unshift({
    domain,
    type,
    timestamp: Date.now()
  });
  
  if (externalNotificationStats.recentRequests.length > 100) {
    externalNotificationStats.recentRequests.pop();
  }
}

/**
 * 添加通知到弹窗页面
 * @param {Object} notification - 通知对象
 * @returns {Promise<void>}
 * 添加通知到弹窗页面
 * @param {Object} notification - 通知对象
 * @returns {Promise<void>}
 */
async function addPopupNotification(notification) {
  try {
    const result = await chrome.storage.local.get(['popupNotifications']);
    const notifications = result.popupNotifications || [];
    
    const newNotification = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      read: false,
      type: 'info',
      showInBadge: notification.showInBadge !== false, // 默认显示在徽标中
      ...notification
    };
    
    notifications.unshift(newNotification);
    
    // 限制通知数量，只保留最新的90条
    if (notifications.length > 90) {
      notifications.splice(90);
    }
    
    await chrome.storage.local.set({ popupNotifications: notifications });
    
    // 更新徽标 - 只计算需要显示在徽标中的未读通知
    const unreadCount = notifications.filter(n => !n.read && n.showInBadge !== false).length;
    if (unreadCount > 0) {
      chrome.action.setBadgeText({
        text: unreadCount > 99 ? '99+' : unreadCount.toString()
      });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
    
  } catch (error) {
    console.error('添加通知失败:', error);
  }
}

/**
 * 校验域名是否可信
 * @param {string} url - 页面URL
 * 校验域名是否可信
 * @param {string} url - 页面URL
 * @returns {boolean} 是否可信
 */
function isTrustedDomain(url) {
  try {
    console.log('检查域名是否可信:', url);
    const hostname = new URL(url).hostname;
    console.log('hostname:', hostname);
    
    // 本地开发环境
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local')) {
      console.log('匹配本地开发环境');
      return true;
    }
    
    // HTTPS页面
    if (url.startsWith('https://')) {
      console.log('匹配HTTPS页面');
      return true;
    }
    
    console.log('未匹配任何信任条件');
    return false;
  } catch (error) {
    console.log('域名检查出错:', error);
    return false;
  }
}

// 错误处理 - 监听未捕获的错误
chrome.runtime.onSuspend.addListener(() => {
  console.log('Service Worker 即将暂停');
});

// 监听扩展错误
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('新标签页扩展首次安装');  } else if (details.reason === 'update') {
    console.log('新标签页扩展已更新到版本:', chrome.runtime.getManifest().version);
      // 发送更新通知
    addPopupNotification({
      type: 'info',
      title: I18n.getMessage('extensionUpdated') || '扩展已更新',
      message: I18n.getMessage('extensionUpdatedDesc', [chrome.runtime.getManifest().version]) || `扩展已更新到版本 ${chrome.runtime.getManifest().version}`,
      showInBadge: true
    });
  }
  
  setupExtensionPage();
  openNewTabWithNotification();
});