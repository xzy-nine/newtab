// 配置常量
const CONFIG = {
  DEFAULT_ENGINE: "https://www.bing.com",
  DEFAULT_ICON: "favicon.ico",
  DEFAULT_IMAGE: "images/bing-daily.jpg",
  BING_API: "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1",
  BING_BASE_URL: "https://cn.bing.com"
};

/**
 * 将Blob转换为base64
 * @param {Blob} blob - 要转换的Blob对象
 * @returns {Promise<string>} base64字符串
 */
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * 获取并缓存必应每日图片
 */
async function getBingDaily() {
  try {
    const response = await fetch(CONFIG.BING_API);
    if (!response.ok) throw new Error('Failed to fetch Bing API');
    
    const data = await response.json();
    if (!data?.images?.[0]?.url) throw new Error('Invalid Bing API response');

    const imageUrl = CONFIG.BING_BASE_URL + data.images[0].url;
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error('Failed to fetch image');

    const blob = await imageResponse.blob();
    const base64data = await blobToBase64(blob);
    await chrome.storage.local.set({ bingDaily: base64data });
  } catch (error) {
    console.error('Error fetching Bing daily image:', error);
  }
}

/**
 * 处理消息事件
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case "getEngine":
      chrome.storage.local.get("engine", data => {
        sendResponse({ engine: data.engine || CONFIG.DEFAULT_ENGINE });
      });
      return true; // 异步响应

    case "setEngine":
      if (message.engine) {
        chrome.storage.local.set({ engine: message.engine })
          .catch(error => console.error('Error saving engine:', error));
      }
      break;

    case "getImage":
      getBingDaily();
      break;

    default:
      console.warn('Unknown message action:', message.action);
  }
});
