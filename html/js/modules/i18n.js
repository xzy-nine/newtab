/**
 * 国际化处理模块
 * @module i18n
 */

let translations = {};
let currentLanguage = 'en';

/**
 * 国际化API
 */
export const I18n = {
  /**
   * 初始化国际化设置
   * @returns {Promise<void>}
   */
  init: async function() {
    // 设置用户语言
    await setUserLanguage();
    
    // 加载内部翻译文件
    loadTranslationsFromInternal();
    
    // 应用翻译到UI
    this.applyTranslations();
  },

  /**
   * 获取指定key的翻译文本
   * @param {string} key - 翻译键值
   * @returns {string} - 翻译后的文本
   */
  getMessage: function(key) {
    if (!key) return '';
    
    try {
      // 首先尝试从Chrome i18n API获取
      if (chrome && chrome.i18n) {
        const message = chrome.i18n.getMessage(key);
        if (message) return message;
      }
    } catch (e) {
      // Chrome i18n API不可用，忽略错误
    }
    
    // 从内部翻译表获取
    if (translations[key] && translations[key].message) {
      return translations[key].message;
    }
    
    // 返回键名作为默认值
    return key;
  },

  /**
   * 应用翻译到UI元素
   */
  applyTranslations: function() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      element.textContent = this.getMessage(key);
    });
    
    // 更新页面标题
    document.title = this.getMessage('newTab');
    
    // 更新占位符文本
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      element.placeholder = this.getMessage(key);
    });
  },

  /**
   * 获取当前设置的语言
   * @returns {string} - 当前语言代码
   */
  getCurrentLanguage: function() {
    return currentLanguage;
  },

  /**
   * 更改语言设置
   * @param {string} language - 新的语言代码
   * @returns {Promise<void>}
   */
  changeLanguage: async function(language) {
    currentLanguage = language;
    await chrome.storage.sync.set({ language });
    loadTranslationsFromInternal(); // 使用内部翻译
    this.applyTranslations();
  },

  /**
   * 设置i18n相关的事件
   */
  setupEvents: function() {
    // 初始化语言选择器
    initLanguageSelector();
  }
};

/**
 * 设置用户语言
 * @returns {Promise<void>}
 */
async function setUserLanguage() {
  try {
    const result = await chrome.storage.sync.get('language');
    if (result.language) {
      currentLanguage = result.language;
    } else {
      const browserLang = navigator.language.slice(0, 2);
      currentLanguage = ['en', 'zh', 'ja'].includes(browserLang) ? browserLang : 'en';
      await chrome.storage.sync.set({ language: currentLanguage });
    }
  } catch (error) {
    currentLanguage = 'en'; // 默认回退到英文
  }
}

/**
 * 从内部加载翻译数据
 */
function loadTranslationsFromInternal() {
  try {
    const locale = currentLanguage === 'zh' ? 'zh_CN' : 'en_US';
    
    translations = {};
    
    Object.entries(messages[locale]).forEach(([key, value]) => {
      translations[key] = { message: value };
    });
  } catch (error) {
    translations = {}; // 出错时使用空对象
  }
}

/**
 * 初始化语言选择器
 */
function initLanguageSelector() {
  const languageSelect = document.getElementById('language-select');
  if (!languageSelect) return;
  
  languageSelect.addEventListener('change', async (e) => {
    const selectedLang = e.target.value;
    await I18n.changeLanguage(selectedLang);
    // 刷新页面以应用新语言
    location.reload();
  });
}

// 保留以下内部翻译表
const messages = {
  zh_CN: {
    newTab: "新标签页",
    enterEngineUrl: "请输入搜索引擎官网链接，例如：https://www.google.com",
    searchPlaceholder: "请在此搜索",
    backgroundButton: "背景",
    backgroundSetFailed: "背景图片设置失败，请检查文件名是否包含空格或特殊字符",
    settingBackgroundType: "正在设置背景类型：",
    localStorageImageFailed: "从本地存储获取图片失败",
    backgroundFetchFailed: "获取壁纸失败",
    bingDailyBackgroundFailed: "设置必应每日图片背景失败：",
    customBackgroundExists: "自定义背景图片状态：",
    currentBackgroundType: "当前背景类型：",
    usingCachedImage: "使用缓存图片，剩余时间：%s小时%s分钟",
    fetchingBingImage: "正在获取必应每日图片...",
    bingApiError: "必应API请求错误：%s",
    invalidBingResponse: "无效的必应API响应",
    bingImageUrl: "必应图片地址：",
    imageDownloadError: "图片下载失败",
    base64Generated: "base64数据生成状态：",
    localStorageError: "保存到本地存储时出错：",
    bingImageError: "获取必应图片时出错：",
    welcomeTitle: "欢迎使用",
    welcomeMessage: "感谢您安装收藏夹新标签页扩展！",
    updateTitle: "已更新",
    updateMessage: "扩展已从 {oldVersion} 更新至 {newVersion}",
    customIcon: "自定义图标",
    resetIcon: "重置图标",
    editBookmark: "编辑书签",
    addBookmark: "添加书签",
    confirmDeleteBookmark: "确定要删除此书签吗？",
    pleaseCompleteAllFields: "请完成所有必填字段",
    addCustomSearchEngine: "添加自定义搜索引擎",
    engineName: "名称",
    engineSearchUrl: "搜索URL (包含 %s 作为搜索词占位符)",
    engineIconUrl: "图标URL (可选)",
    cancel: "取消",
    confirm: "确认",
    saveFailed: "保存失败",
    savingSettings: "正在保存设置...",
    loadingResources: "正在加载资源...",
    loadingI18n: "正在加载国际化资源...",
    loadingIcons: "正在加载图标资源...",
    loadingBackground: "正在加载背景图像...",
    loadingSearch: "正在加载搜索引擎...",
    loadingBookmarks: "正在加载书签...",
    loadingClock: "正在加载时钟组件...",
    clearStorageConfirm: "确定要清除所有存储数据吗？此操作不可恢复。",
    clearStorageSuccess: "存储已成功清除，页面将刷新。",
    clearStorageError: "清除存储失败，请查看控制台了解详情。",
    deleteSearchEngine: "删除搜索引擎",
    cannotDeleteLastEngine: "无法删除最后一个搜索引擎",
    confirmDeleteEngine: "确定要删除此搜索引擎吗？",
    initializationFailed: "初始化失败，请刷新页面重试。",
    initializingTitle: "新标签页初始化中...",
    loadingEvents: "正在初始化事件处理...",
    loadingComplete: "加载完成！",
    initTimeout: "初始化超时",
    moduleInitTimeout: "{0}初始化超时",
    moduleLoadingFailed: "{0}加载失败: {1}",
    refreshPage: "刷新页面"
  },
  en_US: {
    newTab: "New Tab",
    enterEngineUrl: "Please enter the search engine URL, e.g., https://www.google.com",
    searchPlaceholder: "Search here",
    backgroundButton: "Background",
    backgroundSetFailed: "Failed to set background image, please check if the filename contains spaces or special characters",
    settingBackgroundType: "Setting background type:",
    localStorageImageFailed: "Failed to get image from local storage",
    backgroundFetchFailed: "Failed to fetch wallpaper",
    bingDailyBackgroundFailed: "Failed to set Bing daily background:",
    customBackgroundExists: "Custom background image status:",
    currentBackgroundType: "Current background type:",
    usingCachedImage: "Using cached image, remaining time: %s hours %s minutes",
    fetchingBingImage: "Fetching Bing daily image...",
    bingApiError: "Bing API error: %s",
    invalidBingResponse: "Invalid Bing API response",
    bingImageUrl: "Bing image URL:",
    imageDownloadError: "Image download failed",
    base64Generated: "Base64 data generated:",
    localStorageError: "Error saving to local storage:",
    bingImageError: "Error fetching Bing image:",
    welcomeTitle: "Welcome",
    welcomeMessage: "Thank you for installing the Bookmark New Tab Extension!",
    updateTitle: "Updated",
    updateMessage: "Extension updated from {oldVersion} to {newVersion}",
    customIcon: "Custom Icon",
    resetIcon: "Reset Icon",
    editBookmark: "Edit Bookmark", 
    addBookmark: "Add Bookmark",
    confirmDeleteBookmark: "Are you sure you want to delete this bookmark?",
    pleaseCompleteAllFields: "Please complete all required fields",
    addCustomSearchEngine: "Add Custom Search Engine",
    engineName: "Name",
    engineSearchUrl: "Search URL (include %s as search term placeholder)",
    engineIconUrl: "Icon URL (optional)",
    cancel: "Cancel",
    confirm: "Confirm",
    saveFailed: "Save failed",
    savingSettings: "Saving settings...",
    loadingResources: "Loading resources...",
    loadingI18n: "Loading internationalization resources...",
    loadingIcons: "Loading icon resources...",
    loadingBackground: "Loading background image...",
    loadingSearch: "Loading search engines...",
    loadingBookmarks: "Loading bookmarks...",
    loadingClock: "Loading clock widget...",
    clearStorageConfirm: "Are you sure you want to clear all storage data? This action cannot be undone.",
    clearStorageSuccess: "Storage has been cleared successfully, the page will refresh.",
    clearStorageError: "Failed to clear storage, please check console for details.",
    deleteSearchEngine: "Delete Search Engine",
    cannotDeleteLastEngine: "Cannot delete the last search engine",
    confirmDeleteEngine: "Are you sure you want to delete this search engine?",
    initializationFailed: "Initialization failed, please refresh the page to try again.",
    initializingTitle: "New Tab Page initializing...",
    loadingEvents: "Initializing event handlers...",
    loadingComplete: "Loading complete!",
    initTimeout: "Initialization timeout",
    moduleInitTimeout: "{0} initialization timed out",
    moduleLoadingFailed: "{0} loading failed: {1}",
    refreshPage: "Refresh Page"
  }
};

// ========================================================
// 弃用函数 - 为保持向后兼容而保留
// ========================================================

/**
 * 初始化国际化设置
 * @returns {Promise<void>}
 * @deprecated 请使用 I18n.init() 代替
 */
export async function initI18n() {
  console.warn('initI18n() 已弃用。请使用 I18n.init() 代替。');
  return await I18n.init();
}

/**
 * 获取指定key的翻译文本
 * @param {string} key - 翻译键值
 * @returns {string} - 翻译后的文本
 * @deprecated 请使用 I18n.getMessage() 代替
 */
export function getI18nMessage(key) {
  console.warn('getI18nMessage() 已弃用。请使用 I18n.getMessage() 代替。');
  return I18n.getMessage(key);
}

/**
 * 应用翻译到UI元素
 * @deprecated 请使用 I18n.applyTranslations() 代替
 */
export function applyTranslations() {
  console.warn('applyTranslations() 已弃用。请使用 I18n.applyTranslations() 代替。');
  I18n.applyTranslations();
}

/**
 * 获取当前设置的语言
 * @returns {string} - 当前语言代码
 * @deprecated 请使用 I18n.getCurrentLanguage() 代替
 */
export function getCurrentLanguage() {
  console.warn('getCurrentLanguage() 已弃用。请使用 I18n.getCurrentLanguage() 代替。');
  return I18n.getCurrentLanguage();
}

/**
 * 更改语言设置
 * @param {string} language - 新的语言代码
 * @returns {Promise<void>}
 * @deprecated 请使用 I18n.changeLanguage() 代替
 */
export async function changeLanguage(language) {
  console.warn('changeLanguage() 已弃用。请使用 I18n.changeLanguage() 代替。');
  return await I18n.changeLanguage(language);
}

/**
 * 设置i18n相关的事件
 * @deprecated 请使用 I18n.setupEvents() 代替
 */
export function setupI18nEvents() {
  console.warn('setupI18nEvents() 已弃用。请使用 I18n.setupEvents() 代替。');
  I18n.setupEvents();
}
