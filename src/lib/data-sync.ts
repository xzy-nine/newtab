import { getMessage } from "@/lib/i18n";
import { type AppSettings, APP_SETTINGS_STORAGE_KEY, persistAppSettings } from "@/lib/app-settings";
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

  async function download(): Promise<void> {
    const result = await chrome.storage.sync.get(APP_SETTINGS_STORAGE_KEY);
    const cloudData = result[APP_SETTINGS_STORAGE_KEY] as Partial<AppSettings> | undefined;

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
