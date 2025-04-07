/**
 * 图标管理模块 - 处理网站图标的获取和缓存
 */

import { getDomain } from './utils.js';

// 核心数据结构
const iconCache = new Map();
const iconSizeCache = new Map();
const DEFAULT_ICON = 'images/default_favicon.png';
const SIZE_CACHE_LIMIT = 300;

/**
 * 初始化图标管理器
 */
export async function initIconManager() {
    await loadIconCache();
}

/**
 * 从存储中加载缓存的图标
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
    } catch (error) {}
}

/**
 * 保存图标缓存到存储
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
    } catch (error) {}
}

/**
 * 清理缓存
 */
export async function cleanupIconCache() {
    // 清理过期图标
    const now = Date.now();
    const expirationTime = 7 * 24 * 60 * 60 * 1000; 
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
    
    // 清理尺寸缓存
    if (iconSizeCache.size > SIZE_CACHE_LIMIT) {
        const keysToRemove = [...iconSizeCache.keys()].slice(0, Math.floor(SIZE_CACHE_LIMIT / 3));
        keysToRemove.forEach(key => iconSizeCache.delete(key));
    }
}

/**
 * 将Blob对象转换为Base64字符串
 */
export function convertBlobToBase64(blob) {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

/**
 * 缓存图标数据
 */
async function cacheIcon(domain, iconData) {
    iconCache.set(domain, {
        data: iconData,
        timestamp: Date.now()
    });
    
    if (iconCache.size % 10 === 0) {
        await saveIconCache();
    }
}

/**
 * 从指定URL获取图标
 */
async function fetchIcon(iconUrl, siteUrl, element = null) {
    try {
        const response = await fetch(iconUrl, {
            mode: 'cors',
            headers: { 'cache-control': 'no-cache' },
            signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
            const blob = await response.blob();
            const base64data = await convertBlobToBase64(blob);
            
            if (!base64data.startsWith('data:text')) {
                const img = new Image();
                try {
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = base64data;
                    });
                    
                    if (img.width >= 5 && img.height >= 5) {
                        const domain = getDomain(siteUrl);
                        await chrome.storage.local.set({ [siteUrl]: base64data });
                        if (element) {
                            element.style.backgroundImage = `url(${base64data})`;
                        }
                        await cacheIcon(domain, base64data);
                        return base64data;
                    }
                } catch (imgError) {
                    return null;
                }
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

/**
 * 生成基于域名首字母的替代图标
 */
async function generateInitialBasedIcon(domain) {
    const domainParts = domain.split('.');
    const siteName = domainParts[0] === 'www' && domainParts.length > 1 ? 
        domainParts[1] : domainParts[0];
    
    const initial = siteName.charAt(0).toUpperCase();
    
    const getColorCode = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
    };
    
    const bgColor = getColorCode(domain);
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, 32, 32);
    
    return canvas.toDataURL('image/png');
}

/**
 * 获取网站图标URL
 */
export async function getIconUrl(url, element = null) {
    if (!url) return DEFAULT_ICON;
    
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
        // 查找本地存储缓存
        const cached = await chrome.storage.local.get(url);
        if (cached[url] && !cached[url].startsWith('data:text/html')) {
            if (element) {
                element.style.backgroundImage = `url(${cached[url]})`;
            }
            await cacheIcon(domain, cached[url]);
            return cached[url];
        }

        // 定义多个图标URL来源
        const iconUrls = [
            `${domain}/favicon.ico`,
            `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
            `https://api.faviconkit.com/${new URL(url).hostname}/64`,
            `https://favicon.yandex.net/favicon/${new URL(url).hostname}`,
            `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}`,
            `https://cdn.staticfile.org/favicon/${domain}.ico`,
            `https://icons.duckduckgo.com/ip3/${domain}.ico`
        ];

        // 尝试获取HTML和图标URLs
        try {
            // 获取HTML可能包含的图标链接
            const htmlPromise = (async () => {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    
                    const response = await fetch(url, { 
                        mode: 'cors',
                        headers: { 'cache-control': 'no-cache' },
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) return [];
                    
                    const text = await response.text();
                    const doc = new DOMParser().parseFromString(text, 'text/html');
                    
                    // 查找各种可能的图标链接
                    const iconSelectors = [
                        'link[rel="icon"]', 
                        'link[rel="shortcut icon"]',
                        'link[rel="apple-touch-icon"]',
                        'link[rel="apple-touch-icon-precomposed"]',
                        'meta[name="msapplication-TileImage"]'
                    ];
                    
                    const additionalUrls = [];
                    for (const selector of iconSelectors) {
                        const iconLink = doc.querySelector(selector);
                        if (iconLink) {
                            const iconHref = selector.includes('meta') ? 
                                iconLink.getAttribute('content') : 
                                iconLink.getAttribute('href');
                                
                            if (iconHref && !iconHref.startsWith('data:')) {
                                additionalUrls.push(new URL(iconHref, url).href);
                            }
                        }
                    }
                    return additionalUrls;
                } catch (error) {
                    return [];
                }
            })();

            // 获取额外的图标链接并添加到列表前
            const additionalUrls = await htmlPromise || [];
            iconUrls.unshift(...additionalUrls);

            // 并行获取前5个图标
            const fetchPromises = iconUrls.slice(0, 5).map(iconUrl => 
                fetchIcon(iconUrl, url, element)
            );

            // 获取第一个成功的结果
            const result = await Promise.any(fetchPromises)
                .catch(async () => {
                    // 如果前5个失败，尝试剩余URL
                    for (let i = 5; i < iconUrls.length; i++) {
                        try {
                            const result = await fetchIcon(iconUrls[i], url, element);
                            if (result) return result;
                        } catch (e) {}
                    }
                    return null;
                });

            if (result) return result;
        
            // 生成基于域名的替代图标
            const fallbackIcon = await generateInitialBasedIcon(domain);
            await cacheIcon(domain, fallbackIcon);
            if (element) {
                element.style.backgroundImage = `url(${fallbackIcon})`;
            }
            return fallbackIcon;

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
        return DEFAULT_ICON;
    }
}

/**
 * 兼容别名
 */
export const getIconForShortcut = getIconUrl;

/**
 * 处理图标加载错误
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
            } catch (error) {}
        }
    }
}

/**
 * 设置图标元素的来源
 */
export async function setIconForElement(img, url) {
    if (!img || !url) return;
    
    try {
        const originalOpacity = img.style.opacity || '1';
        
        img.dataset.originalUrl = url;
        
        if (img.dataset.processingUrl === url) return;
        img.dataset.processingUrl = url;
        
        img.onerror = () => handleIconError(img);
        
        const domain = getDomain(url);
        if (iconCache.has(domain)) {
            img.style.opacity = '0.7';
            img.src = iconCache.get(domain).data;
            setTimeout(() => { img.style.opacity = originalOpacity; }, 50);
        } else {
            if (img.src) img.style.opacity = '0.7'; 
            
            const iconUrl = await getIconUrl(url);
            
            if (img.isConnected && img.dataset.processingUrl === url) {
                img.src = iconUrl;
                setTimeout(() => { img.style.opacity = originalOpacity; }, 50);
            }
        }
        
        delete img.dataset.processingUrl;
    } catch (error) {
        img.src = DEFAULT_ICON;
        delete img.dataset.processingUrl;
    }
}

/**
 * 生成图标数据URL
 */
export async function generateIconDataUrl(url, size = 16, isDirectUrl = false) {
    const cacheKey = `${url}_${size}`;
    
    if (iconSizeCache.has(cacheKey)) {
        return iconSizeCache.get(cacheKey);
    }
    
    try {
        const iconUrl = isDirectUrl ? url : await getIconUrl(url);
        
        if (iconUrl.startsWith('data:')) {
            iconSizeCache.set(cacheKey, iconUrl);
            return iconUrl;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        const img = new Image();
        try {
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.crossOrigin = 'anonymous';
                
                const timeout = setTimeout(() => reject(new Error('Icon load timeout')), 3000);
                
                img.onload = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                
                img.src = iconUrl;
            });
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, size, size);
            
            const dataUrl = canvas.toDataURL('image/png', 0.9);
            
            iconSizeCache.set(cacheKey, dataUrl);
            return dataUrl;
        } catch (error) {
            const fallback = generateDefaultIconDataUrl(url, size);
            iconSizeCache.set(cacheKey, fallback);
            return fallback;
        }
    } catch (error) {
        const fallback = generateDefaultIconDataUrl(url, size);
        iconSizeCache.set(cacheKey, fallback);
        return fallback;
    }
}

/**
 * 生成默认图标
 */
function generateDefaultIconDataUrl(url, size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
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
 * 预加载图标
 */
export async function preloadIcons(urls, highPriority = false) {
    if (!Array.isArray(urls) || urls.length === 0) return;
    
    const uncachedUrls = urls.filter(url => {
        const domain = getDomain(url);
        return !iconCache.has(domain);
    });
    
    if (uncachedUrls.length === 0) return;
    
    if (highPriority) {
        await Promise.allSettled(uncachedUrls.map(url => getIconUrl(url)));
    } else {
        const batchSize = 3;
        for (let i = 0; i < uncachedUrls.length; i += batchSize) {
            const batch = uncachedUrls.slice(i, i + batchSize);
            await Promise.allSettled(batch.map(url => getIconUrl(url)));
            
            if (i + batchSize < uncachedUrls.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }
    
    await saveIconCache();
}

/**
 * 辅助功能
 */
export function getAllCachedIcons() {
    const result = {};
    iconCache.forEach((value, key) => {
        result[key] = value.data;
    });
    return result;
}

export async function setCustomIcon(url, base64Image) {
    await chrome.storage.local.set({ [url]: base64Image });
    const domain = getDomain(url);
    await cacheIcon(domain, base64Image);
}

export async function resetIcon(url) {
    await chrome.storage.local.remove(url);
    const domain = getDomain(url);
    if (iconCache.has(domain)) {
        iconCache.delete(domain);
    }
}