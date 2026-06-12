interface TranslationKeys {
  appName: string
  appDescription: string
  extensionTitle: string
  searchPlaceholder: string
  settingsTitle: string
  settingsGeneral: string
  settingsSearchEngines: string
  settingsAbout: string
  settingsVersion: string
  confirm: string
  cancel: string
  success: string
  error: string
  warning: string
  currentEngine: string
  addCustomSearchEngine: string
  engineName: string
  engineSearchUrl: string
  engineIconUrl: string
  delete: string
  edit: string
  save: string
  setAsCurrent: string
}

const translations: Record<string, Partial<TranslationKeys>> = {
  zh: {
    appName: '新标签页',
    appDescription: '自定义浏览器新标签页扩展',
    extensionTitle: '新标签页扩展',
    searchPlaceholder: '搜索...',
    settingsTitle: '设置',
    settingsGeneral: '常规设置',
    settingsSearchEngines: '搜索引擎',
    settingsAbout: '关于',
    settingsVersion: '版本号',
    confirm: '确认',
    cancel: '取消',
    success: '成功',
    error: '错误',
    warning: '警告',
    currentEngine: '当前',
    addCustomSearchEngine: '添加自定义搜索引擎',
    engineName: '搜索引擎名称',
    engineSearchUrl: '搜索URL',
    engineIconUrl: '图标URL（可选）',
    delete: '删除',
    edit: '编辑',
    save: '保存',
    setAsCurrent: '设为当前',
  },
  en: {
    appName: 'New Tab',
    appDescription: 'Custom browser new tab extension',
    extensionTitle: 'New Tab Extension',
    searchPlaceholder: 'Search...',
    settingsTitle: 'Settings',
    settingsGeneral: 'General',
    settingsSearchEngines: 'Search Engines',
    settingsAbout: 'About',
    settingsVersion: 'Version',
    confirm: 'Confirm',
    cancel: 'Cancel',
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    currentEngine: 'Current',
    addCustomSearchEngine: 'Add Custom Search Engine',
    engineName: 'Engine Name',
    engineSearchUrl: 'Search URL',
    engineIconUrl: 'Icon URL (Optional)',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    setAsCurrent: 'Set as Current',
  },
}

export function getMessage(key: keyof TranslationKeys, defaultValue: string): string {
  const lang = navigator.language.slice(0, 2)
  const translation = translations[lang]?.[key]
  return translation ?? defaultValue
}
