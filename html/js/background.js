// 移除以下导入语句

// 改为内联实现这些函数
/**
 * 从URL获取数据并解析为JSON
 * @param {string} url - 请求的URL
 * @returns {Promise<Object>} - 解析后的JSON对象
 */
async function fetchData(url) {
    try {
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch data from', url, error);
        throw error;
    }
}

/**
 * 将Blob对象转换为base64字符串
 * @param {Blob} blob - 需要转换的Blob对象
 * @returns {Promise<string>} - 转换后的base64字符串
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

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
  DEFAULT_ENGINE: {
    baseUrl: "https://www.bing.com/search",
    searchParam: "q"
  },
  DEFAULT_ICON: "favicon.png",
  BING_API: "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1",
  BING_BASE_URL: "https://cn.bing.com"
};

const CACHE_KEY = 'bingImageCache';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

// 添加export关键字导出fetchBingImage函数
export async function fetchBingImage() {
    const cachedData = await chrome.storage.local.get(CACHE_KEY);
    const now = Date.now();

    if (cachedData[CACHE_KEY] && (now - cachedData[CACHE_KEY].timestamp < CACHE_EXPIRATION)) {
        return cachedData[CACHE_KEY].imageUrl;
    }

    const data = await fetchData('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');
    const imageUrl = `https://www.bing.com${data.images[0].url}`;

    await chrome.storage.local.set({ [CACHE_KEY]: { imageUrl, timestamp: now } });

    return imageUrl;
}

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

