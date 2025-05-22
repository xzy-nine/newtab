/**
 * 国际化处理模块
 * @module i18n
 */

let translations = {};
let currentLanguage = 'en';
// 翻译文件列表
const TRANSLATION_FILES = ['common', 'notifications', 'menus', 'containers'];

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
    
    // 加载翻译文件
    await loadTranslationsFromFiles();
    
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
      console.log(`使用内部翻译表: 键名 "${key}" => 值 "${translations[key].message}"`);
      return translations[key].message;
    }
    
    // 返回键名作为默认值
    console.warn(`【未翻译】使用键名作为默认值: "${key}" - 查看调用堆栈↓`);
    console.trace(); // 这会自动在控制台显示完整的调用堆栈
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
    await loadTranslationsFromFiles(); // 加载新语言的翻译
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
 * 从JSON文件加载翻译数据
 * @returns {Promise<void>}
 */
async function loadTranslationsFromFiles() {
  try {
    // 根据当前语言确定要加载的语言文件
    let locale = 'en';
    if (currentLanguage === 'zh') {
      locale = 'zh_CN';
    } else if (currentLanguage === 'ja') {
      locale = 'ja'; // 如果有日语支持
    }
    
    // 清空当前翻译数据
    translations = {};
    
    // 加载所有翻译文件
    for (const fileType of TRANSLATION_FILES) {
      try {
        const response = await fetch(`/_locales/${locale}/${fileType}.json`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const messagesData = await response.json();
        // 合并翻译数据
        translations = { ...translations, ...messagesData };
        console.log(`已加载 ${fileType} 翻译文件`);
      } catch (error) {
        console.error(`加载 ${fileType} 翻译文件失败:`, error);
      }
    }
    
    console.log(getMessage('languageFileLoaded').replace('%s', locale));
  } catch (error) {
    console.error(getMessage('loadTranslationError'), error);
  }
  
  // 如果翻译对象为空，使用默认的空对象
  if (Object.keys(translations).length === 0) {
    translations = {};
  }
}

/**
 * 获取指定键的消息（模块内部使用）
 */
function getMessage(key) {
  // 简化版的 getMessage，用于模块内部使用
  if (!key) return '';
  
  if (translations[key] && translations[key].message) {
    return translations[key].message;
  }
  
  return key;
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

