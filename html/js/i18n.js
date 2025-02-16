function getBrowserLanguage() {
  return navigator.language || navigator.userLanguage;
}

function getMessage(key) {
  const lang = getBrowserLanguage();
  const locale = lang === 'zh-CN' ? 'zh_CN' : 'en_US';
  return messages[locale][key] || key;
}

const messages = {
  zh_CN: {
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
