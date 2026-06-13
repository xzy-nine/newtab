import { getMessage } from "@/lib/i18n";
import {
  type AppSettings,
  type BgType,
  APP_SETTINGS_STORAGE_KEY,
  persistAppSettings,
} from "@/lib/app-settings";
import { useAppSettings } from "@/lib/app-settings-store";

export interface CloudDataInfo {
  keyCount: number;
  dataSize: number;
  remainingQuota: number;
  keys: string[];
}

const SYNC_QUOTA_BYTES = 100 * 1024;

type SettingsChangeCallback = () => void;

function createDataSyncService() {
  let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeStore: (() => void) | null = null;
  const changeListeners: Set<SettingsChangeCallback> = new Set();

  function notifyChange() {
    changeListeners.forEach((cb) => cb());
  }

  function onSettingsChanged(callback: SettingsChangeCallback): () => void {
    changeListeners.add(callback);
    return () => {
      changeListeners.delete(callback);
    };
  }

  function getFilteredSettingsData(settings: AppSettings): Partial<AppSettings> {
    const { syncMode: _syncMode, syncInterval: _syncInterval, ...data } = settings;
    return data;
  }

  function calculateDataSize(data: unknown): number {
    return new Blob([JSON.stringify(data)]).size;
  }

  async function upload(): Promise<void> {
    const settings = useAppSettings.getState();
    const dataToSync = getFilteredSettingsData(settings);
    const dataSize = calculateDataSize(dataToSync);

    if (dataSize > SYNC_QUOTA_BYTES) {
      throw new Error(getMessage("dataTooLarge", "数据太大，超出云端存储限制（100KB）"));
    }

    await chrome.storage.sync.set({ [APP_SETTINGS_STORAGE_KEY]: dataToSync });
  }

  /**
   * 尝试从旧版平铺键中读取云端同步数据（兼容 public→src 升级）
   */
  async function tryDownloadLegacySyncData(): Promise<Partial<AppSettings> | null> {
    const legacyKeys = [
      "language",
      "theme",
      "background-type",
      "background-image",
      "search-engines",
      "current-engine-index",
      "ai-enabled",
      "clock-format",
      "clock-show-seconds",
      "widgets",
    ];
    const result = await chrome.storage.sync.get(legacyKeys);
    const hasAny = legacyKeys.some((k) => result[k] !== undefined);
    if (!hasAny) return null;

    const legacy: Partial<AppSettings> = {};
    if (result.language === "zh" || result.language === "en") legacy.language = result.language;
    if (result.theme === "auto") legacy.theme = "system";
    else if (result.theme === "light" || result.theme === "dark") legacy.theme = result.theme;
    if (result["clock-format"] !== undefined) legacy.use12hClock = result["clock-format"] === "12h";
    if (result["clock-show-seconds"] !== undefined)
      legacy.showSeconds = result["clock-show-seconds"] === "true";
    legacy.backgroundEnabled = true;
    if (
      result["background-type"] === "bing" ||
      result["background-type"] === "custom" ||
      result["background-type"] === "default"
    ) {
      legacy.bgType = result["background-type"] as BgType;
    }

    return legacy;
  }

  async function download(): Promise<void> {
    const result = await chrome.storage.sync.get(APP_SETTINGS_STORAGE_KEY);
    let cloudData = result[APP_SETTINGS_STORAGE_KEY] as Partial<AppSettings> | undefined;

    if (!cloudData || Object.keys(cloudData).length === 0) {
      const legacyData = await tryDownloadLegacySyncData();
      if (legacyData) {
        cloudData = legacyData;
      }
    }

    if (!cloudData || Object.keys(cloudData).length === 0) {
      throw new Error(getMessage("noCloudData", "云端没有找到数据"));
    }

    const currentSettings = useAppSettings.getState();
    const mergedSettings: AppSettings = {
      ...currentSettings,
      ...cloudData,
      syncMode: currentSettings.syncMode,
      syncInterval: currentSettings.syncInterval,
    };

    const normalized = await persistAppSettings(mergedSettings);
    useAppSettings.setState(normalized);
  }

  async function clear(): Promise<void> {
    await chrome.storage.sync.remove(APP_SETTINGS_STORAGE_KEY);
  }

  async function check(): Promise<CloudDataInfo | null> {
    const result = await chrome.storage.sync.get(APP_SETTINGS_STORAGE_KEY);
    const cloudData = result[APP_SETTINGS_STORAGE_KEY];
    const keys = cloudData ? Object.keys(cloudData) : [];

    if (keys.length === 0) return null;

    const dataSize = calculateDataSize(cloudData);

    return {
      keyCount: keys.length,
      dataSize,
      remainingQuota: SYNC_QUOTA_BYTES - dataSize,
      keys,
    };
  }

  function startAutoSync(): void {
    stopAutoSync();

    const { syncInterval } = useAppSettings.getState();
    if (syncInterval <= 0) return;

    autoSyncTimer = setInterval(async () => {
      try {
        const { syncMode } = useAppSettings.getState();
        if (syncMode === "upload") {
          await upload();
        } else if (syncMode === "download") {
          await download();
        }
        notifyChange();
      } catch (error) {
        console.error(getMessage("autoSyncFailed", "自动同步失败:"), error);
      }
    }, syncInterval * 1000);
  }

  function stopAutoSync(): void {
    if (autoSyncTimer !== null) {
      clearInterval(autoSyncTimer);
      autoSyncTimer = null;
    }
  }

  function start(): void {
    const { syncMode } = useAppSettings.getState();
    if (syncMode !== "disabled") {
      startAutoSync();
    }

    unsubscribeStore = useAppSettings.subscribe((state, prevState) => {
      if (state.syncMode !== prevState.syncMode || state.syncInterval !== prevState.syncInterval) {
        if (state.syncMode !== "disabled") {
          startAutoSync();
        } else {
          stopAutoSync();
        }
        notifyChange();
      }
    });
  }

  function stop(): void {
    stopAutoSync();

    if (unsubscribeStore) {
      unsubscribeStore();
      unsubscribeStore = null;
    }

    changeListeners.clear();
  }

  return {
    start,
    stop,
    upload,
    download,
    clear,
    check,
    onSettingsChanged,
  };
}

export const dataSync = createDataSyncService();
