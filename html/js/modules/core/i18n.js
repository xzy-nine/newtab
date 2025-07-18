/**
 * 国际化处理模块
 * 提供多语言支持，自动加载翻译文件，适配 Chromium 扩展环境。
 * @module i18n
 */

let translations = {};
let currentLanguage = 'en';
let isInitialized = false;
// 统一翻译文件名
const TRANSLATION_FILE = 'messages';

/**
 * 国际化 API
 * @namespace I18n
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
  },  /**
   * 获取指定 key 的翻译文本，支持默认值
   * @param {string} key - 翻译键值
   * @param {string} defaultValue - 默认值，中文时直接使用
   * @returns {string} 翻译后的文本
   */
  getMessage: function(key, defaultValue = '') {
    if (!key) return '';
    
    if (!isInitialized) {
      //console.warn('国际化模块尚未初始化，可能导致翻译缺失');
    }

    // 检查是否为中文语言（支持 zh 和 zh_CN）
    const isChinese = currentLanguage === 'zh' || currentLanguage === 'zh_CN' || currentLanguage.startsWith('zh');

    // 如果是中文且提供了默认值，直接返回默认值（因为中文有默认值机制）
    if (isChinese && defaultValue) {
      return defaultValue;
    }

    try {
      // 首先尝试从Chrome i18n API获取（主要用于manifest.json的键值）
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
    if (!isChinese) {
      console.warn(`【未翻译]未找到键 "${key}" 的翻译 - 查看调用堆栈↓`);
      console.trace();
    }

    // 返回默认值（如果提供）或null
    return defaultValue || null;
  },  /**
   * 应用翻译到UI元素
   */
  applyTranslations: function() {
    // 只在 DOM 环境中执行
    if (typeof document === 'undefined') {
      return;
    }
    
    if (!isInitialized) {
      //console.log('尝试在国际化模块初始化之前应用翻译');
    }
    
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.getMessage(key);
      // 只有当翻译存在时才更新文本，避免清空默认文本
      if (translation) {
        element.textContent = translation;
      }
    });
    
    // 更新页面标题
    const newTabTitle = this.getMessage('newTab');
    if (newTabTitle) {
      document.title = newTabTitle;
    }
    
    // 更新占位符文本
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
      const key = element.getAttribute('data-i18n-placeholder');
      const translation = this.getMessage(key);
      if (translation) {
        element.placeholder = translation;
      }
    });
    
    // 更新title属性
    document.querySelectorAll('[data-i18n-title]').forEach(element => {
      const key = element.getAttribute('data-i18n-title');
      const translation = this.getMessage(key);
      if (translation) {
        element.title = translation;
      }
    });
  },

  /**
   * 获取当前设置的语言
   * @returns {string} 当前语言代码
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
    try {
      console.log(`开始切换语言: ${currentLanguage} -> ${language}`);
      
      // 先更新内部状态
      currentLanguage = language;
      
      // 保存到存储
      await chrome.storage.sync.set({ language });
      console.log(`语言设置已保存到存储: ${language}`);
      
      // 清空现有翻译并重新加载
      translations = {}; 
      await loadTranslationsFromFiles(); 
      
      // 应用翻译到界面
      this.applyTranslations();
      
      console.log(`语言已成功更改为: ${language}`);
    } catch (error) {
      console.error('更改语言失败:', error);
      throw error;
    }
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
   * @returns {boolean} 初始化状态
   */
  isInitialized: function() {
    return isInitialized;
  },
  
  /**
   * 获取当前已加载的所有翻译键
   * @returns {Array} 翻译键列表
   */
  getLoadedKeys: function() {
    return Object.keys(translations);
  },
  /**
   * 生成语言设置项，与 Settings 模块配合使用
   * @returns {Array} 设置项配置数组
   */
  createSettingsItems: function() {
    return [
      {
        id: 'language',
        label: this.getMessage('settingsLanguage', '界面语言'),
        type: 'select',
        options: [
          { value: 'zh', label: '简体中文' },
          { value: 'en', label: 'English' }
        ],
        getValue: () => this.getCurrentLanguage(),
        description: this.getMessage('settingsLanguageDesc', '选择界面显示语言'),
        onChange: async (value) => {
          await this.changeLanguage(value);
          location.reload();
        }
      }
    ];
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
 * 从 JSON 文件加载翻译数据
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
    
    try {
      console.log(`尝试加载翻译文件: /_locales/${locale}/${TRANSLATION_FILE}.json`);
      const response = await fetch(`/_locales/${locale}/${TRANSLATION_FILE}.json`);
      
      if (!response.ok) {
        console.warn(`无法加载 ${locale} 语言的 ${TRANSLATION_FILE}.json，尝试回退到英文版本`);
        
        const fallbackResponse = await fetch(`/_locales/en/${TRANSLATION_FILE}.json`);
        if (!fallbackResponse.ok) {
          throw new Error(`无法加载翻译文件: ${TRANSLATION_FILE}.json, 错误状态: ${fallbackResponse.status}`);
        }
        
        const fallbackData = await fallbackResponse.json();
        const keysCount = Object.keys(fallbackData).length;
        translations = fallbackData;
        
        console.log(`已从英文版本加载 ${TRANSLATION_FILE}.json (${keysCount} 项翻译)`);
      } else {
        const translationData = await response.json();
        const keysCount = Object.keys(translationData).length;
        translations = translationData;
        
        console.log(`成功加载 ${locale} 版本的 ${TRANSLATION_FILE}.json (${keysCount} 项翻译)`);
      }
    } catch (error) {
      console.error(`加载 ${TRANSLATION_FILE} 翻译文件失败:`, error);
      throw error;
    }
    
    // 如果翻译对象为空，发出警告
    if (Object.keys(translations).length === 0) {
      console.error('警告: 翻译加载失败，将使用空对象');
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
  // 只在 DOM 环境中执行
  if (typeof document === 'undefined') {
    return;
  }
  
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
