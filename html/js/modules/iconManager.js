/**
 * 图标管理模块 - 处理网站图标的获取和缓存
 */

import { getDomain } from './utils.js';

// 图标缓存对象
const iconCache = new Map();
// 添加尺寸相关的缓存对象
const iconSizeCache = new Map();

// 默认图标URL
const DEFAULT_ICON = 'images/default_favicon.png';

// 尺寸缓存大小限制
const SIZE_CACHE_LIMIT = 300;

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
            
            Object.keys(cachedIcons).forEach(url => {
                iconCache.set(url, {
                    data: cachedIcons[url].data,
                    timestamp: cachedIcons[url].timestamp
                });
            });
        }
    } catch (error) {
    }
}

/**
 * 保存图标缓存到存储
 * @returns {Promise<void>}
 */
async function saveIconCache() {
    try {
        const cacheObject = {};
        iconCache.forEach((value, key) => {
            cacheObject[key] = {
                data: value.data,
                timestamp: value.timestamp
            };
        });
        
        await chrome.storage.local.set({ iconCache: JSON.stringify(cacheObject) });
    } catch (error) {
    }
}

/**
 * 清理过期的图标缓存
 * @returns {Promise<void>}
 */
function cleanupSizeCache() {
    if (iconSizeCache.size > SIZE_CACHE_LIMIT) {
        // 删除最旧的缓存项
        const keysToRemove = [...iconSizeCache.keys()].slice(0, Math.floor(SIZE_CACHE_LIMIT / 3));
        keysToRemove.forEach(key => iconSizeCache.delete(key));
    }
}

// 将原有的 cleanupIconCache 函数扩展为同时清理尺寸缓存
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
    
    // 同时清理尺寸缓存
    cleanupSizeCache();
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

        // 针对常见搜索引擎的特殊处理
        const searchEngines = {
            'www.google.com': 'https://www.google.com/favicon.ico',
            'www.bing.com': 'https://www.bing.com/favicon.ico',
            'www.baidu.com': 'https://www.baidu.com/favicon.ico',
            'duckduckgo.com': 'https://duckduckgo.com/favicon.ico',
            'search.yahoo.com': 'https://search.yahoo.com/favicon.ico',
            'yandex.com': 'https://yandex.com/favicon.ico',
            'www.sogou.com': 'https://www.sogou.com/favicon.ico',
            '360.cn': 'https://360.cn/favicon.ico',
            'www.so.com': 'https://www.so.com/favicon.ico'
        };
        
        if (searchEngines[domain]) {
            try {
                const response = await fetch(searchEngines[domain], { 
                    mode: 'no-cors',
                    cache: 'no-store'
                });
                
                if (response.ok || response.type === 'opaque') {
                    const blob = await response.blob();
                    const base64data = await convertBlobToBase64(blob);
                    
                    if (!base64data.startsWith('data:text')) {
                        await chrome.storage.local.set({ [url]: base64data });
                        if (element) {
                            element.style.backgroundImage = `url(${base64data})`;
                        }
                        await cacheIcon(domain, base64data);
                        return base64data;
                    }
                }
            } catch (error) {
                // 移除console.log
            }
        }

        // 定义多个可能的图标URL来源
        const iconUrls = [
            `${domain}/favicon.ico`,
            `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
            `https://api.faviconkit.com/${new URL(url).hostname}/64`,
            `https://favicon.yandex.net/favicon/${new URL(url).hostname}`,
            GOOGLE_FAVICON_API + encodeURIComponent(domain)
        ];

        // 添加常用 CDN 作为备选
        iconUrls.push(`https://cdn.staticfile.org/favicon/${domain}.ico`);
        iconUrls.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);

        // 尝试从网页HTML中获取图标链接
        try {
            const controller = new AbortController();
            // 设置超时，避免长时间等待
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(url, { 
                mode: 'cors',
                headers: { 'cache-control': 'no-cache' },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                
                // 更全面地查找各种可能的图标链接
                const iconSelectors = [
                    'link[rel="icon"]', 
                    'link[rel="shortcut icon"]',
                    'link[rel="apple-touch-icon"]',
                    'link[rel="apple-touch-icon-precomposed"]',
                    'meta[name="msapplication-TileImage"]'
                ];
                
                for (const selector of iconSelectors) {
                    const iconLink = doc.querySelector(selector);
                    if (iconLink) {
                        const iconHref = selector.includes('meta') ? 
                            iconLink.getAttribute('content') : 
                            iconLink.getAttribute('href');
                            
                        if (iconHref && !iconHref.startsWith('data:')) {
                            iconUrls.unshift(new URL(iconHref, url).href);
                        }
                    }
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
                    headers: { 'cache-control': 'no-cache' },
                    // 添加超时处理
                    signal: AbortSignal.timeout(3000)
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

        // 生成基于域名的替代图标
        const fallbackIcon = await generateInitialBasedIcon(domain);
        await cacheIcon(domain, fallbackIcon);
        if (element) {
            element.style.backgroundImage = `url(${fallbackIcon})`;
        }
        return fallbackIcon;

    } catch (error) {
        console.error('Error fetching icon for:', domain, error);
        return DEFAULT_ICON;
    }
}

/**
 * 生成基于域名首字母的替代图标
 * @param {string} domain - 网站域名
 * @returns {Promise<string>} - 生成的图标数据URL
 */
async function generateInitialBasedIcon(domain) {
    // 提取域名中的首个非www部分作为标识
    const domainParts = domain.split('.');
    const siteName = domainParts[0] === 'www' && domainParts.length > 1 ? 
        domainParts[1] : domainParts[0];
    
    const initial = siteName.charAt(0).toUpperCase();
    
    // 生成随机但确定的颜色（基于域名）
    const getColorCode = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const mainColor = `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
        return mainColor;
    };
    
    const bgColor = getColorCode(domain);
    
    // 创建canvas并绘制
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // 绘制圆形背景
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制文本
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 32, 32);
    
    return canvas.toDataURL('image/png');
}

/**
 * 获取快捷方式的图标 - getIconUrl的别名，用于保持代码兼容性
 * @param {string} url - 网站URL
 * @param {HTMLElement} element - 要设置图标的DOM元素
 * @returns {Promise<string>} - 图标的URL或Base64数据
 */
export async function getIconForShortcut(url, element) {
    return getIconUrl(url, element);
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
 * 预加载图标 - 优化版本
 * @param {string[]} urls - 需要预加载图标的URL数组
 * @param {boolean} [highPriority=false] - 是否为高优先级
 * @returns {Promise<void>}
 */
export async function preloadIcons(urls, highPriority = false) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    
    // 先过滤掉已缓存的URL，减少不必要的请求
    const uncachedUrls = urls.filter(url => {
        const domain = getDomain(url);
        return !iconCache.has(domain);
    });
    
    if (uncachedUrls.length === 0) return;
    
    // 高优先级任务立即执行，低优先级任务延迟执行
    if (highPriority) {
        // 立即并行获取所有图标(数量较少的高优先级图标)
        await Promise.allSettled(uncachedUrls.map(url => getIconUrl(url)));
    } else {
        // 批量处理普通预加载请求
        const batchSize = 3;
        for (let i = 0; i < uncachedUrls.length; i += batchSize) {
            const batch = uncachedUrls.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(url => getIconUrl(url)));
            
            // 每批次后稍微延迟，避免过度占用资源
            if (i + batchSize < uncachedUrls.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
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
    img.src = fallbackIcon;
    
    const originalUrl = img.dataset.originalUrl;
    if (originalUrl) {
        const domain = getDomain(originalUrl);
        if (iconCache.has(domain)) {
            iconCache.delete(domain);
            
            try {
                await chrome.storage.local.remove(originalUrl);
                await saveIconCache();
            } catch (error) {
                // 移除console.error
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
        // 使用CSS过渡效果
        const originalOpacity = img.style.opacity || '1';
        
        // 保存原始URL以便错误处理
        img.dataset.originalUrl = url;
        
        // 避免多次请求相同URL
        if (img.dataset.processingUrl === url) {
            return;
        }
        
        img.dataset.processingUrl = url;
        
        // 设置错误处理
        img.onerror = () => handleIconError(img);
        
        // 先检查内存缓存，减少等待感
        const domain = getDomain(url);
        if (iconCache.has(domain)) {
            img.style.opacity = '0.7';  // 淡入淡出效果
            img.src = iconCache.get(domain).data;
            setTimeout(() => { img.style.opacity = originalOpacity; }, 50);
        } else {
            // 设置淡入效果
            if (img.src) img.style.opacity = '0.7'; 
            
            // 获取图标URL
            const iconUrl = await getIconUrl(url);
            
            // 确保图像元素仍在页面上并且URL没有被更改
            if (img.isConnected && img.dataset.processingUrl === url) {
                img.src = iconUrl;
                // 图片加载完成后恢复透明度
                setTimeout(() => { img.style.opacity = originalOpacity; }, 50);
            }
        }
        
        // 请求完成，删除处理标记
        delete img.dataset.processingUrl;
    } catch (error) {
        console.error('设置图标时出错:', error);
        img.src = DEFAULT_ICON;
        delete img.dataset.processingUrl;
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
    // 生成缓存键
    const cacheKey = `${url}_${size}`;
    
    // 检查是否已有相同尺寸的缓存
    if (iconSizeCache.has(cacheKey)) {
        return iconSizeCache.get(cacheKey);
    }
    
    try {
        // 如果不是直接提供的图标URL，则获取网站的图标URL
        const iconUrl = isDirectUrl ? url : await getIconUrl(url);
        
        // 如果已经是数据URL则直接返回
        if (iconUrl.startsWith('data:')) {
            // 缓存结果
            iconSizeCache.set(cacheKey, iconUrl);
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
                
                // 添加超时处理
                const timeout = setTimeout(() => reject(new Error('Icon load timeout')), 3000);
                
                img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                
                img.src = iconUrl;
            });
            
            // 绘制到canvas
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, size, size);
            
            // 转换为数据URL
            const dataUrl = canvas.toDataURL('image/png', 0.9);
            
            // 缓存结果
            iconSizeCache.set(cacheKey, dataUrl);
            return dataUrl;
        } catch (error) {
            const fallbackIcon = generateDefaultIconDataUrl(url, size);
            // 缓存结果
            iconSizeCache.set(cacheKey, fallbackIcon);
            return fallbackIcon;
        }
    } catch (error) {
        console.error('Error generating icon data URL:', error);
        const fallbackIcon = generateDefaultIconDataUrl(url, size);
        // 缓存结果
        iconSizeCache.set(cacheKey, fallbackIcon);
        return fallbackIcon;
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