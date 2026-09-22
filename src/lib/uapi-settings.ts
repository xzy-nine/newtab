/**
 * UAPI 密钥与限速状态的本地存储。
 *
 * **刻意不放进 `AppSettings`**：`data-sync.ts` 会把 AppSettings 里除
 * `syncMode` / `syncInterval` 外的全部字段上传到 `chrome.storage.sync`，
 * 而密钥是消耗额度的凭据，不应离开本机。因此这里单独使用 `browser.storage.local`。
 */

/** 独立的存储键（与 `newtab:app-settings` 并列，但不参与云同步）。 */
export const UAPI_SETTINGS_STORAGE_KEY = "newtab:uapi-settings";

/** 匿名冷却原因。 */
export type UapiAnonymousBlockReason = "" | "rate-limit" | "quota";

/** 上一次密钥校验结果。 */
export interface UapiKeyCheckResult {
  at: number;
  ok: boolean;
  code?: string;
  status?: number;
}

/** UAPI 相关设置。 */
export interface UapiSettings {
  /** 用户在 https://uapis.cn/console 创建的密钥；为空表示仅用游客积分。 */
  apiKey: string;
  /** 始终携带密钥（默认 false = 匿名优先，触及限速才升级）。 */
  preferKey: boolean;
  /** 匿名被限流后的冷却截止时间戳；0 表示无冷却。 */
  anonymousBlockedUntil: number;
  /** 冷却原因，用于设置页展示与提示文案。 */
  anonymousBlockedReason: UapiAnonymousBlockReason;
  /** 上一次「测试密钥」的结果。 */
  lastCheck: UapiKeyCheckResult | null;
}

export const DEFAULT_UAPI_SETTINGS: UapiSettings = {
  apiKey: "",
  preferKey: false,
  anonymousBlockedUntil: 0,
  anonymousBlockedReason: "",
  lastCheck: null,
};

function isBlockReason(value: unknown): value is UapiAnonymousBlockReason {
  return value === "" || value === "rate-limit" || value === "quota";
}

function normalizeLastCheck(value: unknown): UapiKeyCheckResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<UapiKeyCheckResult>;
  if (typeof record.at !== "number" || !Number.isFinite(record.at)) return null;
  if (typeof record.ok !== "boolean") return null;
  const result: UapiKeyCheckResult = { at: record.at, ok: record.ok };
  if (typeof record.code === "string") result.code = record.code;
  if (typeof record.status === "number") result.status = record.status;
  return result;
}

/** 把任意来源（旧版本、外部写入、损坏数据）归一化成合法设置。 */
export function normalizeUapiSettings(value: unknown): UapiSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_UAPI_SETTINGS };
  const candidate = value as Partial<UapiSettings>;

  const blockedUntil =
    typeof candidate.anonymousBlockedUntil === "number" &&
    Number.isFinite(candidate.anonymousBlockedUntil) &&
    candidate.anonymousBlockedUntil > 0
      ? candidate.anonymousBlockedUntil
      : 0;

  return {
    apiKey: typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "",
    preferKey: candidate.preferKey === true,
    anonymousBlockedUntil: blockedUntil,
    // 冷却已过期（或本就不存在）时把原因一并清掉，避免设置页显示陈旧的「已耗尽」
    anonymousBlockedReason:
      blockedUntil > 0 && isBlockReason(candidate.anonymousBlockedReason)
        ? candidate.anonymousBlockedReason
        : "",
    lastCheck: normalizeLastCheck(candidate.lastCheck),
  };
}

/** 读取本地设置；缺失或损坏时返回默认值。 */
export async function loadUapiSettings(): Promise<UapiSettings> {
  try {
    const stored = await browser.storage.local.get(UAPI_SETTINGS_STORAGE_KEY);
    return normalizeUapiSettings(stored[UAPI_SETTINGS_STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_UAPI_SETTINGS };
  }
}

/** 写入本地设置，返回归一化后的结果。 */
export async function persistUapiSettings(next: UapiSettings): Promise<UapiSettings> {
  const normalized = normalizeUapiSettings(next);
  try {
    await browser.storage.local.set({ [UAPI_SETTINGS_STORAGE_KEY]: normalized });
  } catch {
    // 存储不可用（隐私模式等）不应影响主流程
  }
  return normalized;
}
