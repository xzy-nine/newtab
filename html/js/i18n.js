const messages = {
  zh_CN: {
    confirmClear: "是否清除本地存储？",
    storageCleared: "本地存储已清除",
    enterEngineUrl: "请输入要切换的搜索引擎的官网链接,例如：https://www.google.com",
    searchPlaceholder: "请在此搜索",
    backgroundButton: "背景",
    backgroundSetFailed: "背景图片设置失败，请检查文件名是否包含空格或特殊字符。"
  },
  en_US: {
    confirmClear: "Do you want to clear local storage?",
    storageCleared: "Local storage has been cleared",
    enterEngineUrl: "Please enter the search engine URL, e.g., https://www.google.com",
    searchPlaceholder: "Search here",
    backgroundButton: "Background",
    backgroundSetFailed: "Failed to set background image, please check if the filename contains spaces or special characters."
  }
};

function getBrowserLanguage() {
  return navigator.language || navigator.userLanguage;
}

function getMessage(key) {
  const lang = getBrowserLanguage();
  const locale = lang === 'zh-CN' ? 'zh_CN' : 'en_US';
  return messages[locale][key] || key;
}