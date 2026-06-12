import { create } from 'zustand'
import { 
  type AppSettings, 
  DEFAULT_APP_SETTINGS, 
  loadAppSettings, 
  persistAppSettings 
} from './app-settings'

interface AppSettingsStore extends AppSettings {
  setTheme: (theme: AppSettings['theme']) => void
  setSearchEngines: (engines: AppSettings['searchEngines']) => void
  setCurrentEngineIndex: (index: number) => void
  setLanguage: (language: string) => void
  setShowBookmarks: (show: boolean) => void
  setShowClock: (show: boolean) => void
  setShowWidgets: (show: boolean) => void
  setBackgroundImageUrl: (url: string) => void
  setBackgroundEnabled: (enabled: boolean) => void
  hydrate: () => Promise<void>
}

export const useAppSettings = create<AppSettingsStore>((set, get) => ({
  ...DEFAULT_APP_SETTINGS,
  
  setTheme: (theme) => {
    set({ theme })
    persistAppSettings(get())
  },
  
  setSearchEngines: (searchEngines) => {
    set({ searchEngines })
    persistAppSettings(get())
  },
  
  setCurrentEngineIndex: (currentEngineIndex) => {
    set({ currentEngineIndex })
    persistAppSettings(get())
  },
  
  setLanguage: (language) => {
    set({ language })
    persistAppSettings(get())
  },
  
  setShowBookmarks: (showBookmarks) => {
    set({ showBookmarks })
    persistAppSettings(get())
  },
  
  setShowClock: (showClock) => {
    set({ showClock })
    persistAppSettings(get())
  },
  
  setShowWidgets: (showWidgets) => {
    set({ showWidgets })
    persistAppSettings(get())
  },
  
  setBackgroundImageUrl: (backgroundImageUrl) => {
    set({ backgroundImageUrl })
    persistAppSettings(get())
  },
  
  setBackgroundEnabled: (backgroundEnabled) => {
    set({ backgroundEnabled })
    persistAppSettings(get())
  },
  
  hydrate: async () => {
    const settings = await loadAppSettings()
    set(settings)
  },
}))
