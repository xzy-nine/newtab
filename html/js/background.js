self.addEventListener('install', (event) => {
  console.log('Service Worker 安装');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 激活');
});

/**
 * 获取必应每日图片并存储到本地
 * 包含以下步骤：
 * 1. 检查现有图片是否在12小时内
 * 2. 从必应API获取图片信息
 * 3. 下载实际图片
 * 4. 转换为base64格式
 * 5. 存储到Chrome本地存储
 */
async function getBingDaily() {
  try {
    // 检查是否存在未过期的图片
    const data = await chrome.storage.local.get(['bingDaily', 'bingDailyTimestamp']);
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (data.bingDaily && data.bingDailyTimestamp && 
        (now - data.bingDailyTimestamp) < twelveHours) {
      const timeLeft = twelveHours - (now - data.bingDailyTimestamp);
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      console.log(`使用缓存的必应每日图片,还有${hoursLeft}小时${minutesLeft}分钟过期`);
      return;
    }

    console.log("正在获取必应每日图片...");
    const response = await fetch(CONFIG.BING_API);
    if (!response.ok) throw new Error(`获取必应API失败: ${response.status}`);
    
    const bingData = await response.json();
    if (!bingData?.images?.[0]?.url) throw new Error('无效的必应API响应');

    const imageUrl = CONFIG.BING_BASE_URL + bingData.images[0].url;
    console.log("必应每日图片URL:", imageUrl);
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error('获取图片失败');

    const blob = await imageResponse.blob();
    const base64data = await blobToBase64(blob);
    console.log("必应每日图片base64是否生成:", !!base64data);
    await chrome.storage.local.set({ bingDaily: base64data, bingDailyTimestamp: now })
      .catch(error => console.error('Error saving to local storage:', error));
  } catch (error) {
    console.error('获取必应每日图片时出错:', error);
  }
}

// 基础配置常量对象
// 包含默认搜索引擎、图标、图片路径和必应API相关配置
const CONFIG = {
  DEFAULT_ENGINE: "https://www.bing.com",     // 默认搜索引擎URL
  DEFAULT_ICON: "favicon.png",                // 默认图标文件
  BING_API: "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1", // 必应每日图片API
  BING_BASE_URL: "https://cn.bing.com" // 必应基础URL
};

/**
 * Chrome扩展消息监听器
 * 处理来自扩展其他部分的消息请求
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getEngine":
      // 获取当前搜索引擎设置，如果未设置则使用默认值
      chrome.storage.local.get("engine", data => {
        sendResponse({ engine: data.engine || CONFIG.DEFAULT_ENGINE });
      });
      return true; // 返回true表示将异步发送响应

    case "setEngine":
      // 保存新的搜索引擎设置
      if (message.engine) {
        chrome.storage.local.set({ engine: message.engine })
          .catch(error => console.error('Error saving engine:', error));
      }
      break;

    case "getWallpaper":
      // 获取必应每日图片并存储到本地
      (async () => {
        try {
          await getBingDaily();
          sendResponse({ status: "success" });
        } catch (error) {
          sendResponse({ status: "error", message: error.message });
        }
      })();
      return true; // 返回true表示将异步发送响应

  }
});

/**
 * 将Blob对象转换为base64字符串的工具函数
 * @param {Blob} blob - 需要转换的Blob对象（通常是图片数据）
 * @returns {Promise<string>} 返回一个Promise，解析为base64编码的字符串
 */
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); // 创建文件读取器实例
    reader.onloadend = () => resolve(reader.result); // 读取完成时返回结果
    reader.onerror = reject; // 读取错误时返回错误信息
    reader.readAsDataURL(blob); // 开始读取blob并转换为Data URL
  });
};

