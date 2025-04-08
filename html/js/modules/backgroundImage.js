/**
 * 背景图像处理模块
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';

// 从background.js移动过来的常量和函数
const CACHE_KEY = 'bingImageCache';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * 背景图片管理器类
 */
class BackgroundManager {
    constructor() {
        // 背景图像设置
        this.settings = {
            type: 'bing',  // 默认使用必应作为背景
            customImageData: null,
            blur: 0,
            dark: 0
        };
    }

    /**
     * 初始化背景图像
     * @returns {Promise<void>}
     */
    async initialize() {
        // 加载背景设置
        await this.loadSettings();

        // 设置背景图像
        await this.setImage();

        // 初始化背景图像控制UI
        this.initControls();
        
        // 绑定背景按钮事件
        this.bindButtonEvent();
    }

    /**
     * 设置背景相关的事件处理
     */
    setupEvents() {
        // 确保背景按钮事件被绑定
        this.bindButtonEvent();
        
        // 设置背景设置面板的事件
        this.setupSettingsEvents();
    }

    /**
     * 设置背景设置面板的事件
     */
    setupSettingsEvents() {
        // 背景类型选择
        const bgTypeSelect = document.getElementById('bg-type');
        if (bgTypeSelect) {
            bgTypeSelect.addEventListener('change', async (e) => {
                this.settings.type = e.target.value;
                await chrome.storage.local.set({ bgType: this.settings.type });
                await this.setImage();
            });
        }
        
        // 模糊效果滑块
        const blurControl = document.getElementById('blur-control');
        if (blurControl) {
            blurControl.addEventListener('input', async (e) => {
                this.settings.blur = parseInt(e.target.value);
                await chrome.storage.local.set({ backgroundBlur: this.settings.blur });
                this.applyEffects();
            });
        }
        
        // 暗化效果滑块
        const darkControl = document.getElementById('dark-control');
        if (darkControl) {
            darkControl.addEventListener('input', async (e) => {
                this.settings.dark = parseInt(e.target.value);
                await chrome.storage.local.set({ backgroundDark: this.settings.dark });
                this.applyEffects();
            });
        }
    }

    /**
     * 绑定背景按钮事件
     */
    bindButtonEvent() {
        const bgButton = document.getElementById('background-button');
        if (bgButton) {
            // 清除已有的事件监听器以避免重复绑定
            const newButton = bgButton.cloneNode(true);
            if (bgButton.parentNode) {
                bgButton.parentNode.replaceChild(newButton, bgButton);
            }
            
            // 左键点击事件 - 切换背景类型
            newButton.addEventListener('click', async () => {
                // 根据是否有自定义图片决定切换类型
                if (this.settings.customImageData) {
                    // 有自定义图片时，在bing和custom之间切换
                    this.settings.type = this.settings.type === 'bing' ? 'custom' : 'bing';
                } else {
                    // 没有自定义图片时，在bing和default之间切换
                    this.settings.type = this.settings.type === 'bing' ? 'default' : 'bing';
                }
                
                // 保存设置
                await chrome.storage.local.set({ bgType: this.settings.type });
                
                // 应用新背景
                await this.setImage();
                
                // 更新任何背景类型选择器
                const bgTypeSelect = document.getElementById('bg-type');
                if (bgTypeSelect) {
                    bgTypeSelect.value = this.settings.type;
                }
            });
            
            // 右键点击事件 - 上传自定义背景
            newButton.addEventListener('contextmenu', (e) => {
                // 阻止默认的上下文菜单
                e.preventDefault();
                
                // 创建一个隐藏的文件输入元素
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);
                
                // 监听文件选择
                fileInput.addEventListener('change', async (event) => {
                    if (event.target.files && event.target.files[0]) {
                        await this.handleCustomBackground(event);
                    } else if (this.settings.customImageData) {
                        // 如果有自定义图片但用户没有选择新图片，则清除自定义图片
                        await this.clearCustomBackground();
                    }
                    
                    // 选择完成后移除元素
                    document.body.removeChild(fileInput);
                });
                
                // 添加取消选择事件监听器
                fileInput.addEventListener('cancel', async () => {
                    if (this.settings.customImageData) {
                        // 如果有自定义图片但用户取消选择，则清除自定义图片
                        await this.clearCustomBackground();
                    }
                    document.body.removeChild(fileInput);
                });
                
                // 模拟点击文件选择器
                fileInput.click();
            });
        }
    }

    /**
     * 加载背景图像设置
     * @returns {Promise<void>}
     */
    async loadSettings() {
        try {
            const result = await chrome.storage.local.get([
                'bgType', 
                'customImage', 
                'backgroundBlur', 
                'backgroundDark'
            ]);
            
            // 如果有自定义图片，只允许在 'bing' 和 'custom' 之间切换
            // 如果没有自定义图片，只允许在 'bing' 和 'default'(白色) 之间切换
            if (result.customImage) {
                this.settings.customImageData = result.customImage;
                this.settings.type = result.bgType === 'custom' ? 'custom' : 'bing';
            } else {
                this.settings.customImageData = null;
                this.settings.type = result.bgType === 'default' ? 'default' : 'bing';
            }
            
            this.settings.blur = result.backgroundBlur !== undefined ? result.backgroundBlur : 0;
            this.settings.dark = result.backgroundDark !== undefined ? result.backgroundDark : 0;
        } catch (error) {
            console.error('Failed to load background settings:', error);
            // 出错时默认使用必应
            this.settings.type = 'bing';
        }
    }

    /**
     * 设置背景图像
     * @returns {Promise<void>}
     */
    async setImage() {
        try {
            // 获取背景容器
            const container = document.getElementById('background-container');
            if (!container) {
                console.error('无法找到背景容器元素: background-container');
                return;
            }
            
            let bgUrl = '';
            
            // 根据背景类型获取URL
            switch(this.settings.type) {
                case 'custom':
                    if (this.settings.customImageData) {
                        bgUrl = this.settings.customImageData;
                    } else {
                        bgUrl = 'images/default.jpg';
                    }
                    break;
                case 'bing':
                    try {
                        bgUrl = await this.fetchBingImage();
                    } catch (error) {
                        console.error('Failed to get Bing image, using default:', error);
                        Utils.UI.showErrorMessage(I18n.getMessage('bingImageError') + error.message);
                        bgUrl = 'images/default.jpg';
                    }
                    break;
                case 'default':
                    // 设置为白色背景
                    container.style.backgroundImage = 'none';
                    container.style.backgroundColor = '#ffffff';
                    return; // 直接返回，不需要设置背景图
            }

            // 应用背景样式
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.zIndex = '-2';
            container.style.backgroundImage = `url(${bgUrl})`;
            container.style.backgroundSize = 'cover';
            container.style.backgroundPosition = 'center';
            
            // 应用背景效果
            this.applyEffects();
        } catch (error) {
            console.error('设置背景图像失败:', error);
            // 出错时使用默认背景
            const container = document.getElementById('background-container');
            if (container) {
                container.style.backgroundImage = 'url(images/default.jpg)';
            }
        }
    }

    /**
     * 应用背景效果（模糊、暗化）
     */
    applyEffects() {
        // 统一使用与setBackgroundImage相同的元素ID
        const container = document.getElementById('background-container');
        if (!container) {
            console.error('无法找到背景容器元素: background-container');
            return;
        }
        
        // 应用模糊效果
        if (this.settings.blur > 0) {
            container.style.filter = `blur(${this.settings.blur}px)`;
        } else {
            container.style.filter = 'none';
        }
        
        // 应用暗化效果
        const overlay = document.getElementById('background-overlay');
        if (overlay) {
            if (this.settings.dark > 0) {
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.zIndex = '-1';
                overlay.style.backgroundColor = `rgba(0, 0, 0, ${this.settings.dark / 100})`;
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none';
            }
        } else {
            console.error('无法找到背景遮罩元素: background-overlay');
        }
    }

    /**
     * 获取必应每日图片
     * @returns {Promise<string>} - 图片URL
     */
    async fetchBingImage() {
        const cachedData = await chrome.storage.local.get(CACHE_KEY);
        const now = Date.now();

        if (cachedData[CACHE_KEY] && (now - cachedData[CACHE_KEY].timestamp < CACHE_EXPIRATION)) {
            return cachedData[CACHE_KEY].imageUrl;
        }

        const data = await Utils.fetchData('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');
        const imageUrl = `https://www.bing.com${data.images[0].url}`;

        await chrome.storage.local.set({ [CACHE_KEY]: { imageUrl, timestamp: now } });

        return imageUrl;
    }

    /**
     * 获取Unsplash随机图片
     * @returns {Promise<string>} - 图片URL
     */
    async getUnsplashImage() {
        try {
            // 检查缓存
            const cacheName = 'unsplashImageCache';
            const cacheData = await chrome.storage.local.get(cacheName);
            const now = Date.now();
            const cacheExpiration = 24 * 60 * 60 * 1000; // 24小时
            
            if (cacheData[cacheName] && (now - cacheData[cacheName].timestamp < cacheExpiration)) {
                return cacheData[cacheName].imageData;
            }
            
            // 从Unsplash获取随机图片
            const imageUrl = 'https://source.unsplash.com/random/1920x1080/?nature,landscape';
            
            // 下载图片并转换为base64
            const imgResponse = await fetch(imageUrl);
            const blob = await imgResponse.blob();
            const base64Data = await Utils.blobToBase64(blob);
            
            // 保存到缓存
            await chrome.storage.local.set({ 
                [cacheName]: {
                    imageData: base64Data,
                    timestamp: now
                }
            });
            
            return base64Data;
        } catch (error) {
            console.error('Failed to get Unsplash image:', error);
            // 出错时返回默认图片的路径
            return 'images/default.jpg';
        }
    }

    /**
     * 初始化背景控制UI
     */
    initControls() {
        // 背景类型选择
        const bgTypeSelect = document.getElementById('bg-type');
        if (bgTypeSelect) {
            bgTypeSelect.value = this.settings.type;
            bgTypeSelect.addEventListener('change', async (e) => {
                this.settings.type = e.target.value;
                await chrome.storage.local.set({ bgType: this.settings.type });
                await this.setImage();
            });
        }
        
        // 自定义背景上传
        const customBgInput = document.getElementById('custom-bg');
        if (customBgInput) {
            customBgInput.addEventListener('change', e => this.handleCustomBackground(e));
        }
        
        // 背景模糊控制
        const blurControl = document.getElementById('blur-control');
        if (blurControl) {
            blurControl.value = this.settings.blur;
            blurControl.addEventListener('input', async (e) => {
                this.settings.blur = parseInt(e.target.value);
                await chrome.storage.local.set({ backgroundBlur: this.settings.blur });
                this.applyEffects();
            });
        }
        
        // 背景暗化控制
        const darkControl = document.getElementById('dark-control');
        if (darkControl) {
            darkControl.value = this.settings.dark;
            darkControl.addEventListener('input', async (e) => {
                this.settings.dark = parseInt(e.target.value);
                await chrome.storage.local.set({ backgroundDark: this.settings.dark });
                this.applyEffects();
            });
        }
    }

    /**
     * 处理自定义背景图片上传
     * @param {Event} e - 文件上传事件
     */
    async handleCustomBackground(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                this.settings.customImageData = event.target.result;
                this.settings.type = 'custom';  // 上传后立即切换到自定义图片
                
                await chrome.storage.local.set({ 
                    customImage: this.settings.customImageData,
                    bgType: 'custom'
                });
                
                await this.setImage();
                
                // 更新下拉框选项
                const bgTypeSelect = document.getElementById('bg-type');
                if (bgTypeSelect) {
                    bgTypeSelect.value = 'custom';
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Failed to handle custom background:', error);
        }
    }

    /**
     * 清除自定义背景图片
     * @returns {Promise<void>}
     */
    async clearCustomBackground() {
        this.settings.customImageData = null;
        this.settings.type = 'bing';  // 切换回必应背景
        
        await chrome.storage.local.set({ 
            customImage: null,
            bgType: 'bing'
        });
        
        await this.setImage();
        
        // 更新下拉框选项
        const bgTypeSelect = document.getElementById('bg-type');
        if (bgTypeSelect) {
            bgTypeSelect.value = 'bing';
        }
    }

    /**
     * 获取当前背景设置
     * @returns {Object} - 当前背景设置
     */
    getSettings() {
        return {...this.settings};
    }

    /**
     * 更新背景设置
     * @param {Object} newSettings - 新的背景设置
     * @returns {Promise<void>}
     */
    async updateSettings(newSettings) {
        this.settings = {...this.settings, ...newSettings};
        
        await chrome.storage.local.set({
            bgType: this.settings.type,
            backgroundBlur: this.settings.blur,
            backgroundDark: this.settings.dark
        });
        
        if (newSettings.customImageData) {
            await chrome.storage.local.set({ customImage: this.settings.customImageData });
        }
        
        await this.setImage();
    }

    /**
     * 刷新背景图片
     * 用于在标签页重新激活时更新背景图片
     */
    async refresh() {
        try {
            // 检查是否需要刷新背景图片
            if (this.settings.type !== 'bing') {
                // 非Bing背景不需要刷新
                return;
            }
            
            // 检查Bing图片缓存是否过期
            const cacheName = 'bingImageCache';
            const cacheData = await chrome.storage.local.get(cacheName);
            const now = Date.now();
            
            // 检查是否是新的一天（而不是仅仅12小时）
            // 获取缓存时间的日期部分
            let needRefresh = true;
            
            if (cacheData[cacheName]) {
                const cacheDate = new Date(cacheData[cacheName].timestamp);
                const currentDate = new Date(now);
                
                // 如果是同一天，不需要刷新
                if (cacheDate.getDate() === currentDate.getDate() && 
                    cacheDate.getMonth() === currentDate.getMonth() &&
                    cacheDate.getFullYear() === currentDate.getFullYear()) {
                    needRefresh = false;
                }
            }
            
            if (needRefresh) {
                // 强制清除缓存，获取新的Bing图片
                await chrome.storage.local.remove(cacheName);
                await this.setImage();
            }
        } catch (error) {
            console.error('刷新背景图片失败:', error);
        }
    }
}

// 创建并导出背景图片管理器实例
const backgroundManager = new BackgroundManager();

// 新的模块化API接口
export default backgroundManager;

// ========== 弃用API，将在未来版本移除 ==========

/**
 * 获取必应每日图片
 * @returns {Promise<string>} - 图片URL
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; await backgroundManager.fetchBingImage();
 */
export async function fetchBingImage() {
    console.warn('弃用警告: fetchBingImage() 函数已被弃用，请使用新的BackgroundManager API');
    return await backgroundManager.fetchBingImage();
}

/**
 * 初始化背景图像
 * @returns {Promise<void>}
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; await backgroundManager.initialize();
 */
export async function initBackgroundImage() {
    console.warn('弃用警告: initBackgroundImage() 函数已被弃用，请使用新的BackgroundManager API');
    await backgroundManager.initialize();
}

/**
 * 设置背景相关的事件处理
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; backgroundManager.setupEvents();
 */
export function setupBackgroundEvents() {
    console.warn('弃用警告: setupBackgroundEvents() 函数已被弃用，请使用新的BackgroundManager API');
    backgroundManager.setupEvents();
}

/**
 * 设置背景图像
 * @returns {Promise<void>}
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; await backgroundManager.setImage();
 */
export async function setBackgroundImage() {
    console.warn('弃用警告: setBackgroundImage() 函数已被弃用，请使用新的BackgroundManager API');
    await backgroundManager.setImage();
}

/**
 * 获取当前背景设置
 * @returns {Object} - 当前背景设置
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; backgroundManager.getSettings();
 */
export function getBackgroundSettings() {
    console.warn('弃用警告: getBackgroundSettings() 函数已被弃用，请使用新的BackgroundManager API');
    return backgroundManager.getSettings();
}

/**
 * 更新背景设置
 * @param {Object} newSettings - 新的背景设置
 * @returns {Promise<void>}
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; await backgroundManager.updateSettings(newSettings);
 */
export async function updateBackgroundSettings(newSettings) {
    console.warn('弃用警告: updateBackgroundSettings() 函数已被弃用，请使用新的BackgroundManager API');
    await backgroundManager.updateSettings(newSettings);
}

/**
 * 刷新背景图片
 * 用于在标签页重新激活时更新背景图片
 * @deprecated 请使用新的API: import backgroundManager from './backgroundImage.js'; await backgroundManager.refresh();
 */
export async function refreshBackgroundImage() {
    console.warn('弃用警告: refreshBackgroundImage() 函数已被弃用，请使用新的BackgroundManager API');
    await backgroundManager.refresh();
}