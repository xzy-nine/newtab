/**
 * 精简版图标管理模块 - 处理网站图标的获取和缓存
 */

import { getDomain } from './utils.js';

// 核心数据结构
const iconCache = new Map();
const DEFAULT_ICON = 'images/default_favicon.png';

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
    
    try {
        await chrome.storage.local.set({ [domain]: iconData });
    } catch (error) {}
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
            `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}`
        ];

        // 尝试从HTML获取图标链接
        try {
            const response = await fetch(url, { 
                mode: 'cors',
                headers: { 'cache-control': 'no-cache' },
                signal: AbortSignal.timeout(3000)
            });
            
            if (response.ok) {
                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const iconLink = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
                if (iconLink) {
                    iconUrls.unshift(new URL(iconLink.getAttribute('href'), url).href);
                }
            }
        } catch (error) {}

        // 依次尝试获取每个图标URL的内容
        for (const iconUrl of iconUrls) {
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
                                await chrome.storage.local.set({ [url]: base64data });
                                if (element) {
                                    element.style.backgroundImage = `url(${base64data})`;
                                }
                                await cacheIcon(domain, base64data);
                                return base64data;
                            }
                        } catch (imgError) {}
                    }
                }
            } catch (error) {}
        }

        // 生成基于域名首字母的替代图标
        const fallbackIcon = generateInitialBasedIcon(domain);
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
 * 生成基于域名首字母的替代图标
 */
function generateInitialBasedIcon(domain) {
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

// 保留兼容性的简化函数
export async function initIconManager() {}  // 简化为空函数，保留导出
export async function cleanupIconCache() {}  // 简化为空函数，保留导出
export async function generateIconDataUrl(url) { return await getIconUrl(url); }  // 简化实现，保留导出
export async function preloadIcons() {}  // 简化为空函数，保留导出
export function getAllCachedIcons() { return {}; }  // 简化实现，保留导出
export async function setCustomIcon(url, base64Image) { 
    await chrome.storage.local.set({ [url]: base64Image });
    await cacheIcon(getDomain(url), base64Image);
}
export async function resetIcon(url) { 
    await chrome.storage.local.remove(url);
    iconCache.delete(getDomain(url));
}