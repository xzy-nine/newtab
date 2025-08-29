/**
 * 精简版图标管理模块 - 处理网站图标的获取和缓存
 * 
 * 注意：此模块依赖 Utils 和 I18n，但由于它们在 index.js 中的导出顺序，
 * 这里需要直接导入以避免循环依赖
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';

// 核心数据结构
const iconCache = new Map();
const DEFAULT_ICON = '../icons/default.png';
const FETCH_TIMEOUT = 3000;
// 添加替代图标标记前缀
const FALLBACK_ICON_PREFIX = 'data:image/png;base64,FALLBACKICON:';

/**
 * IconManager API - 提供网站图标管理功能
 * @namespace IconManager
 */
export const IconManager = {
    /**
     * 获取网站图标 URL（自动处理缓存、降级、异步刷新）
     * @param {string} url - 网站 URL
     * @param {HTMLElement} [element=null] - 要设置背景图的元素
     * @returns {Promise<string>} 图标 URL
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

        // 2. 检查本地存储缓存
        try {
            const cached = await chrome.storage.local.get([url, domain]);
            const iconData = cached[url] || cached[domain];
            if (iconData && !iconData.startsWith('data:text/html')) {
                if (element) element.style.backgroundImage = `url(${this.stripFallbackPrefix(iconData)})`;
                await this.cacheIcon(domain, iconData);
                return this.stripFallbackPrefix(iconData);
            }
        } catch (e) {}

        // 3. 立即生成并显示基于域名前缀的替代图标
        const fallbackIcon = this.generateInitialBasedIcon(domain);
        if (element) element.style.backgroundImage = `url(${fallbackIcon})`;

        // 4. 异步尝试获取真实图标，获取到后自动替换
        this.fetchIconFromSources(url, domain).then(realIcon => {
            if (realIcon && this.stripFallbackPrefix(realIcon) !== this.stripFallbackPrefix(fallbackIcon)) {
                if (element && element.style.backgroundImage.includes(this.stripFallbackPrefix(fallbackIcon))) {
                    element.style.backgroundImage = `url(${this.stripFallbackPrefix(realIcon)})`;
                }
            }
        });

        return fallbackIcon;
    },
    /**
     * 获取图标 URL（异步方法，返回 URL 而不是设置 DOM 元素）
     * @param {string} url - 网站 URL
     * @returns {Promise<string>} 图标 URL
     */
    getIconUrlAsync: async function(url) {
        try {
            // 尝试从缓存获取
            const domain = Utils.getDomain(url);
            const cachedIconObj = await chrome.storage.local.get([domain, url]);

            // 优先使用URL对应的图标，其次是域名图标
            if (cachedIconObj[url]) return this.stripFallbackPrefix(cachedIconObj[url]);
            if (cachedIconObj[domain]) return this.stripFallbackPrefix(cachedIconObj[domain]);

            // 如果没有缓存，生成基于域名前缀的替代图标
            return this.generateInitialBasedIcon(domain);
        } catch (error) {
            console.error('获取图标URL失败:', error);
            return null;
        }
    },
    /**
     * 从多个来源获取图标
     * @param {string} url - 网站 URL
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
     * 从 HTML 提取图标 URL
     * @param {string} url - 网站 URL
     * @returns {Promise<string[]>} 图标 URL 列表
     */
    async extractIconUrlsFromHtml(url) {
        const icons = [];
        try {
            const response = await fetch(url, {
                mode: 'cors',
                headers: { 'cache-control': 'no-cache' },
                credentials: 'omit',
                signal: AbortSignal.timeout(FETCH_TIMEOUT)
            });

            if (response.status === 401) {
                console.debug(`跳过需要认证的网站: ${url}`);
                return icons;
            }

            if (response.ok) {
                const text = await response.text();

                // 使用正则表达式直接提取图标链接，避免完整解析HTML
                const iconRegex = /<link[^>]*rel=["'](icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
                let match;

                while ((match = iconRegex.exec(text)) !== null) {
                    const href = match[2];
                    if (href) {
                        try {
                            icons.push(new URL(href, url).href);
                        } catch (e) {
                            console.debug(`无效的图标URL: ${href}`);
                        }
                    }
                }

                // 在使用DOM解析前清理text内容
                text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                text = text.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');

                // 如果正则表达式没有找到，再使用DOM解析作为备选
                if (icons.length === 0) {
                    const doc = new DOMParser().parseFromString(text, 'text/html');
                    const iconLinks = doc.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');

                    iconLinks.forEach(link => {
                        const href = link.getAttribute('href');
                        if (href) {
                            icons.push(new URL(href, url).href);
                        }
                    });
                }
            }
        } catch (error) {
            console.debug(I18n.getMessage('fetchIconFailed') + ':', error);
        }
        return icons;
    },
    /**
     * 尝试获取单个图标
     * @param {string} iconUrl - 图标 URL
     * @param {string} sourceUrl - 源网站 URL
     * @returns {Promise<Object|null>} 图标信息或 null
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
     * @param {string} iconData - 图标的 Base64 数据
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
     * @param {string} [fallbackIcon=DEFAULT_ICON] - 备用图标 URL
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
     * @param {string} url - 网站 URL
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

            // 优先本地缓存
            let iconData = null;
            if (iconCache.has(domain)) {
                iconData = iconCache.get(domain).data;
            } else {
                const cached = await chrome.storage.local.get([url, domain]);
                iconData = cached[url] || cached[domain];
                if (iconData) await this.cacheIcon(domain, iconData);
            }

            // 没有则用替代图标
            if (!iconData) {
                iconData = this.generateInitialBasedIcon(domain);
            }

            img.src = this.stripFallbackPrefix(iconData);

            // 异步尝试获取真实图标
            this.fetchIconFromSources(url, domain).then(realIcon => {
                if (realIcon && this.stripFallbackPrefix(realIcon) !== this.stripFallbackPrefix(iconData) && 
                    img.isConnected && img.dataset.originalUrl === url) {
                    img.src = this.stripFallbackPrefix(realIcon);
                }
            });

            delete img.dataset.processingUrl;
        } catch (error) {
            img.src = DEFAULT_ICON;
            delete img.dataset.processingUrl;
            console.error(I18n.getMessage('fetchIconFailed') + ':', error);
        }
    },
    /**
     * 设置自定义图标
     * @param {string} url - 网站 URL
     * @param {string} base64Image - Base64 编码的图像
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
     * @param {string} url - 网站 URL
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
     * @returns {string} 图标的 DataURL
     */
    generateInitialBasedIcon(domain) {
        console.debug("生成图标，域名:", domain);
        // 使用正则表达式去除所有协议头和参数
        let cleanDomain = domain.replace(/^.*?:\/\//, '').split('?')[0].split('#')[0];
        console.debug("清理后域名:", cleanDomain);

        // 提取域名关键词的智能算法
        const extractKeyword = (domain) => {
            const parts = domain.split('.');

            // 检测是否为IP地址
            const isIPAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain);
            if (isIPAddress) {
                // 对于IP地址，返回一个特殊标记，后续特殊处理
                return `IP:${domain}`;
            }

            // 检测是否包含端口号
            const domainWithoutPort = domain.split(':')[0];

            // 重新检测去掉端口号后是否为IP地址
            if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domainWithoutPort)) {
                return `IP:${domainWithoutPort}`;
            }

            const cleanParts = domainWithoutPort.split('.');

            // 使用正则表达式移除顶级域名和国家代码域名
            // 匹配常见的TLD模式：2-4位字母的顶级域名
            const tldPattern = /^[a-z]{2,4}$/i;
            // 匹配二级域名模式：如 co.uk, com.cn 等
            const secondLevelPattern = /^(co|com|net|org|gov|edu|ac|www)$/i;

            // 从后往前移除顶级域名
            let workingParts = [...cleanParts];

            // 移除最后一个部分如果它是TLD
            if (workingParts.length > 1 && tldPattern.test(workingParts[workingParts.length - 1])) {
                workingParts.pop();

                // 检查是否还有二级域名需要移除（如 co.uk 中的 co）
                if (workingParts.length > 1 && secondLevelPattern.test(workingParts[workingParts.length - 1])) {
                    workingParts.pop();
                }
            }

            // 如果移除后没有剩余部分，使用原始parts（去掉最后一个TLD）
            if (workingParts.length === 0) {
                workingParts = cleanParts.slice(0, -1);
            }

            // 移除常见的子域名前缀，使用正则表达式模式匹配
            const commonSubdomainPatterns = [
                /^www\d*$/i,        // www, www1, www2 等
                /^m(obile)?$/i,     // m, mobile
                /^(api|app)$/i,     // api, app
                /^(mail|ftp|blog|news|shop)$/i,  // 功能性子域名
                /^(wap|touch)$/i,   // 移动端子域名
                /^(admin|secure)$/i, // 管理相关子域名
                /^(static|cdn|img|images?)$/i,   // 静态资源子域名
                /^(test|dev|staging)$/i,         // 开发测试环境
                /^(old|new|beta)$/i              // 版本相关子域名
            ];

            let keyword = '';

            // 优先选择非纯数字的域名部分
            for (let i = workingParts.length - 1; i >= 0; i--) {
                const part = workingParts[i];
                // 检查是否匹配常见子域名模式
                const isCommonSubdomain = commonSubdomainPatterns.some(pattern => pattern.test(part));
                // 检查是否为纯数字
                const isPureNumber = /^\d+$/.test(part);

                // 跳过常见子域名和纯数字域名，但如果只有一个部分则保留
                if (workingParts.length === 1 || (!isCommonSubdomain && !isPureNumber)) {
                    keyword = part;
                    break;
                }
            }

            // 如果没找到合适的关键词，使用最后一个非通用子域名（包括数字域名）
            if (!keyword && workingParts.length > 0) {
                // 从后往前找第一个不匹配常见子域名模式的
                for (let i = workingParts.length - 1; i >= 0; i--) {
                    const part = workingParts[i];
                    const isCommonSubdomain = commonSubdomainPatterns.some(pattern => pattern.test(part));
                    if (!isCommonSubdomain) {
                        keyword = part;
                        break;
                    }
                }
                // 如果还是没找到，就用第一个
                if (!keyword) keyword = workingParts[0];
            }

            return keyword || 'site';
        };

        const siteName = extractKeyword(cleanDomain);
        console.debug("提取的关键词:", siteName);

        // 优化关键词显示：处理数字和特殊情况
        let prefix = '';
        let isIPDisplay = false;

        // 检查是否为IP地址标记
        if (siteName.startsWith('IP:')) {
            isIPDisplay = true;
            const ipAddress = siteName.substring(3); // 去掉 "IP:" 前缀
            prefix = ipAddress;
        } else if (/^\d+$/.test(siteName)) {
            // 纯数字的情况，取前3位数字
            prefix = siteName.substring(0, Math.min(3, siteName.length));
        } else if (/^\d/.test(siteName)) {
            // 以数字开头的情况，取前4个字符
            prefix = siteName.substring(0, Math.min(4, siteName.length));
        } else {
            // 正常情况，取前4个字符并首字母大写
            prefix = siteName.substring(0, Math.min(4, siteName.length));
            prefix = prefix.charAt(0).toUpperCase() + prefix.substring(1).toLowerCase();
        }
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

        // 根据文本内容和长度调整字体大小和绘制方式
        if (isIPDisplay) {
            // IP地址特殊处理：上下分行显示
            const ipParts = prefix.split('.');
            const topLine = `${ipParts[0]}.${ipParts[1]}`;
            const bottomLine = `${ipParts[2]}.${ipParts[3]}`;

            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // 上半部分（前两段）
            ctx.fillText(topLine, 32, 22);
            // 下半部分（后两段）- 稍微加粗显示
            ctx.font = 'bold 16px Arial';
            ctx.fillText(bottomLine, 32, 42);
        } else {
            // 普通文本显示
            let fontSize = prefix.length <= 2 ? 36 : (prefix.length === 3 ? 26 : 20);
            ctx.font = `bold ${fontSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(prefix, 32, 32);
        }

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

