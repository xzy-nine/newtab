/**
 * 背景图像处理模块
 */

import { fetchData, blobToBase64 } from './utils.js';

// 背景图像设置
let bgSettings = {
    type: 'default',
    customImageData: null,
    blur: 0,
    dark: 0
};

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
        
        bgSettings.type = result.bgType || 'default';
        bgSettings.customImageData = result.customImage || null;
        bgSettings.blur = result.backgroundBlur !== undefined ? result.backgroundBlur : 0;
        bgSettings.dark = result.backgroundDark !== undefined ? result.backgroundDark : 0;
    } catch (error) {
        console.error('Failed to load background settings:', error);
    }
}

/**
 * 设置背景图像
 * @returns {Promise<void>}
 */
export async function setBackgroundImage() {
    const container = document.getElementById('background');
    if (!container) return;

    try {
        let bgUrl = '';
        
        // 根据背景类型设置背景
        switch (bgSettings.type) {
            case 'custom':
                if (bgSettings.customImageData) {
                    bgUrl = bgSettings.customImageData;
                } else {
                    bgUrl = 'images/default.jpg';
                }
                break;
            case 'bing':
                bgUrl = await getBingImage();
                break;
            case 'unsplash':
                bgUrl = await getUnsplashImage();
                break;
            case 'default':
            default:
                bgUrl = 'images/default.jpg';
                break;
        }

        // 应用背景图片
        container.style.backgroundImage = `url(${bgUrl})`;
        
        // 应用背景效果
        applyBackgroundEffects();
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
    if (bgSettings.dark > 0) {
        const overlay = document.getElementById('background-overlay');
        if (overlay) {
            overlay.style.backgroundColor = `rgba(0, 0, 0, ${bgSettings.dark / 100})`;
            overlay.style.display = 'block';
        }
    } else {
        const overlay = document.getElementById('background-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

/**
 * 获取Bing每日图片
 * @returns {Promise<string>} - 图片URL
 */
async function getBingImage() {
    const response = await fetchData('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US');
    if (response && response.images && response.images.length > 0) {
        return `https://www.bing.com${response.images[0].url}`;
    }
    throw new Error('Failed to get Bing image');
}

/**
 * 获取Unsplash随机图片
 * @returns {Promise<string>} - 图片URL
 */
async function getUnsplashImage() {
    // 这里可以实现Unsplash API调用
    // 暂时返回一个示例URL
    return 'https://source.unsplash.com/random/1920x1080';
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
            bgSettings.type = 'custom';
            
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