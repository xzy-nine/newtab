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


self.addEventListener('install', (event) => {
  console.log('Service Worker 安装');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 激活');
});

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