// 基础配置常量对象
// 包含默认搜索引擎、图标、图片路径和必应API相关配置
const CONFIG = {
  DEFAULT_ENGINE: "https://www.bing.com",     // 默认搜索引擎URL
  DEFAULT_ICON: "favicon.ico",                // 默认图标文件
  DEFAULT_IMAGE: "images/bing-daily.jpg",     // 默认背景图片路径
  BING_API: "https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1", // 必应每日图片API
  BING_BASE_URL: "https://cn.bing.com"       // 必应基础URL
};

/**
 * 将Blob对象转换为base64字符串的工具函数
 * @param {Blob} blob - 需要转换的Blob对象（通常是图片数据）
 * @returns {Promise<string>} 返回一个Promise，解析为base64编码的字符串
 */
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();                    // 创建文件读取器实例
    reader.onloadend = () => resolve(reader.result);    // 读取完成时返回结果
    reader.onerror = reject;                           // 读取错误时返回错误信息
    reader.readAsDataURL(blob);                        // 开始读取blob并转换为Data URL
  });
};

/**
 * 获取必应每日图片并存储到本地
 * 包含以下步骤：
 * 1. 从必应API获取图片信息
 * 2. 下载实际图片
 * 3. 转换为base64格式
 * 4. 存储到Chrome本地存储
 */
async function getBingDaily() {
  try {
    // 获取必应API响应
    const response = await fetch(CONFIG.BING_API);
    if (!response.ok) throw new Error('Failed to fetch Bing API');
    
    // 解析API响应数据
    const data = await response.json();
    if (!data?.images?.[0]?.url) throw new Error('Invalid Bing API response');

    // 构建完整的图片URL并获取图片
    const imageUrl = CONFIG.BING_BASE_URL + data.images[0].url;
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error('Failed to fetch image');

    // 将图片转换为blob，然后转为base64
    const blob = await imageResponse.blob();
    const base64data = await blobToBase64(blob);
    // 将base64数据存储到Chrome本地存储
    await chrome.storage.local.set({ bingDaily: base64data });
  } catch (error) {
    console.error('Error fetching Bing daily image:', error);
  }
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

    case "getImage":
      // 触发获取新的必应每日图片
      getBingDaily();
      break;

    default:
      // 处理未知的消息类型
      console.warn('Unknown message action:', message.action);
  }
});
