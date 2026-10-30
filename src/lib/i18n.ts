const currentLanguage = "zh";

const FALLBACK_TRANSLATIONS: Record<string, Partial<Record<string, string>>> = {
  zh: {
    appName: "新标签页",
    appDescription: "自定义浏览器新标签页扩展",
    extensionTitle: "新标签页扩展",
    searchPlaceholder: "搜索...",
    settingsTitle: "设置",
    settingsGeneral: "常规设置",
    settingsSearchEngines: "搜索引擎",
    settingsAbout: "关于",
    settingsVersion: "版本号",
    confirm: "确认",
    cancel: "取消",
    success: "成功",
    error: "错误",
    warning: "警告",
    currentEngine: "当前",
    addCustomSearchEngine: "添加自定义搜索引擎",
    engineName: "搜索引擎名称",
    engineSearchUrl: "搜索URL",
    engineIconUrl: "图标URL（可选）",
    delete: "删除",
    edit: "编辑",
    save: "保存",
    setAsCurrent: "设为当前",
  },
  en: {
    appName: "New Tab",
    appDescription: "Custom browser new tab extension",
    extensionTitle: "New Tab Extension",
    searchPlaceholder: "Search...",
    settingsTitle: "Settings",
    settingsGeneral: "General",
    settingsSearchEngines: "Search Engines",
    settingsAbout: "About",
    settingsVersion: "Version",
    confirm: "Confirm",
    cancel: "Cancel",
    success: "Success",
    error: "Error",
    warning: "Warning",
    currentEngine: "Current",
    addCustomSearchEngine: "Add Custom Search Engine",
    engineName: "Engine Name",
    engineSearchUrl: "Search URL",
    engineIconUrl: "Icon URL (Optional)",
    delete: "Delete",
    edit: "Edit",
    save: "Save",
    setAsCurrent: "Set as Current",
  },
};

export function getMessage(key: string, defaultValue = ""): string {
  if (currentLanguage === "zh" && defaultValue) return defaultValue;
  try {
    const msg = chrome.i18n?.getMessage(key);
    if (msg) return msg;
  } catch {}
  if (FALLBACK_TRANSLATIONS[currentLanguage]?.[key])
    return FALLBACK_TRANSLATIONS[currentLanguage][key]!;
  if (FALLBACK_TRANSLATIONS.en?.[key]) return FALLBACK_TRANSLATIONS.en[key]!;
  return defaultValue || key;
}

export function getCurrentLanguage(): string {
  return currentLanguage;
}
