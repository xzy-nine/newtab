let currentLanguage = "zh";
let translations: Record<string, { message: string }> = {};

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

async function loadTranslationsFromFiles(language: string) {
  const locale = language === "zh" ? "zh_CN" : "en";
  try {
    const response = await fetch(`/_locales/${locale}/messages.json`);
    if (response.ok) {
      const data = await response.json();
      translations = data;
      return;
    }
  } catch {}
  try {
    const fallback = await fetch("/_locales/en/messages.json");
    if (fallback.ok) {
      const data = await fallback.json();
      translations = data;
    }
  } catch {}
}

export async function initI18n() {
  try {
    const result = (await chrome.storage.sync.get("language")) as { language?: string };
    currentLanguage = result.language || "zh";
  } catch {
    currentLanguage = navigator.language.slice(0, 2);
    if (!["zh", "en"].includes(currentLanguage)) currentLanguage = "en";
  }
  await loadTranslationsFromFiles(currentLanguage);
}

export function getMessage(key: string, defaultValue = ""): string {
  if (currentLanguage === "zh" && defaultValue) return defaultValue;
  try {
    const msg = chrome.i18n?.getMessage(key);
    if (msg) return msg;
  } catch {}
  if (translations[key]?.message) return translations[key].message;
  if (FALLBACK_TRANSLATIONS[currentLanguage]?.[key])
    return FALLBACK_TRANSLATIONS[currentLanguage][key]!;
  if (FALLBACK_TRANSLATIONS.en?.[key]) return FALLBACK_TRANSLATIONS.en[key]!;
  return defaultValue || key;
}

export function getCurrentLanguage(): string {
  return currentLanguage;
}

export async function changeLanguage(language: string) {
  currentLanguage = language;
  try {
    await chrome.storage.sync.set({ language });
  } catch {}
  await loadTranslationsFromFiles(language);
}
