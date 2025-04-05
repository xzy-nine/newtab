/**
 * 国际化处理模块
 */

let translations = {};
let currentLanguage = 'en';

/**
 * 初始化国际化设置
 * @returns {Promise<void>}
 */
export async function initI18n() {
    // 设置用户语言
    await setUserLanguage();
    
    // 加载内部翻译文件
    loadTranslationsFromInternal();
    
    // 应用翻译到UI
    applyTranslations();
}

/**
 * 设置用户语言
 * @returns {Promise<void>}
 */
async function setUserLanguage() {
    try {
        // 尝试从存储中获取语言设置
        const result = await chrome.storage.sync.get('language');
        if (result.language) {
            currentLanguage = result.language;
        } else {
            // 如果没有保存的语言设置，使用浏览器语言设置
            const browserLang = navigator.language.slice(0, 2);
            currentLanguage = ['en', 'zh', 'ja'].includes(browserLang) ? browserLang : 'en';
            await chrome.storage.sync.set({ language: currentLanguage });
        }
    } catch (error) {
        console.error('Failed to set user language:', error);
        currentLanguage = 'en'; // 默认回退到英文
    }
}

/**
 * 从内部加载翻译数据
 */
function loadTranslationsFromInternal() {
    try {
        // 根据当前语言选择对应的翻译表
        const locale = currentLanguage === 'zh' ? 'zh_CN' : 'en_US';
        
        // 将内部定义的 messages 转换为与外部加载格式一致的结构
        translations = {};
        
        // 遍历 messages 对象的对应语言部分
        Object.entries(messages[locale]).forEach(([key, value]) => {
            translations[key] = { message: value };
        });
        
        console.log(`Loaded internal translations for ${locale}`);
    } catch (error) {
        console.error('Failed to load internal translations:', error);
        translations = {}; // 出错时使用空对象
    }
}

/**
 * 获取指定key的翻译文本
 * @param {string} key - 翻译键值
 * @returns {string} - 翻译后的文本
 */
export function getI18nMessage(key) {
    if (translations[key] && translations[key].message) {
        return translations[key].message;
    }
    return key; // 如果翻译不存在，返回键值本身
}

/**
 * 应用翻译到UI元素
 */
export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = getI18nMessage(key);
    });
    
    // 更新页面标题
    document.title = getI18nMessage('newTab');
    
    // 更新占位符文本
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = getI18nMessage(key);
    });
}

/**
 * 获取当前设置的语言
 * @returns {string} - 当前语言代码
 */
export function getCurrentLanguage() {
    return currentLanguage;
}

/**
 * 更改语言设置
 * @param {string} language - 新的语言代码
 * @returns {Promise<void>}
 */
export async function changeLanguage(language) {
    currentLanguage = language;
    await chrome.storage.sync.set({ language });
    loadTranslationsFromInternal(); // 使用内部翻译
    applyTranslations();
}

// 保留以下内部翻译表
const messages = {
    zh_CN: {
        newTab: "新标签页", // 添加页面标题的翻译
        confirmClear: "是否清除本地存储？",
        storageCleared: "本地存储已清除",
        enterEngineUrl: "请输入要切换的搜索引擎的官网链接,例如：https://www.google.com",
        searchPlaceholder: "请在此搜索",
        backgroundButton: "背景",
        backgroundSetFailed: "背景图片设置失败，请检查文件名是否包含空格或特殊字符。",
        deleteIconFailed: "删除图标失败",
        setIconFailed: "设置图标失败",
        confirmSetNewIcon: "确认将设置新图标,取消将重新获取图标",
        settingBackgroundType: "设置背景类型:",
        localStorageImageFailed: "从本地存储获取图片失败",
        backgroundFetchFailed: "从后台获取壁纸失败",
        bingDailyBackgroundFailed: "设置必应每日图片背景失败:",
        customBackgroundExists: "自定义背景图片是否存在:",
        currentBackgroundType: "当前背景类型:",
        usingCachedImage: "使用缓存图片,剩余时间：%s小时%s分钟",
        fetchingBingImage: "获取必应图片中...",
        bingApiError: "必应API请求错误：%s",
        invalidBingResponse: "无效的必应响应",
        bingImageUrl: "必应图片URL:",
        imageDownloadError: "图片下载失败",
        base64Generated: "base64数据生成状态:",
        localStorageError: "保存到本地存储时出错:",
        bingImageError: "获取必应图片时出错:"
    },
    en_US: {
        newTab: "New Tab", // 添加页面标题的翻译
        confirmClear: "Do you want to clear local storage?",
        storageCleared: "Local storage has been cleared",
        enterEngineUrl: "Please enter the search engine URL, e.g., https://www.google.com",
        searchPlaceholder: "Search here",
        backgroundButton: "Background",
        backgroundSetFailed: "Failed to set background image, please check if the filename contains spaces or special characters.",
        deleteIconFailed: "Failed to delete icon",
        setIconFailed: "Failed to set icon",
        confirmSetNewIcon: "Confirm to set new icon, cancel to fetch icon again",
        settingBackgroundType: "Setting background type:",
        localStorageImageFailed: "Failed to get image from local storage",
        backgroundFetchFailed: "Failed to fetch wallpaper from background",
        bingDailyBackgroundFailed: "Failed to set Bing daily background:",
        customBackgroundExists: "Custom background image exists:",
        currentBackgroundType: "Current background type:",
        usingCachedImage: "Using cached image, remaining time: %s hours %s minutes",
        fetchingBingImage: "Fetching Bing image...",
        bingApiError: "Bing API error: %s",
        invalidBingResponse: "Invalid Bing response",
        bingImageUrl: "Bing image URL:",
        imageDownloadError: "Image download error",
        base64Generated: "base64 data generated:",
        localStorageError: "Error saving to local storage:",
        bingImageError: "Error fetching Bing image:"  
    }
};
