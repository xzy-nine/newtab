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
 * 获取网站图标URL - 合并了getIconUrl和getIconForShortcut功能
 * @param {string} url - 网站URL
 * @param {HTMLElement} [element] - 可选的DOM元素，用于直接设置图标
 * @returns {Promise<string>} - 图标的URL或Base64数据
 */
export async function getIconUrl(url, element = null) {
    if (!url) return DEFAULT_ICON;
    
    // 获取域名
    const domain = getDomain(url);
    
    // 检查缓存
    if (iconCache.has(domain)) {
        const iconData = iconCache.get(domain).data;
        if (element) {
            element.style.backgroundImage = `url(${iconData})`;
        }
        return iconData;
    }
    
    // 设置默认图标
    if (element) {
        element.style.backgroundImage = `url(${DEFAULT_ICON})`;
    }

    try {
        // 尝试从浏览器本地存储获取缓存的图标
        const cached = await chrome.storage.local.get(url);
        if (cached[url] && !cached[url].startsWith('data:text/html')) {
            if (element) {
                element.style.backgroundImage = `url(${cached[url]})`;
            }
            await cacheIcon(domain, cached[url]);
            return cached[url];
        }

        // 定义多个可能的图标URL来源
        const iconUrls = [
            `${domain}/favicon.ico`,
            `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
            `https://api.faviconkit.com/${new URL(url).hostname}/64`,
            `https://favicon.yandex.net/favicon/${new URL(url).hostname}`,
            GOOGLE_FAVICON_API + encodeURIComponent(domain)
        ];

        // 尝试从网页HTML中获取图标链接
        try {
            const response = await fetch(url, { 
                mode: 'cors',
                headers: { 'cache-control': 'no-cache' }
            });
            if (response.ok) {
                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const iconLink = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                if (iconLink) {
                    iconUrls.unshift(new URL(iconLink.getAttribute('href'), url).href);
                }
            }
        } catch (error) {
            console.log(`获取HTML页面失败: ${url}`, error);
        }

        // 依次尝试获取每个图标URL的内容
        for (const iconUrl of iconUrls) {
            try {
                const response = await fetch(iconUrl, {
                    mode: 'cors',
                    headers: { 'cache-control': 'no-cache' }
                });

                if (response.ok) {
                    const blob = await response.blob();
                    const base64data = await convertBlobToBase64(blob);
                    
                    // 确保不是文本数据且图片尺寸不小于5x5
                    if (!base64data.startsWith('data:text')) {
                        const img = new Image();
                        try {
                            await new Promise((resolve, reject) => {
                                img.onload = resolve;
                                img.onerror = reject;
                                img.src = base64data;
                            });
                            
                            if (img.width >= 5 && img.height >= 5) {
                                await chrome.storage.local.set({ [url]: base64data });
                                if (element) {
                                    element.style.backgroundImage = `url(${base64data})`;
                                }
                                await cacheIcon(domain, base64data);
                                return base64data;
                            }
                        } catch (imgError) {
                            console.log(`图标检验失败: ${iconUrl}`, imgError);
                        }
                    }
                }
            } catch (error) {
                console.log(`从 ${iconUrl} 获取图标失败:`, error);
            }
        }

        // 如果所有获取图标的尝试都失败，使用默认图标
        await cacheIcon(domain, DEFAULT_ICON);
        return DEFAULT_ICON;

    } catch (error) {
        console.error('Error fetching icon for:', domain, error);
        return DEFAULT_ICON;
    }
}

// 为了兼容性，保留旧的函数名，直接调用新的实现
export async function getIconForShortcut(url, button) {
    return getIconUrl(url, button);
}

/**
 * 将Blob对象转换为Base64字符串 - 从bookmarks.js移植
 * @param {Blob} blob - Blob对象
 * @returns {Promise<string>} Base64字符串
 */
export async function convertBlobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
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
 * 处理图标加载错误并清理相关缓存
 * @param {HTMLImageElement} img - 图像元素
 * @param {string} [fallbackIcon=DEFAULT_ICON] - 备用图标路径
 */
export async function handleIconError(img, fallbackIcon = DEFAULT_ICON) {
    // 设置默认图标
    img.src = fallbackIcon;
    
    // 如果有原始URL，从缓存中移除失败的图标
    const originalUrl = img.dataset.originalUrl;
    if (originalUrl) {
        const domain = getDomain(originalUrl);
        if (iconCache.has(domain)) {
            iconCache.delete(domain);
            
            // 从浏览器存储中也移除该图标
            try {
                await chrome.storage.local.remove(originalUrl);
                console.log(`已从缓存中移除失效图标: ${domain}`);
                
                // 保存更新后的缓存
                await saveIconCache();
            } catch (error) {
                console.error('清除失效图标缓存时出错:', error);
            }
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
 * @param {string} url - 网站URL或图标URL
 * @param {number} [size=16] - 图标大小
 * @param {boolean} [isDirectUrl=false] - 是否直接提供的是图标URL而非网站URL
 * @returns {Promise<string>} - 图标的数据URL
 */
export async function generateIconDataUrl(url, size = 16, isDirectUrl = false) {
    try {
        // 如果不是直接提供的图标URL，则获取网站的图标URL
        const iconUrl = isDirectUrl ? url : await getIconUrl(url);
        
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
        try {
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
            return generateDefaultIconDataUrl(url, size);
        }
    } catch (error) {
        console.error('Error generating icon data URL:', error);
        return generateDefaultIconDataUrl(url, size);
    }
}

/**
 * 生成默认图标的数据URL
 * @param {string} url - 网站URL
 * @param {number} size - 图标大小
 * @returns {string} - 数据URL
 */
function generateDefaultIconDataUrl(url, size) {
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

/**
 * 自定义图标
 * @param {string} url - 网站URL
 * @param {string} base64Image - Base64格式的图标数据
 * @returns {Promise<void>}
 */
export async function setCustomIcon(url, base64Image) {
    await chrome.storage.local.set({ [url]: base64Image });
    const domain = getDomain(url);
    await cacheIcon(domain, base64Image);
}

/**
 * 重置图标为默认
 * @param {string} url - 网站URL
 * @returns {Promise<void>}
 */
export async function resetIcon(url) {
    await chrome.storage.local.remove(url);
    const domain = getDomain(url);
    if (iconCache.has(domain)) {
        iconCache.delete(domain);
    }
}