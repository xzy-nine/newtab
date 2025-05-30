/**
 * 国际化处理模块
 * @module i18n
 */

let translations = {};
let currentLanguage = 'en';
let isInitialized = false;
// 翻译文件列表
const TRANSLATION_FILES = ['messages', 'notifications', 'menus', 'containers', 'widgets'];

/**
 * 国际化API
 */
export const I18n = {
  /**
   * 初始化国际化设置
   * @returns {Promise<void>}
   */
  init: async function() {
    if (isInitialized) {
      return;
    }
    
    try {
      // 设置用户语言
      await setUserLanguage();
      //console.log(`当前语言设置为: ${currentLanguage}`);
      
      // 加载翻译文件
      await loadTranslationsFromFiles();
      
      // 应用翻译到UI
      this.applyTranslations();
      
      isInitialized = true;
      //console.log('国际化模块初始化完成');
    } catch (error) {
      console.error('国际化模块初始化失败:', error);
      throw error;
    }
  },

  /**
   * 获取指定key的翻译文本，支持默认值
   * @param {string} key - 翻译键值
   * @param {string} defaultValue - 默认值，通常用于中文
   * @returns {string} - 翻译后的文本
   */
  getMessage: function(key, defaultValue = '') {
    if (!key) return '';
    
    if (!isInitialized) {
      //console.warn('国际化模块尚未初始化，可能导致翻译缺失');
    }

    // 如果是中文且提供了默认值，直接返回默认值
    if (currentLanguage === 'zh' && defaultValue) {
      return defaultValue;
    }

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
    
    // 如果找不到翻译且不是中文，记录警告
    if (currentLanguage !== 'zh') {
      console.warn(`【未翻译]未找到键 "${key}" 的翻译 - 查看调用堆栈↓`);
      console.trace();
    }

    // 返回默认值（如果提供）或null
    return defaultValue || null;
  },

  /**
   * 应用翻译到UI元素
   */
  applyTranslations: function() {
    if (!isInitialized) {
      //console.log('尝试在国际化模块初始化之前应用翻译');
    }
    
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
    
    // 重新加载翻译
    translations = {}; // 清空现有翻译
    await loadTranslationsFromFiles(); // 加载新语言的翻译
    this.applyTranslations();
    
    console.log(`语言已更改为: ${language}`);
  },

  /**
   * 设置i18n相关的事件
   */
  setupEvents: function() {
    // 初始化语言选择器
    initLanguageSelector();
  },
  
  /**
   * 确认国际化模块是否已初始化
   * @returns {boolean} - 初始化状态
   */
  isInitialized: function() {
    return isInitialized;
  },
  
  /**
   * 获取当前已加载的所有翻译键
   * @returns {Array} - 翻译键列表
   */
  getLoadedKeys: function() {
    return Object.keys(translations);
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
      currentLanguage = ['en', 'zh'].includes(browserLang) ? browserLang : 'en';
      await chrome.storage.sync.set({ language: currentLanguage });
    }
  } catch (error) {
    console.error('设置用户语言失败:', error);
    currentLanguage = 'en'; // 默认回退到英文
  }
}

/**
 * 从JSON文件加载翻译数据
 * @returns {Promise<void>}
 */
async function loadTranslationsFromFiles() {
  try {
    // 根据当前语言确定要加载的语言文件
    let locale = 'en';
    if (currentLanguage === 'zh') {
      locale = 'zh_CN';
    } 
    
    // 清空当前翻译数据
    translations = {};
    
    // 存储加载进度
    const loadResults = {
      total: TRANSLATION_FILES.length,
      loaded: 0,
      failed: 0,
      keys: 0
    };
    
    // 加载所有翻译文件
    const loadPromises = TRANSLATION_FILES.map(async (fileType) => {
      try {
        //console.log(`尝试加载翻译文件: /_locales/${locale}/${fileType}.json`);
        
        const response = await fetch(`/_locales/${locale}/${fileType}.json`);
        if (!response.ok) {
          console.warn(`无法加载 ${locale} 语言的 ${fileType}.json，尝试回退到英文版本`);
          
          const fallbackResponse = await fetch(`/_locales/en/${fileType}.json`);
          if (!fallbackResponse.ok) {
            throw new Error(`无法加载翻译文件: ${fileType}.json, 错误状态: ${fallbackResponse.status}`);
          }
          
          const fallbackData = await fallbackResponse.json();
          const keysCount = Object.keys(fallbackData).length;
          translations = { ...translations, ...fallbackData };
          
          //console.log(`已从英文版本加载 ${fileType}.json (${keysCount} 项翻译)`);
          loadResults.loaded++;
          loadResults.keys += keysCount;
        } else {
          const messagesData = await response.json();
          const keysCount = Object.keys(messagesData).length;
          translations = { ...translations, ...messagesData };
          
          //console.log(`成功加载 ${locale} 版本的 ${fileType}.json (${keysCount} 项翻译)`);
          loadResults.loaded++;
          loadResults.keys += keysCount;
        }
      } catch (error) {
        console.error(`加载 ${fileType} 翻译文件失败:`, error);
        loadResults.failed++;
      }
    });
    
    // 等待所有翻译文件加载完成
    await Promise.all(loadPromises);
    
    // 报告加载结果
    //console.log(`翻译文件加载完成: 成功=${loadResults.loaded}, 失败=${loadResults.failed}, 共加载 ${loadResults.keys} 条翻译`);
    
    // 如果翻译对象为空，发出警告
    if (Object.keys(translations).length === 0) {
      console.error('警告: 所有翻译加载失败，将使用空对象');
      translations = {};
    }
  } catch (error) {
    console.error(`加载翻译文件出错:`, error);
    throw error;
  }
}

/**
 * 获取指定键的消息（模块内部使用）
 */
function getMessage(key) {
  if (!key) return '';
  
  if (translations[key] && translations[key].message) {
    return translations[key].message;
  }
  
  return null; // 返回null而不是键名
}

/**
 * 初始化语言选择器
 */
function initLanguageSelector() {
  const languageSelect = document.getElementById('language-select');
  if (!languageSelect) return;
  
  // 设置语言选择器的当前值
  languageSelect.value = currentLanguage;
  
  // 监听变化事件
  languageSelect.addEventListener('change', async (e) => {
    const selectedLang = e.target.value;
    await I18n.changeLanguage(selectedLang);
    location.reload();
  });
}

