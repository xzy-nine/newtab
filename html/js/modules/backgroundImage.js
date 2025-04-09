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
                // 保存旧的背景类型
                const oldType = this.settings.type;
                this.settings.type = e.target.value;
                
                // 如果切换到非自定义类型，记录该类型
                if (this.settings.type !== 'custom') {
                    await chrome.storage.local.set({ lastNonCustomBgType: this.settings.type });
                }
                
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
            // 保存旧的背景类型
            const oldType = this.settings.type;
            
            // 根据是否有自定义图片决定切换类型
            if (this.settings.customImageData) {
                // 在bing和custom间切换
                this.settings.type = this.settings.type === 'bing' ? 'custom' : 'bing';
                
                // 如果切换到非custom类型，保存为最后一个非自定义类型
                if (this.settings.type !== 'custom') {
                    await chrome.storage.local.set({ lastNonCustomBgType: this.settings.type });
                }
            } else {
                // 在bing和default间切换
                this.settings.type = this.settings.type === 'bing' ? 'default' : 'bing';
                
                // 保存当前非自定义类型
                await chrome.storage.local.set({ lastNonCustomBgType: this.settings.type });
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
                'backgroundDark',
                'lastNonCustomBgType'
            ]);
            
            // 根据是否有自定义图片决定可用的类型选择
            if (result.customImage) {
                this.settings.customImageData = result.customImage;
                this.settings.type = result.bgType === 'custom' ? 'custom' : 'bing';
            } else {
                this.settings.customImageData = null;
                // 使用保存的背景类型或默认值
                this.settings.type = result.bgType || 'bing';
            }
            
            // 加载特效设置
            this.settings.blur = result.backgroundBlur !== undefined ? result.backgroundBlur : 0;
            this.settings.dark = result.backgroundDark !== undefined ? result.backgroundDark : 0;
        } catch (error) {
            console.error('加载背景设置失败:', error);
            this.settings.type = 'bing'; 
        }
    }

    /**
     * 设置背景图像
     * @returns {Promise<void>}
     */
    async setImage() {
        try {
            // 显示加载指示器
            Utils.UI.showLoadingIndicator();
            Utils.UI.updateLoadingProgress(10, '正在准备背景图片...');
            
            // 获取背景容器元素
            const container = document.getElementById('background-container');
            if (!container) {
                Utils.UI.hideLoadingIndicator();
                return;
            }

            // 根据背景类型选择图片URL
            let bgUrl;
            switch (this.settings.type) {
                case 'bing':
                    Utils.UI.updateLoadingProgress(30, '正在获取必应每日图片...');
                    bgUrl = await this.fetchBingImage();
                    break;
                case 'custom':
                    bgUrl = this.settings.customImageData;
                    break;
                case 'default':
                    // 设置为白色背景
                    container.classList.add('bg-white');
                    Utils.UI.hideLoadingIndicator();
                    return; // 直接返回，无需后续设置
                default:
                    bgUrl = 'images/default.jpg';
            }

            Utils.UI.updateLoadingProgress(70, '正在应用背景...');
            
            // 移除白色背景类（如果有）
            container.classList.remove('bg-white');
            
            // 应用背景样式
            container.style.backgroundImage = `url(${bgUrl})`;
            
            // 应用模糊和暗化效果
            this.applyEffects();
            
            Utils.UI.updateLoadingProgress(100, '背景设置完成');
            setTimeout(() => Utils.UI.hideLoadingIndicator(), 500);
        } catch (error) {            
            Utils.UI.showErrorMessage('背景图片加载失败，使用默认背景');
            
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
            // 使用工具方法
            this.settings.customImageData = await Utils.blobToBase64(file);
            this.settings.type = 'custom';  // 自动切换到自定义背景
            
            // 保存设置
            await chrome.storage.local.set({ 
                customImage: this.settings.customImageData,
                bgType: 'custom',
                lastNonCustomBgType: this.settings.type
            });
            
            await this.setImage();
            
            // 更新UI
            const bgTypeSelect = document.getElementById('bg-type');
            if (bgTypeSelect) {
                bgTypeSelect.value = 'custom';
            }
        } catch (error) {
            console.error('处理自定义背景失败:', error);
            Utils.UI.notify({
                title: '背景设置错误',
                message: '无法加载自定义背景图片',
                type: 'error'
            });
        }
    }

    /**
     * 清除自定义背景图片
     * @returns {Promise<void>}
     */
    async clearCustomBackground() {
        try {
            // 重置设置 - 回退到用户之前选择的背景类型或默认背景
            this.settings.customImageData = null;
            
            // 获取上次保存的背景类型
            const result = await chrome.storage.local.get(['lastNonCustomBgType']);
            // 如果有上次记录的类型则使用，否则默认使用bing
            this.settings.type = result.lastNonCustomBgType || 'bing';
            
            // 保存到存储
            await chrome.storage.local.set({ 
                customImage: null,
                bgType: this.settings.type
            });
            
            // 应用更改
            await this.setImage();
            
            // 更新UI
            const bgTypeSelect = document.getElementById('bg-type');
            if (bgTypeSelect) {
                bgTypeSelect.value = this.settings.type;
            }
            
            // 提示用户操作成功
            Utils.UI.notify({
                title: '已移除自定义背景',
                message: '已切换到' + (this.settings.type === 'bing' ? '必应每日图片' : '默认背景'),
                type: 'info',
                duration: 3000
            });
        } catch (error) {
            Utils.UI.notify({
                title: '操作失败',
                message: '无法清除自定义背景图片',
                type: 'error'
            });
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

