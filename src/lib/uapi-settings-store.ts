/**
 * UAPI 设置的 zustand store。
 *
 * 与 `app-settings-store.ts` 同构，但**只写 `browser.storage.local`**，不参与云同步。
 * `apiKey` 因此不会进入 `chrome.storage.sync` 的载荷。
 */

import { create } from "zustand";
import {
  type UapiAnonymousBlockReason,
  type UapiKeyCheckResult,
  type UapiSettings,
  DEFAULT_UAPI_SETTINGS,
  loadUapiSettings,
  persistUapiSettings,
} from "@/lib/uapi-settings";

interface UapiSettingsStore extends UapiSettings {
  /** 本次会话是否已从存储hydrate 过。 */
  hydrated: boolean;
  setApiKey: (apiKey: string) => void;
  setPreferKey: (preferKey: boolean) => void;
  setLastCheck: (lastCheck: UapiKeyCheckResult | null) => void;
  /** 记录匿名被限流。 */
  markAnonymousBlocked: (until: number, reason: UapiAnonymousBlockReason) => void;
  /** 清除匿名冷却（设置页「立即恢复匿名尝试」）。 */
  clearAnonymousBlock(): void;
  hydrate: () => Promise<void>;
}

export const useUapiSettings = create<UapiSettingsStore>((set, get) => ({
  ...DEFAULT_UAPI_SETTINGS,
  hydrated: false,

  setApiKey: (apiKey) => {
    set({ apiKey });
    void persistUapiSettings(get());
  },

  setPreferKey: (preferKey) => {
    set({ preferKey });
    void persistUapiSettings(get());
  },

  setLastCheck: (lastCheck) => {
    set({ lastCheck });
    void persistUapiSettings(get());
  },

  markAnonymousBlocked: (until, reason) => {
    // 已经处于更晚的冷却中时不要缩短它（例如月额度冷却期间又来一次动态限速）
    if (get().anonymousBlockedUntil >= until) return;
    set({ anonymousBlockedUntil: until, anonymousBlockedReason: reason });
    void persistUapiSettings(get());
  },

  clearAnonymousBlock: () => {
    set({ anonymousBlockedUntil: 0, anonymousBlockedReason: "" });
    void persistUapiSettings(get());
  },

  hydrate: async () => {
    const settings = await loadUapiSettings();
    set({ ...settings, hydrated: true });
  },
}));

let hydratePromise: Promise<void> | null = null;

/**
 * 幂等的惰性 hydrate。
 *
 * 网络层（`uapi.ts`）在每次请求前调用它，确保「小部件 effect 早于根组件
 * hydrate」时也能读到正确的密钥与冷却状态；成功后才缓存 Promise，
 * 失败则允许下次重试。
 */
export function ensureUapiSettingsHydrated(): Promise<void> {
  const { hydrated } = useUapiSettings.getState();
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = useUapiSettings
      .getState()
      .hydrate()
      .catch(() => {
        hydratePromise = null;
      });
  }
  return hydratePromise;
}
