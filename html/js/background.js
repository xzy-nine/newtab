/**
 * 新标签页扩展的背景脚本
 * 提供扩展页面访问功能，并显示通知
 */

// 注意：Service Worker环境不支持ES模块语法
// 直接使用Chrome扩展API，不导入模块

/**
 * 外部通知统计信息对象
 * @typedef {Object} ExternalNotificationStats
 * @property {number} totalRequests - 总请求数
 * @property {Map<string, {count: number, types: Object}>} requestsByDomain - 按域名统计的请求
 * @property {Array} recentRequests - 最近的请求记录
 */

// 存储当前新标签页的ID
let currentNewTabId = null;




// 当扩展安装或更新时运行
chrome.runtime.onInstalled.addListener(() => {
  console.log('新标签页扩展已安装或更新');
  setupExtensionPage();
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
      let title = '扩展已安装';
      let message = '新标签页扩展安装成功';
      await addPopupNotification({
        type: 'success',
        title: title,
        message: message,
        showInBadge: true
      });
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

/**
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
      title: '扩展已更新',
      message: `扩展已更新到版本 ${chrome.runtime.getManifest().version}`,
      showInBadge: true
    });
  }
  
  setupExtensionPage();
});