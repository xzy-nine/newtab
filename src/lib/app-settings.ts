export type AppTheme = "system" | "light" | "dark";

export interface SearchEngine {
  name: string;
  url: string;
  icon?: string;
}

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
}

export const DEFAULT_SEARCH_ENGINES: SearchEngine[] = [
  { name: "Bing", url: "https://www.bing.com/search?q=" },
  { name: "Baidu", url: "https://www.baidu.com/s?wd=" },
  { name: "Google", url: "https://www.google.com/search?q=" },
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
