import { create } from "zustand";
import {
  type AppSettings,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  persistAppSettings,
} from "./app-settings";

interface AppSettingsStore extends AppSettings {
  setTheme: (theme: AppSettings["theme"]) => void;
  setSearchEngines: (engines: AppSettings["searchEngines"]) => void;
  setCurrentEngineIndex: (index: number) => void;
  setLanguage: (language: string) => void;
  setShowBookmarks: (show: boolean) => void;
  setShowClock: (show: boolean) => void;
  setUse12hClock: (use12h: boolean) => void;
  setShowSeconds: (show: boolean) => void;
  setShowWidgets: (show: boolean) => void;
  setBackgroundImageUrl: (url: string) => void;
  setBackgroundEnabled: (enabled: boolean) => void;
  setBgType: (type: AppSettings["bgType"]) => void;
  setCustomImage: (image: string | null) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundDark: (dark: number) => void;
  setAiEnabled: (enabled: boolean) => void;
  setAiProviders: (providers: AppSettings["aiProviders"]) => void;
  setAiCurrentProviderIndex: (index: number) => void;
  setAiSystemPrompt: (prompt: string) => void;
  setAiQuickPrompts: (prompts: string[]) => void;
  setSyncMode: (mode: AppSettings["syncMode"]) => void;
  setSyncInterval: (interval: number) => void;
  hydrate: () => Promise<void>;
}

export const useAppSettings = create<AppSettingsStore>((set, get) => ({
  ...DEFAULT_APP_SETTINGS,

  setTheme: (theme) => {
    set({ theme });
    persistAppSettings(get());
  },

  setSearchEngines: (searchEngines) => {
    set({ searchEngines });
    persistAppSettings(get());
  },

  setCurrentEngineIndex: (currentEngineIndex) => {
    set({ currentEngineIndex });
    persistAppSettings(get());
  },

  setLanguage: (language) => {
    set({ language });
    persistAppSettings(get());
  },

  setShowBookmarks: (showBookmarks) => {
    set({ showBookmarks });
    persistAppSettings(get());
  },

  setShowClock: (showClock) => {
    set({ showClock });
    persistAppSettings(get());
  },

  setUse12hClock: (use12hClock) => {
    set({ use12hClock });
    persistAppSettings(get());
  },

  setShowSeconds: (showSeconds) => {
    set({ showSeconds });
    persistAppSettings(get());
  },

  setShowWidgets: (showWidgets) => {
    set({ showWidgets });
    persistAppSettings(get());
  },

  setBackgroundImageUrl: (backgroundImageUrl) => {
    set({ backgroundImageUrl });
    persistAppSettings(get());
  },

  setBackgroundEnabled: (backgroundEnabled) => {
    set({ backgroundEnabled });
    persistAppSettings(get());
  },

  setBgType: (bgType) => {
    set({ bgType });
    persistAppSettings(get());
  },

  setCustomImage: (customImage) => {
    set({ customImage });
    persistAppSettings(get());
  },

  setBackgroundBlur: (backgroundBlur) => {
    set({ backgroundBlur });
    persistAppSettings(get());
  },

  setBackgroundDark: (backgroundDark) => {
    set({ backgroundDark });
    persistAppSettings(get());
  },

  setAiEnabled: (aiEnabled) => {
    set({ aiEnabled });
    persistAppSettings(get());
  },

  setAiProviders: (aiProviders) => {
    set({ aiProviders });
    persistAppSettings(get());
  },

  setAiCurrentProviderIndex: (aiCurrentProviderIndex) => {
    set({ aiCurrentProviderIndex });
    persistAppSettings(get());
  },

  setAiSystemPrompt: (aiSystemPrompt) => {
    set({ aiSystemPrompt });
    persistAppSettings(get());
  },

  setAiQuickPrompts: (aiQuickPrompts) => {
    set({ aiQuickPrompts });
    persistAppSettings(get());
  },

  setSyncMode: (syncMode) => {
    set({ syncMode });
    persistAppSettings(get());
  },

  setSyncInterval: (syncInterval) => {
    set({ syncInterval });
    persistAppSettings(get());
  },

  hydrate: async () => {
    const settings = await loadAppSettings();
    set(settings);
  },
}));
