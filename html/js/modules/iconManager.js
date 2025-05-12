/**
 * 精简版图标管理模块 - 处理网站图标的获,和缓存
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js'; 

// 核心数据结构
const iconCache = new Map();
const DEFAULT_ICON = '../Icon.png';
const FETCH_TIMEOUT = 3000;
// 添加替代图标标记前缀
const FALLBACK_ICON_PREFIX = 'data:image/png;base64,FALLBACKICON:';

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
        
        // 1. 检查内存缓存
        if (iconCache.has(domain)) {
            const iconData = iconCache.get(domain).data;
            if (element) element.style.backgroundImage = `url(${this.stripFallbackPrefix(iconData)})`;
            return this.stripFallbackPrefix(iconData);
        }
        
        // 2. 设置默认图标
        if (element) element.style.backgroundImage = `url(${DEFAULT_ICON})`;

        try {
            // 3. 检查本地存储缓存
            const cached = await chrome.storage.local.get(url);
            if (cached[url] && !cached[url].startsWith('data:text/html')) {
                const iconData = cached[url];
                if (element) element.style.backgroundImage = `url(${this.stripFallbackPrefix(iconData)})`;
                await this.cacheIcon(domain, iconData);
                return this.stripFallbackPrefix(iconData);
            }

            // 4. 尝试获取图标
            const iconData = await this.fetchIconFromSources(url, domain);
            
            if (element) element.style.backgroundImage = `url(${this.stripFallbackPrefix(iconData)})`;
            return this.stripFallbackPrefix(iconData);
        } catch (error) {
            console.error(I18n.getMessage('fetchIconFailed') + ':', error);
            return DEFAULT_ICON;
        }
    },

    /**
     * 获取图标URL（异步方法，返回URL而不是设置DOM元素）
     * @param {string} url - 网站URL
     * @returns {Promise<string>} - 图标URL
     */
    getIconUrlAsync: async function(url) {
        try {
            // 尝试从缓存获取
            const domain = Utils.getDomain(url);
            const cachedIconObj = await chrome.storage.local.get([domain, url]);
            
            // 优先使用URL对应的图标，其次是域名图标
            if (cachedIconObj[url]) return cachedIconObj[url];
            if (cachedIconObj[domain]) return cachedIconObj[domain];
            
            // 尝试获取favicon
            const iconUrl = `${domain}/favicon.ico`;
            return iconUrl;
        } catch (error) {
            console.error('获取图标URL失败:', error);
            return null;
        }
    },

    /**
     * 从多个来源获取图标
     * @param {string} url - 网站URL
     * @param {string} domain - 网站域名 
     * @returns {Promise<string>} 图标数据
     */
    async fetchIconFromSources(url, domain) {
        // 定义图标URL来源
        let iconUrls = [
            `${domain}/favicon.ico`,
            `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
            `https://api.faviconkit.com/${new URL(url).hostname}/64`,
            `https://favicon.yandex.net/favicon/${new URL(url).hostname}`,
            `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}`
        ];

        // 首先检查是否已有生成的替代图标
        const domainCache = await chrome.storage.local.get(domain);
        if (domainCache[domain] && domainCache[domain].startsWith(FALLBACK_ICON_PREFIX)) {
            console.debug(`使用已存储的替代图标: ${domain}`);
            await this.cacheIcon(domain, domainCache[domain]);
            return this.stripFallbackPrefix(domainCache[domain]);
        }

        // 尝试从HTML获取图标链接
        try {
            const htmlIconUrls = await this.extractIconUrlsFromHtml(url);
            iconUrls = [...htmlIconUrls, ...iconUrls];
        } catch (error) {
            console.debug(I18n.getMessage('fetchIconFailed') + ':', error);
        }

        // 并行获取所有图标
        const iconPromises = iconUrls.map(iconUrl => this.tryFetchIcon(iconUrl, url));
        const results = await Promise.all(iconPromises);
        const validIcons = results.filter(Boolean);

        if (validIcons.length > 0) {
            // 选择得分最高的图标
            validIcons.sort((a, b) => b.score - a.score);
            const bestIcon = validIcons[0];
            
            // 为小尺寸图标添加透明边框
            let finalIconData = bestIcon.data;
            if (!bestIcon.isSvg && (bestIcon.width < 32 || bestIcon.height < 32)) {
                finalIconData = await this.addPaddingToSmallIcon(bestIcon.data);
            }

            await chrome.storage.local.set({ [url]: finalIconData });
            await this.cacheIcon(domain, finalIconData);
            return finalIconData;
        }

        // 生成基于域名前缀的替代图标
        const fallbackIcon = this.generateInitialBasedIcon(domain);
        // 添加标记并保存到存储
        const markedFallbackIcon = `${FALLBACK_ICON_PREFIX}${fallbackIcon.substring(22)}`; // 去掉 "data:image/png;base64,"
        await this.cacheIcon(domain, markedFallbackIcon);
        await chrome.storage.local.set({ [url]: markedFallbackIcon });
        return fallbackIcon;
    },
    
    /**
     * 从HTML提取图标URL
     * @param {string} url - 网站URL
     * @returns {Promise<string[]>} 图标URL列表
     */
    async extractIconUrlsFromHtml(url) {
        const icons = [];
        try {
            const response = await fetch(url, { 
                mode: 'cors',
                headers: { 'cache-control': 'no-cache' },
                credentials: 'omit', // 避免发送认证信息，防止弹出Basic Auth对话框
                signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });
            
            // 检查是否返回401状态码，如果是则直接返回空数组
            if (response.status === 401) {
                console.debug(`跳过需要认证的网站: ${url}`);
                return icons;
            }
            
            if (response.ok) {
                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const iconLinks = doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
                
                iconLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href) {
                        icons.push(new URL(href, url).href);
                    }
                });
            }
        } catch (error) {
            console.debug(I18n.getMessage('fetchIconFailed') + ':', error);
        }
        return icons;
    },
    
    /**
     * 尝试获取单个图标
     * @param {string} iconUrl - 图标URL
     * @param {string} sourceUrl - 源网站URL 
     * @returns {Promise<Object|null>} 图标信息或null
     */
    async tryFetchIcon(iconUrl, sourceUrl) {
        try {
            const response = await fetch(iconUrl, {
                mode: 'cors',
                headers: { 'cache-control': 'no-cache' },
                credentials: 'omit', // 添加此项避免认证弹窗
                signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });

            // 如果状态是401或403，直接返回null不处理
            if (response.status === 401 || response.status === 403) {
                console.debug(`跳过需要认证的图标: ${iconUrl}`);
                return null;
            }

            if (!response.ok) return null;
            
            const blob = await response.blob();
            const base64data = await Utils.blobToBase64(blob);
            
            if (base64data.startsWith('data:text')) return null;
            
            // 分析图像质量
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = base64data;
                });
                
                // 最低要求：图标至少5x5像素
                if (img.width < 5 || img.height < 5) return null;
                
                // 检测是否为SVG矢量图
                const isSvg = base64data.includes('data:image/svg+xml');
                
                return {
                    url: iconUrl,
                    data: base64data,
                    width: img.width,
                    height: img.height,
                    isSvg,
                    score: isSvg ? 1000 : Math.max(img.width, img.height) // 评分：SVG最高，否则按最大尺寸
                };
            } catch (error) {
                console.debug(I18n.getMessage('fetchIconFailed') + `: ${iconUrl}`, error);
                return null;
            }
        } catch (error) {
            console.debug(I18n.getMessage('fetchIconFailed') + `: ${iconUrl}`, error);
            return null;
        }
    },

    /**
     * 为小尺寸图标添加透明边框
     * @param {string} iconData - 图标的Base64数据
     * @returns {Promise<string>} 处理后的图标数据
     */
    async addPaddingToSmallIcon(iconData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // 创建一个新画布，尺寸为32x32
                const canvas = Utils.createElement('canvas', '', { width: '32', height: '32' });
                const ctx = canvas.getContext('2d');
                
                // 计算适合的缩放比例，保持图标在画布中心
                const scaleFactor = Math.min(24 / img.width, 24 / img.height);
                const newWidth = img.width * scaleFactor;
                const newHeight = img.height * scaleFactor;
                
                ctx.drawImage(
                    img,
                    (32 - newWidth) / 2,
                    (32 - newHeight) / 2,
                    newWidth,
                    newHeight
                );
                
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(iconData);
            img.src = iconData;
        });
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
                    console.error(I18n.getMessage('error') + ':', error);
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
            
            // 避免重复处理
            if (img.dataset.processingUrl === url) return;
            img.dataset.processingUrl = url;
            
            img.onerror = () => this.handleIconError(img);
            
            const domain = Utils.getDomain(url);
            
            // 应用过渡效果
            const applyTransition = () => {
                img.style.opacity = '0.7';
                setTimeout(() => { 
                    if (img.isConnected) img.style.opacity = originalOpacity; 
                }, 50);
            };
            
            if (iconCache.has(domain)) {
                applyTransition();
                img.src = this.stripFallbackPrefix(iconCache.get(domain).data);
            } else {
                if (img.src) applyTransition();
                
                const iconUrl = await this.getIconUrl(url);
                
                if (img.isConnected && img.dataset.processingUrl === url) {
                    img.src = iconUrl;
                    applyTransition();
                }
            }
            
            delete img.dataset.processingUrl;
        } catch (error) {
            img.src = DEFAULT_ICON;
            delete img.dataset.processingUrl;
            console.error(I18n.getMessage('fetchIconFailed') + ':', error);
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
            Notification.showErrorMessage(I18n.getMessage('saveIconFailed') + ': ' + error);
        }
    },

    /**
     * 重置图标到默认状态
     * @param {string} url - 网站URL
     */
    async resetIcon(url) { 
        try {
            const domain = Utils.getDomain(url);
            iconCache.delete(domain);
            
            // 清除多种可能的存储位置
            const urlObj = new URL(url);
            const keysToRemove = [
                url,
                domain,
                urlObj.hostname,
                url.split('/').slice(0, 3).join('/')
            ];
            
            await Promise.all(keysToRemove.map(key => 
                chrome.storage.local.remove(key).catch(() => {})
            ));
        } catch (error) {
            console.error(I18n.getMessage('reloadFailed') + ':', error);
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
            console.error(I18n.getMessage('saveFailed') + ':', error);
        }
    },

    /**
     * 生成基于域名前缀的替代图标
     * @param {string} domain - 网站域名
     * @returns {string} 图标的DataURL
     */
    generateInitialBasedIcon(domain) {
        console.debug("生成图标，域名:", domain);
        // 使用正则表达式去除所有协议头
        let cleanDomain = domain.replace(/^.*?:\/\//, '');
        console.debug("清理后域名:", cleanDomain);
        
        const domainParts = cleanDomain.split('.');
        console.debug("域名部分:", domainParts);
        const siteName = domainParts[0] === 'www' && domainParts.length > 1 ? 
            domainParts[1] : domainParts[0];
        console.debug("站点名称:", siteName);
        
        // 使用整个域名前缀而不是首字母
        let prefix = siteName.substring(0, Math.min(4, siteName.length));
        prefix = prefix.charAt(0).toUpperCase() + prefix.substring(1).toLowerCase();
        console.debug("使用前缀:", prefix);
        
        // 基于域名生成颜色
        const getColorCode = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            return `hsl(${Math.abs(hash) % 360}, 70%, 60%)`;
        };
        
        const bgColor = getColorCode(domain);
        const canvas = Utils.createElement('canvas', '', { width: '64', height: '64' });
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#FFFFFF';
        
        // 根据文本长度调整字体大小
        const fontSize = prefix.length <= 2 ? 36 : (prefix.length === 3 ? 26 : 20);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(prefix, 32, 32);
        
        return canvas.toDataURL('image/png');
    },

    /**
     * 移除替代图标的前缀标记
     * @param {string} iconData - 图标数据
     * @returns {string} 处理后的图标数据
     */
    stripFallbackPrefix(iconData) {
        if (iconData && iconData.startsWith(FALLBACK_ICON_PREFIX)) {
            return 'data:image/png;base64,' + iconData.substring(FALLBACK_ICON_PREFIX.length);
        }
        return iconData;
    }
};

