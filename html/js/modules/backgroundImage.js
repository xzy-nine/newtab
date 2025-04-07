/**
 * 背景图像处理模块
 */

import { fetchData, blobToBase64 } from './utils.js';
import { getI18nMessage } from './i18n.js';

// 背景图像设置
let bgSettings = {
    type: 'bing',  // 默认使用必应作为背景
    customImageData: null,
    blur: 0,
    dark: 0
};

// 从background.js移动过来的常量和函数
const CACHE_KEY = 'bingImageCache';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours

/**
 * 获取必应每日图片
 * @returns {Promise<string>} - 图片URL
 */
export async function fetchBingImage() {
    const cachedData = await chrome.storage.local.get(CACHE_KEY);
    const now = Date.now();

    if (cachedData[CACHE_KEY] && (now - cachedData[CACHE_KEY].timestamp < CACHE_EXPIRATION)) {
        return cachedData[CACHE_KEY].imageUrl;
    }

    const data = await fetchData('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1');
    const imageUrl = `https://www.bing.com${data.images[0].url}`;

    await chrome.storage.local.set({ [CACHE_KEY]: { imageUrl, timestamp: now } });

    return imageUrl;
}

/**
 * 初始化背景图像
 * @returns {Promise<void>}
 */
export async function initBackgroundImage() {
    // 加载背景设置
    await loadBackgroundSettings();

    // 设置背景图像
    await setBackgroundImage();

    // 初始化背景图像控制UI
    initBackgroundControls();
    
    // 绑定背景按钮事件
    bindBackgroundButtonEvent();
}

/**
 * 设置背景相关的事件处理
 * 在初始化之后调用此函数以确保所有事件正确绑定
 */
export function setupBackgroundEvents() {
    // 确保背景按钮事件被绑定
    bindBackgroundButtonEvent();
    
    // 设置背景设置面板的事件
    setupBackgroundSettingsEvents();
    
    console.log('Background events setup complete');
}

/**
 * 设置背景设置面板的事件
 */
function setupBackgroundSettingsEvents() {
    // 背景类型选择
    const bgTypeSelect = document.getElementById('bg-type');
    if (bgTypeSelect) {
        bgTypeSelect.addEventListener('change', async (e) => {
            bgSettings.type = e.target.value;
            await chrome.storage.local.set({ bgType: bgSettings.type });
            await setBackgroundImage();
        });
    }
    
    // 模糊效果滑块
    const blurControl = document.getElementById('blur-control');
    if (blurControl) {
        blurControl.addEventListener('input', async (e) => {
            bgSettings.blur = parseInt(e.target.value);
            await chrome.storage.local.set({ backgroundBlur: bgSettings.blur });
            applyBackgroundEffects();
        });
    }
    
    // 暗化效果滑块
    const darkControl = document.getElementById('dark-control');
    if (darkControl) {
        darkControl.addEventListener('input', async (e) => {
            bgSettings.dark = parseInt(e.target.value);
            await chrome.storage.local.set({ backgroundDark: bgSettings.dark });
            applyBackgroundEffects();
        });
    }
}

/**
 * 绑定背景按钮事件
 */
function bindBackgroundButtonEvent() {
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
            if (bgSettings.customImageData) {
                // 有自定义图片时，在bing和custom之间切换
                bgSettings.type = bgSettings.type === 'bing' ? 'custom' : 'bing';
            } else {
                // 没有自定义图片时，在bing和default之间切换
                bgSettings.type = bgSettings.type === 'bing' ? 'default' : 'bing';
            }
            
            // 保存设置
            await chrome.storage.local.set({ bgType: bgSettings.type });
            
            // 应用新背景
            await setBackgroundImage();
            
            // 更新任何背景类型选择器
            const bgTypeSelect = document.getElementById('bg-type');
            if (bgTypeSelect) {
                bgTypeSelect.value = bgSettings.type;
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
                    await handleCustomBackground(event);
                } else if (bgSettings.customImageData) {
                    // 如果有自定义图片但用户没有选择新图片，则清除自定义图片
                    await clearCustomBackground();
                }
                
                // 选择完成后移除元素
                document.body.removeChild(fileInput);
            });
            
            // 添加取消选择事件监听器
            fileInput.addEventListener('cancel', async () => {
                if (bgSettings.customImageData) {
                    // 如果有自定义图片但用户取消选择，则清除自定义图片
                    await clearCustomBackground();
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
async function loadBackgroundSettings() {
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
            bgSettings.customImageData = result.customImage;
            bgSettings.type = result.bgType === 'custom' ? 'custom' : 'bing';
        } else {
            bgSettings.customImageData = null;
            bgSettings.type = result.bgType === 'default' ? 'default' : 'bing';
        }
        
        bgSettings.blur = result.backgroundBlur !== undefined ? result.backgroundBlur : 0;
        bgSettings.dark = result.backgroundDark !== undefined ? result.backgroundDark : 0;
    } catch (error) {
        console.error('Failed to load background settings:', error);
        // 出错时默认使用必应
        bgSettings.type = 'bing';
    }
}

/**
 * 设置背景图像
 * @returns {Promise<void>}
 */
export async function setBackgroundImage() {
    const container = document.getElementById('background');
    if (!container) {
        console.error('Background container not found');
        return;
    }

    try {
        let bgUrl = '';
        
        // 根据背景类型设置背景
        switch (bgSettings.type) {
            case 'custom':
                if (bgSettings.customImageData) {
                    bgUrl = bgSettings.customImageData;
                } else {
                    console.log('No custom image found, using default');
                    bgUrl = 'images/default.jpg';
                }
                break;
            case 'bing':
                try {
                    bgUrl = await getBingImage();
                } catch (error) {
                    console.error('Failed to get Bing image, using default:', error);
                    bgUrl = 'images/default.jpg';
                }
                break;
            case 'unsplash':
                try {
                    bgUrl = await getUnsplashImage();
                } catch (error) {
                    console.error('Failed to get Unsplash image, using default:', error);
                    bgUrl = 'images/default.jpg';
                }
                break;
            case 'default':
            default:
                bgUrl = 'images/default.jpg';
                break;
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
        applyBackgroundEffects();
        
        console.log('Background set successfully:', bgSettings.type);
    } catch (error) {
        console.error('Failed to set background image:', error);
        // 出错时使用默认背景
        container.style.backgroundImage = 'url(images/default.jpg)';
    }
}

/**
 * 应用背景效果（模糊、暗化）
 */
function applyBackgroundEffects() {
    const container = document.getElementById('background');
    if (!container) return;
    
    // 应用模糊效果
    if (bgSettings.blur > 0) {
        container.style.filter = `blur(${bgSettings.blur}px)`;
    } else {
        container.style.filter = 'none';
    }
    
    // 应用暗化效果
    const overlay = document.getElementById('background-overlay');
    if (overlay) {
        if (bgSettings.dark > 0) {
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '-1';
            overlay.style.backgroundColor = `rgba(0, 0, 0, ${bgSettings.dark / 100})`;
            overlay.style.display = 'block';
        } else {
            overlay.style.display = 'none';
        }
    }
}

/**
 * 获取Bing每日图片
 * @returns {Promise<string>} - 图片URL
 */
async function getBingImage() {
    return await fetchBingImage(); // 现在调用本模块中的函数
}

/**
 * 获取Unsplash随机图片
 * @returns {Promise<string>} - 图片URL
 */
async function getUnsplashImage() {
    try {
        // 检查缓存
        const cacheName = 'unsplashImageCache';
        const cacheData = await chrome.storage.local.get(cacheName);
        const now = Date.now();
        const cacheExpiration = 24 * 60 * 60 * 1000; // 24小时
        
        if (cacheData[cacheName] && (now - cacheData[cacheName].timestamp < cacheExpiration)) {
            console.log('Using cached Unsplash image');
            return cacheData[cacheName].imageData;
        }
        
        console.log('Fetching new Unsplash image');
        // 从Unsplash获取随机图片
        const imageUrl = 'https://source.unsplash.com/random/1920x1080/?nature,landscape';
        
        // 下载图片并转换为base64
        const imgResponse = await fetch(imageUrl);
        const blob = await imgResponse.blob();
        const base64Data = await blobToBase64(blob);
        
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
function initBackgroundControls() {
    // 背景类型选择
    const bgTypeSelect = document.getElementById('bg-type');
    if (bgTypeSelect) {
        bgTypeSelect.value = bgSettings.type;
        bgTypeSelect.addEventListener('change', async (e) => {
            bgSettings.type = e.target.value;
            await chrome.storage.local.set({ bgType: bgSettings.type });
            await setBackgroundImage();
        });
    }
    
    // 自定义背景上传
    const customBgInput = document.getElementById('custom-bg');
    if (customBgInput) {
        customBgInput.addEventListener('change', handleCustomBackground);
    }
    
    // 背景模糊控制
    const blurControl = document.getElementById('blur-control');
    if (blurControl) {
        blurControl.value = bgSettings.blur;
        blurControl.addEventListener('input', async (e) => {
            bgSettings.blur = parseInt(e.target.value);
            await chrome.storage.local.set({ backgroundBlur: bgSettings.blur });
            applyBackgroundEffects();
        });
    }
    
    // 背景暗化控制
    const darkControl = document.getElementById('dark-control');
    if (darkControl) {
        darkControl.value = bgSettings.dark;
        darkControl.addEventListener('input', async (e) => {
            bgSettings.dark = parseInt(e.target.value);
            await chrome.storage.local.set({ backgroundDark: bgSettings.dark });
            applyBackgroundEffects();
        });
    }
}

/**
 * 处理自定义背景图片上传
 * @param {Event} e - 文件上传事件
 */
async function handleCustomBackground(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            bgSettings.customImageData = event.target.result;
            bgSettings.type = 'custom';  // 上传后立即切换到自定义图片
            
            await chrome.storage.local.set({ 
                customImage: bgSettings.customImageData,
                bgType: 'custom'
            });
            
            await setBackgroundImage();
            
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
async function clearCustomBackground() {
    bgSettings.customImageData = null;
    bgSettings.type = 'bing';  // 切换回必应背景
    
    await chrome.storage.local.set({ 
        customImage: null,
        bgType: 'bing'
    });
    
    await setBackgroundImage();
    
    // 更新下拉框选项
    const bgTypeSelect = document.getElementById('bg-type');
    if (bgTypeSelect) {
        bgTypeSelect.value = 'bing';
    }
    
    console.log('Custom background cleared');
}

/**
 * 获取当前背景设置
 * @returns {Object} - 当前背景设置
 */
export function getBackgroundSettings() {
    return {...bgSettings};
}

/**
 * 更新背景设置
 * @param {Object} newSettings - 新的背景设置
 * @returns {Promise<void>}
 */
export async function updateBackgroundSettings(newSettings) {
    bgSettings = {...bgSettings, ...newSettings};
    
    await chrome.storage.local.set({
        bgType: bgSettings.type,
        backgroundBlur: bgSettings.blur,
        backgroundDark: bgSettings.dark
    });
    
    if (newSettings.customImageData) {
        await chrome.storage.local.set({ customImage: bgSettings.customImageData });
    }
    
    await setBackgroundImage();
}

/**
 * 刷新背景图片
 * 用于在标签页重新激活时更新背景图片
 */
export async function refreshBackgroundImage() {
    try {
        // 检查是否需要刷新背景图片
        if (bgSettings.type !== 'bing') {
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
            console.log('Refreshing Bing background for a new day');
            // 强制清除缓存，获取新的Bing图片
            await chrome.storage.local.remove(cacheName);
            await setBackgroundImage();
        }
    } catch (error) {
        console.error('Failed to refresh background image:', error);
    }
}