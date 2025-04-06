import { fetchData } from './modules/utils.js';

self.addEventListener('install', (event) => {
  console.log('Service Worker 安装');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 激活');
});

const CACHE_KEY = 'bingImageCache';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * 获取必应每日图片
 * @returns {Promise<string>} - 图片URL
 */
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