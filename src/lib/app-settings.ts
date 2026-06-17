export type AppTheme = "system" | "light" | "dark";

export interface SearchEngine {
  name: string;
  url: string;
  icon?: string;
}

export type BgType = "bing" | "custom" | "default";

export interface AIProvider {
  name: string;
  apiUrl: string;
  model: string;
  apiKey: string;
  isDefault: boolean;
}

export type SyncMode = "disabled" | "upload" | "download";

export interface AppSettings {
  theme: AppTheme;
  searchEngines: SearchEngine[];
  currentEngineIndex: number;
  language: string;
  showBookmarks: boolean;
  showClock: boolean;
  use12hClock: boolean;
  showSeconds: boolean;
  showDate: boolean;
  showWidgets: boolean;
  backgroundImageUrl: string;
  backgroundEnabled: boolean;
  bgType: BgType;
  customImage: string | null;
  glassOpacity: number;
  aiEnabled: boolean;
  aiProviders: AIProvider[];
  aiCurrentProviderIndex: number;
  aiSystemPrompt: string;
  aiQuickPrompts: string[];
  syncMode: SyncMode;
  syncInterval: number;
}

export const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
  { name: "Bing", url: "https://www.bing.com/search?q=" },
  { name: "Baidu", url: "https://www.baidu.com/s?wd=" },
  { name: "Google", url: "https://www.google.com/search?q=" },
];

export const DEFAULT_AI_PROVIDERS: AIProvider[] = [
  {
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    apiKey: "",
    isDefault: true,
  },
  {
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-3.5-turbo",
    apiKey: "",
    isDefault: false,
  },
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: "system",
  searchEngines: DEFAULT_SEARCH_ENGINES,
  currentEngineIndex: 0,
  language: "zh",
  showBookmarks: true,
  showClock: true,
  use12hClock: false,
  showSeconds: false,
  showDate: true,
  showWidgets: true,
  backgroundImageUrl: "https://bing.img.run/1920x1080.php",
  backgroundEnabled: true,
  bgType: "bing",
  customImage: null,
  glassOpacity: 80,
  aiEnabled: false,
  aiProviders: DEFAULT_AI_PROVIDERS,
  aiCurrentProviderIndex: 0,
  aiSystemPrompt: "你是一个有用的AI助手。",
  aiQuickPrompts: [],
  syncMode: "disabled",
  syncInterval: 0,
};

export const APP_SETTINGS_STORAGE_KEY = "newtab:app-settings";

export function resolveIsDarkMode(theme: AppTheme, prefersDark: boolean): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  return prefersDark;
}

export function normalizeSearchEngines(engines: unknown): SearchEngine[] {
  if (!Array.isArray(engines)) return DEFAULT_SEARCH_ENGINES;

  const valid = engines.filter(
    (e): e is SearchEngine =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as SearchEngine).name === "string" &&
      typeof (e as SearchEngine).url === "string",
  );

  return valid.length > 0 ? valid : DEFAULT_SEARCH_ENGINES;
}

export function normalizeAIProviders(providers: unknown): AIProvider[] {
  if (!Array.isArray(providers)) return DEFAULT_AI_PROVIDERS;
  const valid = providers.filter(
    (p): p is AIProvider =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as AIProvider).name === "string" &&
      typeof (p as AIProvider).apiUrl === "string" &&
      typeof (p as AIProvider).model === "string",
  );
  return valid.length > 0 ? valid : DEFAULT_AI_PROVIDERS;
}

export function normalizeAppSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_APP_SETTINGS };
  }

  const candidate = value as Partial<AppSettings>;

  const rawTheme = candidate.theme || "";
  return {
    theme: ["system", "light", "dark"].includes(rawTheme)
      ? (rawTheme as AppTheme)
      : (rawTheme as string) === "auto"
        ? "system"
        : DEFAULT_APP_SETTINGS.theme,
    searchEngines: normalizeSearchEngines(candidate.searchEngines),
    currentEngineIndex:
      typeof candidate.currentEngineIndex === "number" && candidate.currentEngineIndex >= 0
        ? candidate.currentEngineIndex
        : DEFAULT_APP_SETTINGS.currentEngineIndex,
    language: ["zh", "en"].includes(candidate.language || "")
      ? candidate.language!
      : DEFAULT_APP_SETTINGS.language,
    showBookmarks:
      typeof candidate.showBookmarks === "boolean"
        ? candidate.showBookmarks
        : DEFAULT_APP_SETTINGS.showBookmarks,
    showClock:
      typeof candidate.showClock === "boolean"
        ? candidate.showClock
        : DEFAULT_APP_SETTINGS.showClock,
    use12hClock:
      typeof candidate.use12hClock === "boolean"
        ? candidate.use12hClock
        : DEFAULT_APP_SETTINGS.use12hClock,
    showSeconds:
      typeof candidate.showSeconds === "boolean"
        ? candidate.showSeconds
        : DEFAULT_APP_SETTINGS.showSeconds,
    showDate:
      typeof candidate.showDate === "boolean" ? candidate.showDate : DEFAULT_APP_SETTINGS.showDate,
    showWidgets:
      typeof candidate.showWidgets === "boolean"
        ? candidate.showWidgets
        : DEFAULT_APP_SETTINGS.showWidgets,
    backgroundImageUrl:
      typeof candidate.backgroundImageUrl === "string"
        ? candidate.backgroundImageUrl
        : DEFAULT_APP_SETTINGS.backgroundImageUrl,
    backgroundEnabled:
      typeof candidate.backgroundEnabled === "boolean"
        ? candidate.backgroundEnabled
        : DEFAULT_APP_SETTINGS.backgroundEnabled,
    bgType: ["bing", "custom", "default"].includes(candidate.bgType || "")
      ? candidate.bgType!
      : DEFAULT_APP_SETTINGS.bgType,
    customImage:
      typeof candidate.customImage === "string" || candidate.customImage === null
        ? candidate.customImage
        : DEFAULT_APP_SETTINGS.customImage,
    glassOpacity:
      typeof candidate.glassOpacity === "number" &&
      candidate.glassOpacity >= 0 &&
      candidate.glassOpacity <= 100
        ? candidate.glassOpacity
        : DEFAULT_APP_SETTINGS.glassOpacity,
    aiEnabled:
      typeof candidate.aiEnabled === "boolean"
        ? candidate.aiEnabled
        : DEFAULT_APP_SETTINGS.aiEnabled,
    aiProviders: normalizeAIProviders(candidate.aiProviders),
    aiCurrentProviderIndex:
      typeof candidate.aiCurrentProviderIndex === "number" && candidate.aiCurrentProviderIndex >= 0
        ? candidate.aiCurrentProviderIndex
        : DEFAULT_APP_SETTINGS.aiCurrentProviderIndex,
    aiSystemPrompt:
      typeof candidate.aiSystemPrompt === "string"
        ? candidate.aiSystemPrompt
        : DEFAULT_APP_SETTINGS.aiSystemPrompt,
    aiQuickPrompts: Array.isArray(candidate.aiQuickPrompts)
      ? candidate.aiQuickPrompts.filter((p): p is string => typeof p === "string")
      : DEFAULT_APP_SETTINGS.aiQuickPrompts,
    syncMode: ["disabled", "upload", "download"].includes(candidate.syncMode || "")
      ? candidate.syncMode!
      : DEFAULT_APP_SETTINGS.syncMode,
    syncInterval:
      typeof candidate.syncInterval === "number" && candidate.syncInterval >= 0
        ? candidate.syncInterval
        : DEFAULT_APP_SETTINGS.syncInterval,
  };
}

/**
 * 从旧版分散存储键迁移到新版统一存储
 * 兼容 public/ 升级到 src/ 时的数据继承
 */
async function migrateFromLegacyStorage(): Promise<AppSettings> {
  const legacyKeys = [
    "bgType",
    "customImage",
    "backgroundBlur",
    "backgroundDark",
    "lastNonCustomBgType",
    "clockEnabled",
    "clockFormat24h",
    "clockShowSeconds",
    "searchEngines",
    "engine",
    "aiConfig",
    "desktopLayouts",
    "expandedFolders",
    "folder",
  ];
  const result = await browser.storage.local.get(legacyKeys);

  const hasLegacyData = legacyKeys.some((k) => result[k] !== undefined);
  if (!hasLegacyData) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  let searchEngines: SearchEngine[] = DEFAULT_SEARCH_ENGINES;
  let currentEngineIndex = 0;
  if (Array.isArray(result.searchEngines) && result.searchEngines.length > 0) {
    searchEngines = (result.searchEngines as unknown[]).filter(
      (e: unknown): e is SearchEngine =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as SearchEngine).name === "string" &&
        typeof (e as SearchEngine).url === "string",
    );
    if (searchEngines.length === 0) searchEngines = DEFAULT_SEARCH_ENGINES;
    const engineObj = result.engine;
    if (
      engineObj &&
      typeof engineObj === "object" &&
      "name" in (engineObj as Record<string, unknown>)
    ) {
      const engineName = (engineObj as Record<string, unknown>).name;
      if (typeof engineName === "string") {
        const idx = searchEngines.findIndex((e) => e.name === engineName);
        currentEngineIndex = idx >= 0 ? idx : 0;
      }
    }
  }

  const legacyTheme = (() => {
    try {
      const t = localStorage.getItem("theme");
      if (t === "auto") return "system" as const;
      if (t === "light" || t === "dark") return t;
    } catch {}
    return undefined;
  })();

  let legacySyncMode: SyncMode = "disabled";
  let legacySyncInterval = 0;
  try {
    const sm = localStorage.getItem("sync-mode");
    if (sm === "upload" || sm === "download") legacySyncMode = sm;
    const si = localStorage.getItem("sync-interval");
    if (si) legacySyncInterval = parseInt(si, 10) || 0;
  } catch {}

  let aiEnabled = false;
  let aiProviders: AIProvider[] = DEFAULT_AI_PROVIDERS;
  let aiCurrentProviderIndex = 0;
  let aiSystemPrompt = "你是一个有用的AI助手。";
  let aiQuickPrompts: string[] = [];
  if (result.aiConfig && typeof result.aiConfig === "object") {
    const cfg = result.aiConfig as Record<string, unknown>;
    aiEnabled = typeof cfg.enabled === "boolean" ? cfg.enabled : false;
    if (Array.isArray(cfg.providers)) {
      const valid = cfg.providers.filter(
        (p: unknown): p is AIProvider =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as AIProvider).name === "string" &&
          typeof (p as AIProvider).apiUrl === "string",
      );
      aiProviders = valid.length > 0 ? valid : DEFAULT_AI_PROVIDERS;
    }
    if (cfg.currentProvider && typeof cfg.currentProvider === "object") {
      const cp = cfg.currentProvider as { name?: string };
      if (cp.name) {
        const idx = aiProviders.findIndex((p) => p.name === cp.name);
        aiCurrentProviderIndex = idx >= 0 ? idx : 0;
      }
    }
    aiSystemPrompt = typeof cfg.systemPrompt === "string" ? cfg.systemPrompt : aiSystemPrompt;
    if (Array.isArray(cfg.quickPrompts)) {
      aiQuickPrompts = cfg.quickPrompts
        .filter((q: unknown): q is { text?: string } => typeof q === "object" && q !== null)
        .map((q: { text?: string }) => q.text || "")
        .filter(Boolean);
    }
  }

  const migrated: AppSettings = {
    theme: legacyTheme ?? DEFAULT_APP_SETTINGS.theme,
    searchEngines,
    currentEngineIndex,
    language: DEFAULT_APP_SETTINGS.language,
    showBookmarks:
      typeof result.clockEnabled === "boolean"
        ? result.clockEnabled
        : DEFAULT_APP_SETTINGS.showBookmarks,
    showClock:
      typeof result.clockEnabled === "boolean"
        ? result.clockEnabled
        : DEFAULT_APP_SETTINGS.showClock,
    use12hClock:
      typeof result.clockFormat24h === "boolean"
        ? !result.clockFormat24h
        : DEFAULT_APP_SETTINGS.use12hClock,
    showSeconds:
      typeof result.clockShowSeconds === "boolean"
        ? result.clockShowSeconds
        : DEFAULT_APP_SETTINGS.showSeconds,
    showDate: DEFAULT_APP_SETTINGS.showDate,
    showWidgets: DEFAULT_APP_SETTINGS.showWidgets,
    backgroundImageUrl: DEFAULT_APP_SETTINGS.backgroundImageUrl,
    backgroundEnabled: true,
    bgType: ["bing", "custom", "default"].includes(result.bgType as string)
      ? (result.bgType as BgType)
      : DEFAULT_APP_SETTINGS.bgType,
    customImage:
      typeof result.customImage === "string"
        ? result.customImage
        : DEFAULT_APP_SETTINGS.customImage,
    glassOpacity:
      typeof result.backgroundBlur === "number" &&
      result.backgroundBlur >= 0 &&
      result.backgroundBlur <= 100
        ? result.backgroundBlur
        : DEFAULT_APP_SETTINGS.glassOpacity,
    aiEnabled,
    aiProviders,
    aiCurrentProviderIndex,
    aiSystemPrompt,
    aiQuickPrompts,
    syncMode: legacySyncMode,
    syncInterval: legacySyncInterval,
  };

  const normalized = normalizeAppSettings(migrated);
  await browser.storage.local.set({ [APP_SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}

export async function loadAppSettings(): Promise<AppSettings> {
  const stored = await browser.storage.local.get(APP_SETTINGS_STORAGE_KEY);
  if (stored[APP_SETTINGS_STORAGE_KEY]) {
    return normalizeAppSettings(stored[APP_SETTINGS_STORAGE_KEY]);
  }
  return migrateFromLegacyStorage();
}

export async function persistAppSettings(nextValue: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(nextValue);
  await browser.storage.local.set({ [APP_SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}
