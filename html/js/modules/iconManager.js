/**
 * 精简版图标管理模块 - 处理网站图标的获取和缓存
 */

import { Utils } from './utils.js';

// 核心数据结构
const iconCache = new Map();
const DEFAULT_ICON = '../Icon.png';

/**
 * IconManager API - 提供网站图标管理功能
 */
export const IconManager = {
    /**
     * 获取网站图标URL
     * @param {string} url - 网站URL
     * @param {HTMLElement} [element=null] - 要设置背景图的元素
     * @returns {Promise<string>} 图标URL
     */
    async getIconUrl(url, element = null) {
        if (!url) return DEFAULT_ICON;
        
        const domain = Utils.getDomain(url);
        
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
                await this.cacheIcon(domain, cached[url]);
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
            } catch (error) {
                // 这里的错误可以忽略，因为我们有备选方案
                // 使用logOnly=true，只记录到控制台不弹出通知
                console.debug('无法解析HTML获取图标:', error);
            }

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
                        // 使用 Utils 模块中的 blobToBase64 函数
                        const base64data = await Utils.blobToBase64(blob);
                        
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
                                    await this.cacheIcon(domain, base64data);
                                    return base64data;
                                }
                            } catch (imgError) {
                                // 使用logOnly=true，只记录到控制台不弹出通知
                                console.debug(`图片加载失败: ${iconUrl}`, imgError);
                            }
                        }
                    }
                } catch (error) {
                    // 使用logOnly=true，只记录到控制台不弹出通知
                    console.debug(`获取图标失败: ${iconUrl}`, error);
                }
            }

            // 生成基于域名首字母的替代图标
            const fallbackIcon = this.generateInitialBasedIcon(domain);
            await this.cacheIcon(domain, fallbackIcon);
            if (element) {
                element.style.backgroundImage = `url(${fallbackIcon})`;
            }
            return fallbackIcon;

        } catch (error) {
            // 使用 Utils 中的错误处理函数记录错误（但确保只记录到控制台）
            Utils.UI.showErrorModal('错误', '获取网站图标时遇到问题: ' + error, true);
            return DEFAULT_ICON;
        }
    },

    /**
     * 处理图标加载错误
     * @param {HTMLImageElement} img - 图片元素
     * @param {string} [fallbackIcon=DEFAULT_ICON] - 备用图标URL
     */
    async handleIconError(img, fallbackIcon = DEFAULT_ICON) {
        img.src = fallbackIcon;
        
        const originalUrl = img.dataset.originalUrl;
        if (originalUrl) {
            const domain = Utils.getDomain(originalUrl);
            if (iconCache.has(domain)) {
                iconCache.delete(domain);
                
                try {
                    await chrome.storage.local.remove(originalUrl);
                } catch (error) {
                    // 只记录到控制台，不显示通知
                    Utils.UI.showErrorModal('错误', '移除失败的图标缓存时出错: ' + error, true);
                }
            }
        }
    },

    /**
     * 为元素设置图标
     * @param {HTMLImageElement} img - 图片元素
     * @param {string} url - 网站URL
     */
    async setIconForElement(img, url) {
        if (!img || !url) return;
        
        try {
            const originalOpacity = img.style.opacity || '1';
            
            img.dataset.originalUrl = url;
            
            if (img.dataset.processingUrl === url) return;
            img.dataset.processingUrl = url;
            
            img.onerror = () => this.handleIconError(img);
            
            const domain = Utils.getDomain(url);
            if (iconCache.has(domain)) {
                img.style.opacity = '0.7';
                img.src = iconCache.get(domain).data;
                setTimeout(() => { img.style.opacity = originalOpacity; }, 50);
            } else {
                if (img.src) img.style.opacity = '0.7'; 
                
                const iconUrl = await this.getIconUrl(url);
                
                if (img.isConnected && img.dataset.processingUrl === url) {
                    img.src = iconUrl;
                    setTimeout(() => { img.style.opacity = originalOpacity; }, 50);
                }
            }
            
            delete img.dataset.processingUrl;
        } catch (error) {
            // 使用默认图标并只记录错误
            img.src = DEFAULT_ICON;
            delete img.dataset.processingUrl;
            Utils.UI.showErrorModal('错误', '设置图标元素时出错: ' + error, true);
        }
    },

    /**
     * 设置自定义图标
     * @param {string} url - 网站URL
     * @param {string} base64Image - Base64编码的图像
     */
    async setCustomIcon(url, base64Image) { 
        try {
            await chrome.storage.local.set({ [url]: base64Image });
            await this.cacheIcon(Utils.getDomain(url), base64Image);
        } catch (error) {
            // 这个可能需要通知用户，因为是用户主动操作
            Utils.UI.showErrorMessage('设置自定义图标失败: ' + error);
        }
    },

    /**
     * 重置图标到默认状态
     * @param {string} url - 网站URL
     */
    async resetIcon(url) { 
        try {
            await chrome.storage.local.remove(url);
            iconCache.delete(Utils.getDomain(url));
        } catch (error) {
            // 这个可能需要通知用户，因为是用户主动操作
            Utils.UI.showErrorMessage('重置图标失败: ' + error);
        }
    },

    /**
     * 缓存图标
     * @param {string} domain - 网站域名
     * @param {string} iconData - 图标数据
     */
    async cacheIcon(domain, iconData) {
        iconCache.set(domain, {
            data: iconData,
            timestamp: Date.now()
        });
        
        try {
            await chrome.storage.local.set({ [domain]: iconData });
        } catch (error) {
            // 只记录到控制台，不显示通知
            Utils.UI.showErrorModal('错误', '缓存图标失败: ' + error, true);
        }
    },

    /**
     * 生成基于域名首字母的替代图标
     * @param {string} domain - 网站域名
     * @returns {string} 图标的DataURL
     * @private
     */
    generateInitialBasedIcon(domain) {
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
        // 使用 Utils 模块中的 createElement 函数
        const canvas = Utils.createElement('canvas', '', { width: '64', height: '64' });
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
};

