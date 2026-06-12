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
  showWidgets: boolean;
  backgroundImageUrl: string;
  backgroundEnabled: boolean;
  bgType: BgType;
  customImage: string | null;
  backgroundBlur: number;
  backgroundDark: number;
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
  showWidgets: true,
  backgroundImageUrl: "https://bing.img.run/1920x1080.php",
  backgroundEnabled: true,
  bgType: "bing",
  customImage: null,
  backgroundBlur: 0,
  backgroundDark: 0,
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

  return {
    theme: ["system", "light", "dark"].includes(candidate.theme || "")
      ? candidate.theme!
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
    backgroundBlur:
      typeof candidate.backgroundBlur === "number"
        ? candidate.backgroundBlur
        : DEFAULT_APP_SETTINGS.backgroundBlur,
    backgroundDark:
      typeof candidate.backgroundDark === "number"
        ? candidate.backgroundDark
        : DEFAULT_APP_SETTINGS.backgroundDark,
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

export async function loadAppSettings(): Promise<AppSettings> {
  const stored = await browser.storage.local.get(APP_SETTINGS_STORAGE_KEY);
  return normalizeAppSettings(stored[APP_SETTINGS_STORAGE_KEY]);
}

export async function persistAppSettings(nextValue: AppSettings): Promise<AppSettings> {
  const normalized = normalizeAppSettings(nextValue);
  await browser.storage.local.set({ [APP_SETTINGS_STORAGE_KEY]: normalized });
  return normalized;
}
