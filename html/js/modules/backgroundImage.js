/**
 * 背景图像处理模块
 */

import { Utils } from './utils.js';
import { I18n } from './i18n.js';

// 背景图片缓存相关常量
const CACHE_KEY = 'bingImageCache';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24小时缓存过期时间

/**
 * 背景图片管理器类
 */
class BackgroundManager {
    /**
     * 创建背景管理器实例
     */
    constructor() {
        // 背景图像默认设置
        this.settings = {
            type: 'bing',  // 默认使用必应作为背景
            customImageData: null, // 自定义图片数据
            blur: 0, // 模糊效果值
            dark: 0  // 暗化效果值
        };
    }

    /**
     * 初始化背景图像及控件
     * @returns {Promise<void>}
     */
    async initialize() {
        await this.loadSettings();
        await this.setImage();
        this.initControls();
        this.bindButtonEvent();
    }

    /**
     * 设置背景相关的事件处理
     */
    setupEvents() {
        this.bindButtonEvent();
        this.setupSettingsEvents();
    }

    /**
     * 设置背景设置面板的事件监听
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
        if (!bgButton) return;

        // 克隆按钮以清除已有的事件监听器
        const newButton = bgButton.cloneNode(true);
        if (bgButton.parentNode) {
            bgButton.parentNode.replaceChild(newButton, bgButton);
        }
        
        // 左键点击 - 切换背景类型
        newButton.addEventListener('click', async () => {
            // 根据是否有自定义图片决定切换类型
            if (this.settings.customImageData) {
                // 在bing和custom间切换
                this.settings.type = this.settings.type === 'bing' ? 'custom' : 'bing';
            } else {
                // 在bing和default间切换
                this.settings.type = this.settings.type === 'bing' ? 'default' : 'bing';
            }
            
            await chrome.storage.local.set({ bgType: this.settings.type });
            await this.setImage();
            
            // 更新选择器UI
            const bgTypeSelect = document.getElementById('bg-type');
            if (bgTypeSelect) {
                bgTypeSelect.value = this.settings.type;
            }
        });
        
        // 右键点击 - 上传自定义背景
        newButton.addEventListener('contextmenu', (e) => {
            e.preventDefault(); // 阻止默认右键菜单
            
            // 创建隐藏的文件选择器
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
                    await this.clearCustomBackground();
                }
                document.body.removeChild(fileInput);
            });
            
            // 监听取消选择
            fileInput.addEventListener('cancel', async () => {
                if (this.settings.customImageData) {
                    await this.clearCustomBackground();
                }
                document.body.removeChild(fileInput);
            });
            
            fileInput.click(); // 触发文件选择器
        });
    }

    /**
     * 从存储中加载背景设置
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
            
            // 根据是否有自定义图片决定可用的类型选择
            if (result.customImage) {
                this.settings.customImageData = result.customImage;
                this.settings.type = result.bgType === 'custom' ? 'custom' : 'bing';
            } else {
                this.settings.customImageData = null;
                this.settings.type = result.bgType === 'default' ? 'default' : 'bing';
            }
            
            // 加载特效设置
            this.settings.blur = result.backgroundBlur !== undefined ? result.backgroundBlur : 0;
            this.settings.dark = result.backgroundDark !== undefined ? result.backgroundDark : 0;
        } catch (error) {
            console.error('加载背景设置失败:', error);
            this.settings.type = 'bing'; // 默认使用必应
        }
    }

    /**
     * 设置背景图像
     * @returns {Promise<void>}
     */
    async setImage() {
        try {
            const container = document.getElementById('background-container');
            if (!container) {
                console.error('无法找到背景容器元素: background-container');
                return;
            }
            
            let bgUrl = '';
            
            // 根据类型设置背景
            switch(this.settings.type) {
                case 'custom':
                    bgUrl = this.settings.customImageData || 'images/default.jpg';
                    break;
                case 'bing':
                    try {
                        bgUrl = await this.fetchBingImage();
                    } catch (error) {
                        console.error('获取必应图片失败:', error);
                        Utils.UI.showErrorMessage(I18n.getMessage('bingImageError') + error.message);
                        bgUrl = 'images/default.jpg'; // 失败时使用默认图
                    }
                    break;
                case 'default':
                    // 设置为白色背景
                    container.style.backgroundImage = 'none';
                    container.style.backgroundColor = '#ffffff';
                    return; // 直接返回，无需后续设置
            }

            // 应用背景样式 - 移除内联样式，使用预定义的CSS样式
            container.style.backgroundImage = `url(${bgUrl})`;
            
            // 应用模糊和暗化效果
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
     * 应用模糊和暗化效果到背景
     */
    applyEffects() {
        const container = document.getElementById('background-container');
        if (!container) return;
        
        // 模糊效果
        container.style.filter = this.settings.blur > 0 ? `blur(${this.settings.blur}px)` : 'none';
        
        // 暗化效果
        const overlay = document.getElementById('background-overlay');
        if (overlay) {
            if (this.settings.dark > 0) {
                overlay.style.backgroundColor = `rgba(0, 0, 0, ${this.settings.dark / 100})`;
                overlay.style.display = 'block';
            } else {
                overlay.style.display = 'none'; // 无暗化时隐藏遮罩
            }
        }
    }

    /**
     * 获取必应每日图片
     * @returns {Promise<string>} 图片URL
     */
    async fetchBingImage() {
        // 检查缓存
        const cachedData = await chrome.storage.local.get(CACHE_KEY);
        const now = Date.now();

        // 使用缓存内图片（如未过期）
        if (cachedData[CACHE_KEY] && (now - cachedData[CACHE_KEY].timestamp < CACHE_EXPIRATION)) {
            return cachedData[CACHE_KEY].imageUrl;
        }

        // 获取新图片
        const data = await Utils.fetchData('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');
        const imageUrl = `https://www.bing.com${data.images[0].url}`;

        // 更新缓存
        await chrome.storage.local.set({ [CACHE_KEY]: { imageUrl, timestamp: now } });

        return imageUrl;
    }

    /**
     * 获取Unsplash随机图片
     * @returns {Promise<string>} 图片数据URL
     */
    async getUnsplashImage() {
        try {
            const cacheName = 'unsplashImageCache';
            const cacheData = await chrome.storage.local.get(cacheName);
            const now = Date.now();
            const cacheExpiration = 24 * 60 * 60 * 1000; // 24小时
            
            // 返回缓存的图片（如果未过期）
            if (cacheData[cacheName] && (now - cacheData[cacheName].timestamp < cacheExpiration)) {
                return cacheData[cacheName].imageData;
            }
            
            // 获取新图片
            const imageUrl = 'https://source.unsplash.com/random/1920x1080/?nature,landscape';
            const imgResponse = await fetch(imageUrl);
            const blob = await imgResponse.blob();
            const base64Data = await Utils.blobToBase64(blob);
            
            // 更新缓存
            await chrome.storage.local.set({ 
                [cacheName]: {
                    imageData: base64Data,
                    timestamp: now
                }
            });
            
            return base64Data;
        } catch (error) {
            console.error('获取Unsplash图片失败:', error);
            return 'images/default.jpg'; // 失败时返回默认图片
        }
    }

    /**
     * 初始化背景控制UI并绑定事件
     */
    initControls() {
        // 背景类型选择器
        const bgTypeSelect = document.getElementById('bg-type');
        if (bgTypeSelect) {
            bgTypeSelect.value = this.settings.type;
            bgTypeSelect.addEventListener('change', async (e) => {
                this.settings.type = e.target.value;
                await chrome.storage.local.set({ bgType: this.settings.type });
                await this.setImage();
            });
        }
        
        // 自定义背景上传按钮
        const customBgInput = document.getElementById('custom-bg');
        if (customBgInput) {
            customBgInput.addEventListener('change', e => this.handleCustomBackground(e));
        }
        
        // 模糊效果控制
        const blurControl = document.getElementById('blur-control');
        if (blurControl) {
            blurControl.value = this.settings.blur;
            blurControl.addEventListener('input', async (e) => {
                this.settings.blur = parseInt(e.target.value);
                await chrome.storage.local.set({ backgroundBlur: this.settings.blur });
                this.applyEffects();
            });
        }
        
        // 暗化效果控制
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
     * @returns {Promise<void>}
     */
    async handleCustomBackground(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // 使用FileReader读取文件为DataURL
            const reader = new FileReader();
            reader.onload = async (event) => {
                this.settings.customImageData = event.target.result;
                this.settings.type = 'custom';  // 自动切换到自定义背景
                
                // 保存设置
                await chrome.storage.local.set({ 
                    customImage: this.settings.customImageData,
                    bgType: 'custom'
                });
                
                await this.setImage();
                
                // 更新UI
                const bgTypeSelect = document.getElementById('bg-type');
                if (bgTypeSelect) {
                    bgTypeSelect.value = 'custom';
                }
            };
            reader.readAsDataURL(file); // 开始读取文件
        } catch (error) {
            console.error('处理自定义背景失败:', error);
        }
    }

    /**
     * 清除自定义背景图片
     * @returns {Promise<void>}
     */
    async clearCustomBackground() {
        // 重置设置
        this.settings.customImageData = null;
        this.settings.type = 'bing';
        
        // 保存到存储
        await chrome.storage.local.set({ 
            customImage: null,
            bgType: 'bing'
        });
        
        // 应用更改
        await this.setImage();
        
        // 更新UI
        const bgTypeSelect = document.getElementById('bg-type');
        if (bgTypeSelect) {
            bgTypeSelect.value = 'bing';
        }
    }

    /**
     * 获取当前背景设置
     * @returns {Object} 当前背景设置的副本
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
        // 合并设置
        this.settings = {...this.settings, ...newSettings};
        
        // 保存基本设置
        await chrome.storage.local.set({
            bgType: this.settings.type,
            backgroundBlur: this.settings.blur,
            backgroundDark: this.settings.dark
        });
        
        // 保存自定义图片（如果有）
        if (newSettings.customImageData) {
            await chrome.storage.local.set({ customImage: this.settings.customImageData });
        }
        
        // 应用更改
        await this.setImage();
    }

    /**
     * 刷新背景图片（在标签页重新激活时调用）
     * @returns {Promise<void>}
     */
    async refresh() {
        try {
            // 仅对必应背景执行刷新
            if (this.settings.type !== 'bing') return;
            
            // 检查是否需要刷新（是否是新的一天）
            const cacheName = CACHE_KEY;
            const cacheData = await chrome.storage.local.get(cacheName);
            const now = Date.now();
            
            let needRefresh = true;
            
            if (cacheData[cacheName]) {
                // 判断日期是否相同
                const cacheDate = new Date(cacheData[cacheName].timestamp);
                const currentDate = new Date(now);
                
                // 同一天则不刷新
                if (cacheDate.getDate() === currentDate.getDate() && 
                    cacheDate.getMonth() === currentDate.getMonth() &&
                    cacheDate.getFullYear() === currentDate.getFullYear()) {
                    needRefresh = false;
                }
            }
            
            if (needRefresh) {
                // 清除缓存，获取新图片
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

export default backgroundManager;

