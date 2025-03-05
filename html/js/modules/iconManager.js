/**
 * 图标管理模块 - 处理网站图标的获取和缓存
 */

import { getDomain } from './utils.js';

// 图标缓存对象
const iconCache = new Map();

// 默认图标URL
const DEFAULT_ICON = 'images/default_favicon.png';

// Google Favicon API
const GOOGLE_FAVICON_API = 'https://www.google.com/s2/favicons?domain=';

/**
 * 初始化图标管理器
 * @returns {Promise<void>}
 */
export async function initIconManager() {
    // 从存储中加载缓存的图标
    await loadIconCache();
}

/**
 * 从存储中加载缓存的图标
 * @returns {Promise<void>}
 */
async function loadIconCache() {
    try {
        const result = await chrome.storage.local.get('iconCache');
        if (result.iconCache) {
            const cachedIcons = JSON.parse(result.iconCache);
            
            // 将缓存的图标数据转换为Map
            Object.keys(cachedIcons).forEach(url => {
                iconCache.set(url, {
                    data: cachedIcons[url].data,
                    timestamp: cachedIcons[url].timestamp
                });
            });
        }
    } catch (error) {
        console.error('Failed to load icon cache:', error);
    }
}

/**
 * 保存图标缓存到存储
 * @returns {Promise<void>}
 */
async function saveIconCache() {
    try {
        // 将Map转换为对象以便存储
        const cacheObject = {};
        iconCache.forEach((value, key) => {
            cacheObject[key] = {
                data: value.data,
                timestamp: value.timestamp
            };
        });
        
        await chrome.storage.local.set({ iconCache: JSON.stringify(cacheObject) });
    } catch (error) {
        console.error('Failed to save icon cache:', error);
    }
}

/**
 * 清理过期的图标缓存
 * @returns {Promise<void>}
 */
export async function cleanupIconCache() {
    const now = Date.now();
    const expirationTime = 7 * 24 * 60 * 60 * 1000; // 7天过期时间
    
    let hasChanges = false;
    
    iconCache.forEach((value, key) => {
        if (now - value.timestamp > expirationTime) {
            iconCache.delete(key);
            hasChanges = true;
        }
    });
    
    if (hasChanges) {
        await saveIconCache();
    }
}

/**
 * 获取网站图标URL
 * @param {string} url - 网站URL
 * @returns {Promise<string>} - 图标的URL或Base64数据
 */
export async function getIconUrl(url) {
    if (!url) return DEFAULT_ICON;
    
    // 获取域名
    const domain = getDomain(url);
    
    // 检查缓存
    if (iconCache.has(domain)) {
        return iconCache.get(domain).data;
    }
    
    // 尝试从不同来源获取图标
    try {
        // 首先尝试从网站直接获取favicon
        const directIcon = await tryGetDirectFavicon(domain);
        if (directIcon) {
            await cacheIcon(domain, directIcon);
            return directIcon;
        }
        
        // 如果直接获取失败，使用Google的favicon服务
        const googleIcon = GOOGLE_FAVICON_API + encodeURIComponent(domain);
        await cacheIcon(domain, googleIcon);
        return googleIcon;
    } catch (error) {
        console.error('Error fetching icon for:', domain, error);
        return DEFAULT_ICON;
    }
}

/**
 * 尝试直接从网站获取favicon
 * @param {string} domain - 网站域名
 * @returns {Promise<string|null>} - 图标URL或null
 */
async function tryGetDirectFavicon(domain) {
    try {
        const iconUrl = `${domain}/favicon.ico`;
        
        // 检查图标是否存在且可访问
        const response = await fetch(iconUrl, { method: 'HEAD' });
        if (response.ok) {
            return iconUrl;
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * 缓存图标数据
 * @param {string} domain - 网站域名
 * @param {string} iconData - 图标URL或Base64数据
 * @returns {Promise<void>}
 */
async function cacheIcon(domain, iconData) {
    iconCache.set(domain, {
        data: iconData,
        timestamp: Date.now()
    });
    
    // 定期保存缓存（每10个新图标保存一次）
    if (iconCache.size % 10 === 0) {
        await saveIconCache();
    }
}

/**
 * 预加载图标
 * @param {string[]} urls - 需要预加载图标的URL数组
 * @returns {Promise<void>}
 */
export async function preloadIcons(urls) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    
    // 创建任务队列，批量处理
    const tasks = urls.map(url => {
        const domain = getDomain(url);
        if (!iconCache.has(domain)) {
            return getIconUrl(url);
        }
        return Promise.resolve();
    });
    
    // 并发执行，但限制并发数为5
    const batchSize = 5;
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        await Promise.all(batch);
    }
    
    // 保存全部缓存
    await saveIconCache();
}

/**
 * 处理图标加载错误
 * @param {HTMLImageElement} img - 图像元素
 */
export function handleIconError(img) {
    img.src = DEFAULT_ICON;
    
    // 如果有原始URL，从缓存中移除失败的图标
    const originalUrl = img.dataset.originalUrl;
    if (originalUrl) {
        const domain = getDomain(originalUrl);
        if (iconCache.has(domain)) {
            iconCache.delete(domain);
        }
    }
}

/**
 * 设置图标元素的来源
 * @param {HTMLImageElement} img - 图像元素
 * @param {string} url - 网站URL
 * @returns {Promise<void>}
 */
export async function setIconForElement(img, url) {
    if (!img || !url) return;
    
    try {
        // 保存原始URL以便错误处理
        img.dataset.originalUrl = url;
        
        // 设置错误处理
        img.onerror = () => handleIconError(img);
        
        // 获取图标URL
        const iconUrl = await getIconUrl(url);
        img.src = iconUrl;
    } catch (error) {
        img.src = DEFAULT_ICON;
    }
}

/**
 * 生成网站图标的数据URL
 * @param {string} url - 网站URL
 * @param {number} [size=16] - 图标大小
 * @returns {Promise<string>} - 图标的数据URL
 */
export async function generateIconDataUrl(url, size = 16) {
    const iconUrl = await getIconUrl(url);
    
    try {
        // 如果已经是数据URL则直接返回
        if (iconUrl.startsWith('data:')) {
            return iconUrl;
        }
        
        // 创建一个canvas来处理图标
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // 加载图标
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.crossOrigin = 'anonymous'; // 处理跨域问题
            img.src = iconUrl;
        });
        
        // 绘制到canvas
        ctx.drawImage(img, 0, 0, size, size);
        
        // 转换为数据URL
        return canvas.toDataURL('image/png');
    } catch (error) {
        console.error('Error generating icon data URL:', error);
        
        // 创建一个默认图标
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // 绘制简单的默认图标
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#A0A0A0';
        ctx.font = `${Math.floor(size/2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(url.charAt(0).toUpperCase(), size/2, size/2);
        
        return canvas.toDataURL('image/png');
    }
}

/**
 * 获取缓存中的所有图标
 * @returns {Object} - 包含图标数据的对象
 */
export function getAllCachedIcons() {
    const result = {};
    iconCache.forEach((value, key) => {
        result[key] = value.data;
    });
    return result;
}