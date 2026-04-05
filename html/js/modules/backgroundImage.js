/**
 * 背景图片处理模块
 * 提供背景图片的加载、切换、缓存、设置等功能
 * @module BackgroundManager
 */

import { Utils, Menu, I18n, Notification } from './core/index.js';

// 背景图片缓存相关常量
const CACHE_KEY = 'bingImageCache';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24小时缓存过期时间

/**
 * 背景图片管理器类
 * @class
 */
class BackgroundManager {
    /**
     * 创建背景管理器实例
     * @constructor
     */
    constructor() {
        // 背景图像默认设置
        this.settings = {
            type: 'bing',  // 默认使用必应作为背景
            customImageData: null, // 自定义图片数据
            blur: 0, // 模糊效果值
            dark: 0  // 暗化效果值
        };
        
        // 队列管理
        this.queue = [];
        this.isProcessing = false;
        
        // 缓存更新标志
        this.isUpdatingCache = false;
    }
    
    /**
     * 将任务添加到队列
     * @param {Function} task - 要执行的任务
     * @returns {Promise} 任务执行结果
     */
    async queueTask(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }
    
    /**
     * 处理队列中的任务
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }
        
        this.isProcessing = true;
        const { task, resolve, reject } = this.queue.shift();
        
        try {
            const result = await task();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.isProcessing = false;
            if (this.queue.length > 0) {
                this.processQueue();
            }
        }
    }

    /**
     * 初始化背景图片及控件
     * @returns {Promise<void>} 无
     */
    async initialize() {        // 创建背景容器
        if (!document.querySelector('.bg-container')) {
            const bgContainer = Utils.createElement('div');
            bgContainer.className = 'bg-container';
            document.body.appendChild(bgContainer);
        }
        
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
                const newType = e.target.value;
                
                // 如果选择了自定义背景，但没有自定义图片，则打开选择器
                if (newType === 'custom' && !this.settings.customImageData) {
                    this.handleCustomBackground();
                    return;
                }
                
                // 更新设置并应用
                this.settings.type = newType;
                
                // 如果切换到非自定义类型，则保存为最后一个非自定义类型
                if (newType !== 'custom') {
                    await chrome.storage.local.set({ lastNonCustomBgType: newType });
                }
                
                await chrome.storage.local.set({ bgType: newType });
                await this.setImage();
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
            try {
                let imageUrl = null;
                
                // 根据是否有自定义图片决定切换类型
                if (this.settings.customImageData) {
                    // 在bing和custom间切换
                    this.settings.type = this.settings.type === 'bing' ? 'custom' : 'bing';
                    
                    // 根据新类型获取图片URL
                    if (this.settings.type === 'custom') {
                        imageUrl = this.settings.customImageData;
                    } else if (this.settings.type === 'bing') {
                        imageUrl = await this.fetchBingImage();
                    }
                    
                    // 如果切换到非custom类型，保存为最后一个非自定义类型
                    if (this.settings.type !== 'custom') {
                        await chrome.storage.local.set({ lastNonCustomBgType: this.settings.type });
                    }
                } else {
                    // 在bing和default间切换
                    this.settings.type = this.settings.type === 'bing' ? 'default' : 'bing';
                    
                    // 获取图片URL
                    if (this.settings.type === 'bing') {
                        imageUrl = await this.fetchBingImage();
                    }
                    
                    // 保存当前非自定义类型
                    await chrome.storage.local.set({ lastNonCustomBgType: this.settings.type });
                }
                
                await chrome.storage.local.set({ bgType: this.settings.type });
                
                // 使用渐变效果切换背景
                this.switchBackgroundWithFade(imageUrl);
                
                // 更新选择器UI
                const bgTypeSelect = document.getElementById('bg-type');
                if (bgTypeSelect) {
                    bgTypeSelect.value = this.settings.type;
                }
            } catch (error) {
                console.error('背景切换失败:', error);
                Notification.notify({
                    title: I18n.getMessage('error', '错误'),
                    message: I18n.getMessage('backgroundSwitchFailed', '背景切换失败'),
                    type: 'error',
                    duration: 3000
                });
            }
        });
        
        // 右键点击 - 使用通用图像选择器
        newButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.handleCustomBackground();
        });
    }

    /**
     * 从存储中加载背景设置
     * @returns {Promise<void>} 无
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
                this.settings.type = result.bgType || 'custom';
            } else {
                this.settings.customImageData = null;
                this.settings.type = result.bgType || 'bing';
                
                // 如果没有自定义图片但类型设为custom，则改为上次的非自定义类型
                if (this.settings.type === 'custom') {
                    this.settings.type = result.lastNonCustomBgType || 'bing';
                }
            }
            
            // 加载特效设置
            this.settings.blur = result.backgroundBlur !== undefined ? result.backgroundBlur : 0;
            this.settings.dark = result.backgroundDark !== undefined ? result.backgroundDark : 0;
        } catch (error) {
            console.error(I18n.getMessage('localStorageError'), error);
            this.settings.type = 'bing'; 
        }
    }

    /**
     * 获取必应每日图片
     * @returns {Promise<string|null>} 图片URL，失败返回null
     */
    async fetchBingImage() {
        try {
            Notification.updateLoadingProgress(40, I18n.getMessage('loadingResources', '加载资源中'));
            
            // 检查缓存
            const cachedData = await chrome.storage.local.get(CACHE_KEY);
            const now = Date.now();

            // 检查是否有缓存数据（无论是否过期）
            const hasCache = cachedData[CACHE_KEY];
            const isCacheValid = hasCache && (now - cachedData[CACHE_KEY].timestamp < CACHE_EXPIRATION);

            // 如果有缓存（即使过期），先返回缓存的URL
            if (hasCache) {
                // 如果缓存已过期，在后台异步更新缓存
                if (!isCacheValid) {
                    this.updateBingImageCache().catch(error => {
                        console.error('后台更新必应图片缓存失败:', error);
                    });
                }
                return cachedData[CACHE_KEY].url;
            }

            // 如果没有缓存，同步获取新图片
            Notification.updateLoadingProgress(50, I18n.getMessage('fetchingBingImage', '获取必应图片'));
            
            // 必应API地址
            const apiUrl = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1';
            
            // 使用Utils.fetchData替代原生fetch
            const data = await Utils.fetchData(apiUrl);
            
            if (!data.images || !data.images.length) {
                throw new Error('No images found in API response');
            }
            
            const imageUrl = 'https://www.bing.com' + data.images[0].url;
            
            // 更新缓存
            await chrome.storage.local.set({
                [CACHE_KEY]: {
                    url: imageUrl,
                    timestamp: now
                }
            });
            
            return imageUrl;
        } catch (error) {
            console.error('Error fetching Bing image:', error);
            
            // 显示更友好的错误通知
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('bingImageFetchFailed', '获取必应每日图片失败'),
                type: 'warning',
                duration: 4000
            });
            
            // 回退策略：尝试使用上一个缓存（即使过期）
            const cachedData = await chrome.storage.local.get(CACHE_KEY);
            if (cachedData[CACHE_KEY]) {
                return cachedData[CACHE_KEY].url;
            }
            
            return null;
        }
    }
    
    /**
     * 后台更新必应图片缓存
     * @returns {Promise<void>}
     */
    async updateBingImageCache() {
        // 防止并发更新
        if (this.isUpdatingCache) {
            return;
        }
        
        this.isUpdatingCache = true;
        
        try {
            // 必应API地址
            const apiUrl = 'https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1';
            
            // 使用Utils.fetchData替代原生fetch
            const data = await Utils.fetchData(apiUrl);
            
            if (!data.images || !data.images.length) {
                throw new Error('No images found in API response');
            }
            
            const imageUrl = 'https://www.bing.com' + data.images[0].url;
            const now = Date.now();
            
            // 更新缓存
            await chrome.storage.local.set({
                [CACHE_KEY]: {
                    url: imageUrl,
                    timestamp: now
                }
            });
            
            console.log('必应图片缓存已后台更新');
        } catch (error) {
            console.error('后台更新必应图片缓存失败:', error);
        } finally {
            this.isUpdatingCache = false;
        }
    }

    /**
     * 设置背景图像
     * @returns {Promise<void>}
     */
    async setImage() {
        return this.queueTask(async () => {
            try {
                // 显示加载指示器
                Notification.showLoadingIndicator();
                Notification.updateLoadingProgress(10, I18n.getMessage('loadingBackground', '加载背景中'));
                
                // 获取背景容器元素
                const container = document.getElementById('background-container');
                if (!container) {
                    console.error('Background container not found');
                    Notification.hideLoadingIndicator();
                    return;
                }

                Notification.updateLoadingProgress(20, I18n.getMessage('preparingBackground', '准备背景'));
                
                // 根据背景类型选择图片URL
                let bgUrl;
                switch (this.settings.type) {
                    case 'custom':
                        // 使用自定义图片
                        if (this.settings.customImageData) {
                            bgUrl = this.settings.customImageData;
                            Notification.updateLoadingProgress(60, I18n.getMessage('loadingCustomBackground', '加载自定义背景'));
                        } else {
                            // 如果没有自定义图片数据，则回退到必应
                            bgUrl = await this.fetchBingImage();
                        }
                        break;
                    case 'bing':
                        // 使用必应每日图片
                        bgUrl = await this.fetchBingImage();
                        break;
                    case 'default':
                    default:
                        // 使用纯白色背景
                        container.classList.add('bg-white');
                        container.style.backgroundImage = 'none';
                        
                        Notification.updateLoadingProgress(100, I18n.getMessage('backgroundLoadComplete', '背景加载完成'));
                        setTimeout(() => Notification.hideLoadingIndicator(), 500);
                        return;
                }

                // 如果bgUrl为null（表示获取图像失败），回退到白色背景
                if (bgUrl === null) {
                    console.warn('Failed to load background image, fallback to white background');
                    container.classList.add('bg-white');
                    container.style.backgroundImage = 'none';
                    Notification.hideLoadingIndicator();
                    return;
                }

                Notification.updateLoadingProgress(80, I18n.getMessage('applyingBackground', '应用背景'));
                
                // 移除白色背景类（如果有）
                container.classList.remove('bg-white');
                
                // 预加载图片
                Notification.updateLoadingProgress(70, I18n.getMessage('preloadingBackground', '预加载背景图片'));
                const preloadSuccess = await this.preloadImage(bgUrl);
                
                if (!preloadSuccess) {
                    console.warn('背景图片预加载失败，回退到白色背景');
                    container.classList.add('bg-white');
                    container.style.backgroundImage = 'none';
                    Notification.hideLoadingIndicator();
                    return;
                }
                
                // 应用背景样式
                container.style.backgroundImage = `url(${bgUrl})`;
                
                // 应用模糊和暗化效果
                this.applyEffects();
                
                Notification.updateLoadingProgress(100, I18n.getMessage('backgroundLoadComplete', '背景加载完成'));
                setTimeout(() => Notification.hideLoadingIndicator(), 500);
            } catch (error) {
                console.error('Failed to set background image:', error);
                Notification.hideLoadingIndicator(true); // 强制关闭加载指示器
                Notification.notify({
                    title: I18n.getMessage('error', '错误'),
                    message: I18n.getMessage('backgroundSetFailed', '设置背景失败'),
                    type: 'error',
                    duration: 5000
                });
            }
        });
    }

    /**
     * 预加载图片
     * @param {string} url - 图片URL
     * @returns {Promise<boolean>} 加载是否成功
     */
    preloadImage(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => {
                console.error('图片预加载失败:', url);
                resolve(false);
            };
            img.src = url;
            
            // 如果图片已经缓存，onload可能不会触发
            if (img.complete) {
                resolve(true);
            }
        });
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
            const opacity = this.settings.dark > 0 ? this.settings.dark : 0;
            overlay.style.backgroundColor = `rgba(0, 0, 0, ${opacity})`;
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
        }
        
        // 自定义背景上传按钮
        const customBgInput = document.getElementById('custom-bg');
        if (customBgInput) {
            customBgInput.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleCustomBackground();
            });
        }
        
        // 模糊效果控制
        const blurControl = document.getElementById('blur-control');
        if (blurControl) {
            blurControl.value = this.settings.blur;
        }
        
        // 暗化效果控制
        const darkControl = document.getElementById('dark-control');
        if (darkControl) {
            darkControl.value = this.settings.dark;
        }
    }

    /**
     * 检查图片大小是否超出存储限制
     * @param {string} imageData - 图片的base64数据
     * @returns {boolean} 是否超出限制
     */
    isImageTooLarge(imageData) {
        // 计算base64字符串的字节大小（每个base64字符约等于0.75字节）
        const byteSize = (imageData.length * 3) / 4;
        // 设置4MB的限制（留一些余量）
        const MAX_SIZE = 4 * 1024 * 1024;
        return byteSize > MAX_SIZE;
    }
    
    /**
     * 压缩图片
     * @param {string} imageData - 图片的base64数据
     * @param {number} quality - 压缩质量 (0-1)
     * @returns {Promise<string>} 压缩后的图片base64数据
     */
    compressImage(imageData, quality = 0.7) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const img = new Image();
            
            img.onload = () => {
                // 设置画布大小
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 绘制图片
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // 压缩并转换为base64
                const compressedData = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedData);
            };
            
            img.onerror = () => {
                // 如果压缩失败，返回原始数据
                resolve(imageData);
            };
            
            img.src = imageData;
        });
    }
    
    /**
     * 处理自定义背景图片上传
     */
    handleCustomBackground() {
        Menu.ImageSelector.show({
            title: I18n.getMessage('selectBackground', '选择背景图片'),
            modalId: 'background-selector-modal',
            mode: 'background',
            urlLabel: I18n.getMessage('backgroundUrl', '背景图片URL'),
            uploadLabel: I18n.getMessage('uploadBackground', '上传背景图片'),
            urlPlaceholder: 'https://example.com/background.jpg',
            showReset: this.settings.customImageData !== null,
            resetText: I18n.getMessage('resetBackground', '重置背景'),
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 0.85,
            onReset: () => this.clearCustomBackground(),
            onShow: () => {
                // 在模态框显示后执行的操作
                const preview = document.getElementById('background-selector-modal-preview');
                
                // 如果已有自定义背景，则显示当前背景预览
                if (this.settings.customImageData && preview) {
                    preview.innerHTML = `
                        <div class="browser-frame"></div>
                        <img src="${this.settings.customImageData}" alt="Current Background" class="preview-bg-img">
                    `;
                }
            },
            onConfirm: async (imageData) => {
                if (imageData) {
                    try {
                        // 检查图片大小
                        if (this.isImageTooLarge(imageData)) {
                            // 压缩图片
                            Notification.notify({
                                title: I18n.getMessage('info', '提示'),
                                message: '图片过大，正在压缩...',
                                type: 'info',
                                duration: 2000
                            });
                            
                            imageData = await this.compressImage(imageData, 0.7);
                            
                            // 再次检查大小
                            if (this.isImageTooLarge(imageData)) {
                                Notification.notify({
                                    title: I18n.getMessage('error', '错误'),
                                    message: '图片仍然过大，请选择更小的图片',
                                    type: 'error',
                                    duration: 5000
                                });
                                return;
                            }
                        }
                        
                        this.settings.customImageData = imageData;
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
                        
                        Notification.notify({
                            title: I18n.getMessage('success', '成功'),
                            message: I18n.getMessage('customBackgroundSuccess', '背景图片设置成功'),
                            type: 'success',
                            duration: 3000
                        });
                    } catch (error) {
                        console.error(I18n.getMessage('localStorageError'), error);
                        
                        // 区分存储配额错误和其他错误
                        if (error.message && error.message.includes('quota')) {
                            Notification.notify({
                                title: I18n.getMessage('error', '错误'),
                                message: '存储配额不足，请选择更小的图片或清除其他数据',
                                type: 'error',
                                duration: 5000
                            });
                        } else {
                            Notification.notify({
                                title: I18n.getMessage('error', '错误'),
                                message: I18n.getMessage('backgroundSetFailed', '背景图片设置失败'),
                                type: 'error',
                                duration: 5000
                            });
                        }
                    }
                }
            }
        });
    }

    /**
     * 清除自定义背景图片
     * @returns {Promise<void>}
     */
    async clearCustomBackground() {
        try {
            // 清除自定义图片数据
            this.settings.customImageData = null;
            
            // 切换到之前的非自定义背景类型
            const result = await chrome.storage.local.get('lastNonCustomBgType');
            this.settings.type = result.lastNonCustomBgType || 'bing';
            
            // 保存更改
            await chrome.storage.local.set({
                customImage: null,
                bgType: this.settings.type
            });
            
            // 重新加载背景
            await this.setImage();
            
            // 更新UI
            const bgTypeSelect = document.getElementById('bg-type');
            if (bgTypeSelect) {
                bgTypeSelect.value = this.settings.type;
            }
            
            Notification.notify({
                title: I18n.getMessage('success', '成功'),
                message: I18n.getMessage('backgroundResetSuccess', '已重置为默认背景'),
                type: 'success',
                duration: 3000
            });
        } catch (error) {
            console.error('Failed to clear custom background:', error);
            Notification.notify({
                title: I18n.getMessage('error', '错误'),
                message: I18n.getMessage('backgroundResetFailed', '背景重置失败'),
                type: 'error',
                duration: 5000
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
            await chrome.storage.local.set({
                customImage: newSettings.customImageData
            });
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
            // 如果是必应背景，检查缓存是否过期
            if (this.settings.type === 'bing') {
                const cachedData = await chrome.storage.local.get(CACHE_KEY);
                const now = Date.now();
                
                // 如果缓存已过期，重新加载背景
                if (!cachedData[CACHE_KEY] || (now - cachedData[CACHE_KEY].timestamp > CACHE_EXPIRATION)) {
                    await this.setImage();
                }
            }
        } catch (error) {
            console.error('Error refreshing background:', error);
        }
    }
    
    /**
     * 背景切换渐变效果实现
     * @param {string} newBackgroundUrl - 新背景图片的URL
     */
    switchBackgroundWithFade(newBackgroundUrl) {
        // 处理背景URL问题
        if (!newBackgroundUrl && this.settings.type === 'custom' && this.settings.customImageData) {
            newBackgroundUrl = this.settings.customImageData;
        }
        
        const currentBg = document.getElementById('background-container');
        if (!currentBg) return;
        
        // 切换到纯白背景的情况
        if (this.settings.type === 'default') {
            currentBg.style.transition = 'opacity 0.5s ease';
            currentBg.style.opacity = '0';
            
            setTimeout(() => {
                currentBg.classList.add('bg-white');
                currentBg.style.backgroundImage = 'none';
                currentBg.style.opacity = '1';
            }, 500);
            return;
        }
        
        // 预加载新背景图片
        const img = new Image();
        
        // 创建一个Promise来处理图片加载
        const loadImage = new Promise((resolve) => {
            img.onload = () => resolve(true);
            img.onerror = () => {
                console.error('背景图片加载失败:', newBackgroundUrl);
                resolve(false);
            };
            img.src = newBackgroundUrl;
            
            // 如果图片已经缓存，onload可能不会触发
            if (img.complete) resolve(true);
        });
        
        // 使用Promise处理背景切换
        loadImage.then(success => {
            if (!success) {
                Notification.notify({
                    title: I18n.getMessage('error', '错误'),
                    message: I18n.getMessage('backgroundImageLoadFailed', '背景图片加载失败'),
                    type: 'error',
                    duration: 3000
                });
                return;
            }
            
            // 创建临时背景层
            const tempBg = Utils.createElement('div');
            tempBg.className = 'background-temp';
            tempBg.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-image: url('${newBackgroundUrl}');
                background-size: cover;
                background-position: center;
                z-index: -2;
                opacity: 0;
                transition: opacity 0.6s ease;
            `;
            document.body.appendChild(tempBg);
            
            // 确保DOM渲染完成后再执行淡入淡出
            requestAnimationFrame(() => {
                // 1. 淡入临时背景
                tempBg.style.opacity = '1';
                
                // 2. 在临时背景完全显示后，更新实际背景并移除临时元素
                setTimeout(() => {
                    // 更新实际背景
                    currentBg.style.backgroundImage = `url('${newBackgroundUrl}')`;
                    currentBg.classList.remove('bg-white');
                    
                    // 淡出并移除临时背景
                    setTimeout(() => {
                        tempBg.style.opacity = '0';
                        
                        // 等待淡出完成后移除临时元素
                        setTimeout(() => {
                            if (document.body.contains(tempBg)) {
                                document.body.removeChild(tempBg);
                            }
                        }, 600);
                    }, 100);
                }, 600);
            });
        });
    }
}

export { BackgroundManager };
// 创建并导出背景图片管理器实例
const backgroundManager = new BackgroundManager();

export default backgroundManager;