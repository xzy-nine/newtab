import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DEFAULT_UAPI_SETTINGS,
  UAPI_SETTINGS_STORAGE_KEY,
  loadUapiSettings,
  normalizeUapiSettings,
  persistUapiSettings,
} from "@/lib/uapi-settings";
import { ensureUapiSettingsHydrated, useUapiSettings } from "@/lib/uapi-settings-store";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "@/lib/app-settings";

/** 最小可用的 browser.storage.local 替身。 */
function stubBrowserStorage() {
  const store = new Map<string, unknown>();
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: async (key: string) =>
          store.has(key) ? { [key]: store.get(key) } : ({} as Record<string, unknown>),
        set: async (items: Record<string, unknown>) => {
          for (const [k, v] of Object.entries(items)) store.set(k, v);
        },
      },
    },
  });
  return store;
}

describe("normalizeUapiSettings", () => {
  it("returns defaults for unusable input", () => {
    expect(normalizeUapiSettings(null)).toEqual(DEFAULT_UAPI_SETTINGS);
    expect(normalizeUapiSettings("nope")).toEqual(DEFAULT_UAPI_SETTINGS);
    expect(normalizeUapiSettings(undefined)).toEqual(DEFAULT_UAPI_SETTINGS);
  });

  it("trims the api key and coerces preferKey to a boolean", () => {
    expect(normalizeUapiSettings({ apiKey: "  abc  " })).toMatchObject({ apiKey: "abc" });
    expect(normalizeUapiSettings({ preferKey: "yes" })).toMatchObject({ preferKey: false });
    expect(normalizeUapiSettings({ preferKey: true })).toMatchObject({ preferKey: true });
  });

  it("discards a negative or non-numeric cooldown", () => {
    expect(normalizeUapiSettings({ anonymousBlockedUntil: -5 }).anonymousBlockedUntil).toBe(0);
    expect(normalizeUapiSettings({ anonymousBlockedUntil: Number.NaN }).anonymousBlockedUntil).toBe(
      0,
    );
    expect(normalizeUapiSettings({ anonymousBlockedUntil: "soon" }).anonymousBlockedUntil).toBe(0);
  });

  it("clears the block reason when there is no active cooldown", () => {
    // 冷却结束后不该留下陈旧的「额度已耗尽」提示
    expect(
      normalizeUapiSettings({ anonymousBlockedUntil: 0, anonymousBlockedReason: "quota" })
        .anonymousBlockedReason,
    ).toBe("");
    expect(
      normalizeUapiSettings({ anonymousBlockedUntil: 1234, anonymousBlockedReason: "bogus" })
        .anonymousBlockedReason,
    ).toBe("");
    expect(
      normalizeUapiSettings({ anonymousBlockedUntil: 1234, anonymousBlockedReason: "quota" })
        .anonymousBlockedReason,
    ).toBe("quota");
  });

  it("keeps a well formed lastCheck and drops a malformed one", () => {
    expect(normalizeUapiSettings({ lastCheck: { at: 1, ok: true, code: "OK" } }).lastCheck).toEqual(
      {
        at: 1,
        ok: true,
        code: "OK",
      },
    );
    expect(normalizeUapiSettings({ lastCheck: { at: "x", ok: true } }).lastCheck).toBeNull();
    expect(normalizeUapiSettings({ lastCheck: { at: 1 } }).lastCheck).toBeNull();
  });
});

describe("loadUapiSettings / persistUapiSettings", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("round-trips settings through browser.storage.local", async () => {
    await persistUapiSettings({ ...DEFAULT_UAPI_SETTINGS, apiKey: "k-1", preferKey: true });
    await expect(loadUapiSettings()).resolves.toMatchObject({ apiKey: "k-1", preferKey: true });
  });

  it("returns defaults when nothing is stored", async () => {
    await expect(loadUapiSettings()).resolves.toEqual(DEFAULT_UAPI_SETTINGS);
  });

  it("returns defaults rather than throwing when storage is unavailable", async () => {
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: async () => {
            throw new Error("denied");
          },
          set: async () => {
            throw new Error("denied");
          },
        },
      },
    });
    await expect(loadUapiSettings()).resolves.toEqual(DEFAULT_UAPI_SETTINGS);
    await expect(persistUapiSettings(DEFAULT_UAPI_SETTINGS)).resolves.toEqual(
      DEFAULT_UAPI_SETTINGS,
    );
  });
});

describe("key storage isolation from cloud sync", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("uses its own storage key, separate from app settings", () => {
    expect(UAPI_SETTINGS_STORAGE_KEY).not.toBe("newtab:app-settings");
  });

  it("keeps the uapi key out of AppSettings, so data-sync never uploads it", () => {
    // data-sync 上传的是 AppSettings 减去 syncMode/syncInterval 后的全部字段，
    // 因此只要 AppSettings 里没有 UAPI 密钥字段，密钥就不可能进入 chrome.storage.sync
    // （注意：AI Provider 自己的 apiKey 是另一回事，本就随设置同步）。
    const serialized = JSON.stringify(DEFAULT_APP_SETTINGS);
    expect(serialized).not.toMatch(/uapi/i);
    // 归一化也不会凭空引入该字段
    expect(Object.keys(normalizeAppSettings({}))).not.toContain("uapiApiKey");
    expect(normalizeAppSettings({})).not.toHaveProperty("uapiApiKey");
  });
});

describe("useUapiSettings store", () => {
  beforeEach(() => {
    stubBrowserStorage();
    useUapiSettings.setState({ ...DEFAULT_UAPI_SETTINGS, hydrated: false });
    vi.resetModules();
  });

  it("persists setApiKey and setPreferKey", async () => {
    useUapiSettings.getState().setApiKey("k-2");
    useUapiSettings.getState().setPreferKey(true);
    await expect(loadUapiSettings()).resolves.toMatchObject({ apiKey: "k-2", preferKey: true });
  });

  it("never shortens an existing cooldown", () => {
    // 月额度冷却期间又来一次动态限速，不能被缩短
    useUapiSettings.getState().markAnonymousBlocked(10_000, "quota");
    useUapiSettings.getState().markAnonymousBlocked(1_000, "rate-limit");
    expect(useUapiSettings.getState().anonymousBlockedUntil).toBe(10_000);
    expect(useUapiSettings.getState().anonymousBlockedReason).toBe("quota");
  });

  it("extends to a later cooldown", () => {
    useUapiSettings.getState().markAnonymousBlocked(1_000, "rate-limit");
    useUapiSettings.getState().markAnonymousBlocked(10_000, "quota");
    expect(useUapiSettings.getState().anonymousBlockedUntil).toBe(10_000);
    expect(useUapiSettings.getState().anonymousBlockedReason).toBe("quota");
  });

  it("clears the cooldown on demand", () => {
    useUapiSettings.getState().markAnonymousBlocked(10_000, "quota");
    useUapiSettings.getState().clearAnonymousBlock();
    expect(useUapiSettings.getState().anonymousBlockedUntil).toBe(0);
    expect(useUapiSettings.getState().anonymousBlockedReason).toBe("");
  });
});

describe("ensureUapiSettingsHydrated", () => {
  beforeEach(() => {
    stubBrowserStorage();
  });

  it("hydrates once and marks the store hydrated", async () => {
    useUapiSettings.setState({ ...DEFAULT_UAPI_SETTINGS, hydrated: false });
    await persistUapiSettings({ ...DEFAULT_UAPI_SETTINGS, apiKey: "stored-key" });

    await ensureUapiSettingsHydrated();
    expect(useUapiSettings.getState().hydrated).toBe(true);
    expect(useUapiSettings.getState().apiKey).toBe("stored-key");
  });

  it("is a no-op once hydrated", async () => {
    useUapiSettings.setState({ ...DEFAULT_UAPI_SETTINGS, apiKey: "in-memory", hydrated: true });
    await ensureUapiSettingsHydrated();
    expect(useUapiSettings.getState().apiKey).toBe("in-memory");
  });
});
