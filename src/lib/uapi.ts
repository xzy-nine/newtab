/**
 * UAPI（uapis.cn）统一客户端。
 *
 * 设计依据官方文档：
 * - 公平使用与速率限制：https://uapis.cn/docs/getting-started/fair-use-and-rate-limiting
 * - 错误处理指南：https://uapis.cn/docs/api-reference/how-to-handle-errors
 * - 认证（`Authorization: Bearer <key>`）：https://uapis.cn/docs/api-reference/sdks
 *
 * 核心策略（本项目的要求）：
 * **先匿名调用**（游客按 IP 计积分），只有真正触及限速 / 额度耗尽时才回退到密钥。
 * 这样绝大多数用户无需配置任何东西即可正常使用；配置了密钥的用户则在被限流后自动升级。
 *
 * 本模块只负责网络与协议层：错误归一化、退避重试、并发去重、匿名→密钥升级、
 * 以及必应壁纸的纯解析。业务语义（天气快照、活动日程）留在各自模块里。
 */

import { ensureUapiSettingsHydrated, useUapiSettings } from "@/lib/uapi-settings-store";

/** UAPI API 根地址。 */
export const UAPI_BASE = "https://uapis.cn/api/v1";

/** 密钥创建入口（设置页跳转用）。 */
export const UAPI_CONSOLE_URL = "https://uapis.cn/console";

/** 单次请求超时（毫秒）。 */
export const UAPI_FETCH_TIMEOUT_MS = 12 * 1000;

/** 最大尝试次数（含首次）。 */
export const UAPI_MAX_ATTEMPTS = 3;

/** 无 `Retry-After` 时的退避基数：500ms → 1000ms。 */
export const UAPI_BASE_BACKOFF_MS = 500;

/** 交互式调用默认能接受的最大退避时长：超过就直接失败，避免新标签页卡住。 */
export const UAPI_DEFAULT_MAX_RETRY_DELAY_MS = 10 * 1000;

/** 全局最小请求间隔：避免多个小部件同时挂载造成瞬时并发。 */
export const UAPI_MIN_REQUEST_INTERVAL_MS = 250;

/** 匿名被限速后的最小冷却时长；冷却期内若已配置密钥就直接带密钥。 */
export const UAPI_ANONYMOUS_COOLDOWN_MS = 60 * 1000;

/** 国服时区偏移（游客额度按月重置，按 UTC+8 计算次月边界）。 */
const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 壁纸缓存的下限（接口自带约 30 分钟缓存）。 */
const BING_WALLPAPER_MIN_TTL_MS = 5 * 60 * 1000;

/**
 * 壁纸缓存的上限。
 *
 * 「下一个 00:05 边界」最长就是接近 24 小时，所以这里取 24 小时仅作兜底，
 * 不是真正的截断点——若设得更短（例如 12 小时），下午打开新标签页会导致
 * 当天再拉一次 JSON，就违背了"一天一个请求"的初衷。
 */
const BING_WALLPAPER_MAX_TTL_MS = 24 * 60 * 60 * 1000;

/** 壁纸 JSON 解析失败时的直链兜底（服务端 302 / 直接返回图片）。 */
export const BING_WALLPAPER_FALLBACK_URL = `${UAPI_BASE}/image/bing-daily`;

/** 归一化后的错误类别，用于决定退避、升级密钥与用户提示。 */
type UapiErrorKind =
  | "rate-limit"
  | "quota"
  | "auth"
  | "insufficient-credits"
  | "cors"
  | "not-found"
  | "request"
  | "server"
  | "unavailable";

/** 归一化后的错误信息。 */
export interface UapiErrorInfo {
  /** HTTP 状态码；网络层失败为 0。 */
  status: number;
  /** 机器可读错误码；解析不出时回退为 `HTTP_<status>` / `NETWORK_ERROR`。 */
  code: string;
  kind: UapiErrorKind;
  /** 是否值得重试（依据文档的可重试状态码表）。 */
  retryable: boolean;
  /** `Retry-After` 换算出的等待毫秒数；缺失或非法为 null。 */
  retryAfterMs: number | null;
  /** 排查用的请求 ID（响应头 `X-Request-ID`）。 */
  requestId: string | null;
}

/** 携带结构化错误信息的异常。 */
export class UapiError extends Error {
  constructor(readonly info: UapiErrorInfo) {
    super(`${info.code} (HTTP ${info.status})`);
    this.name = "UapiError";
  }
}

/** 文档中可重试的状态码：408、429、500、502、503、504。 */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/** 文档「常见错误码」表 → 错误类别。 */
const CODE_KINDS: Record<string, UapiErrorKind> = {
  INVALID_PARAMETER: "request",
  INVALID_PARAMS: "request",
  INVALID_ARGUMENT: "request",
  INVALID_TIME_FORMAT: "request",
  INVALID_STATE: "request",
  UNAUTHORIZED: "auth",
  INSUFFICIENT_CREDITS: "insufficient-credits",
  CORS_FORBIDDEN: "cors",
  NOT_FOUND: "not-found",
  REQUEST_ENTITY_TOO_LARGE: "request",
  FILE_TOO_LARGE: "request",
  RATE_LIMIT_EXCEEDED: "rate-limit",
  SERVICE_BUSY: "rate-limit",
  VISITOR_MONTHLY_QUOTA_EXHAUSTED: "quota",
  INTERNAL_SERVER_ERROR: "server",
  UPSTREAM_TIMEOUT: "server",
  UPSTREAM_ERROR: "server",
  SERVICE_UNAVAILABLE: "unavailable",
};

/** 文档「常见错误码」表 → HTTP 状态码（响应体没给 code 时用状态码兜底）。 */
function kindOfStatus(status: number): UapiErrorKind {
  if (status === 429) return "rate-limit";
  if (status === 401) return "auth";
  if (status === 402) return "insufficient-credits";
  if (status === 403) return "cors";
  if (status === 404) return "not-found";
  if (status >= 400 && status < 500) return "request";
  if (status >= 500) return "unavailable";
  return "request";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 从响应体里取机器可读错误码；兼容 `{code}` 与壁纸接口的 `{error}` 两种形态。 */
function readErrorCode(body: unknown, status: number): string {
  const record = asRecord(body);
  if (record) {
    const code = record.code;
    if (typeof code === "string" && code.trim() !== "") return code.trim();
  }
  return `HTTP_${status}`;
}

/**
 * 把 HTTP 状态码 + 响应体 + 响应头归一化成结构化错误。
 *
 * 兼容两种情况：标准错误信封 `{code, message, details}`，
 * 以及少数接口（如必应壁纸）使用的 `{error: "..."}`。
 */
export function classifyUapiResponse(
  status: number,
  body: unknown,
  headers?: Headers | null,
  now = Date.now(),
): UapiErrorInfo {
  const code = readErrorCode(body, status);
  const kind = CODE_KINDS[code] ?? kindOfStatus(status);
  // 游客月额度要等到下月重置，重试没有意义；其余 429 属动态限速，可以退避重试。
  const retryable = RETRYABLE_STATUSES.has(status) && kind !== "quota";
  return {
    status,
    code,
    kind,
    retryable,
    retryAfterMs: parseRetryAfter(headers?.get?.("retry-after") ?? null, now),
    requestId: headers?.get?.("x-request-id") ?? null,
  };
}

/** 网络层失败（DNS / 超时 / 连接失败）归一化为可重试错误。 */
function networkErrorInfo(): UapiErrorInfo {
  return {
    status: 0,
    code: "NETWORK_ERROR",
    kind: "unavailable",
    retryable: true,
    retryAfterMs: null,
    requestId: null,
  };
}

/**
 * 解析 `Retry-After`：支持「秒数」与「HTTP-date」两种合法写法。
 * 缺失或非法返回 null。
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) return null;
  const raw = value.trim();
  if (raw === "") return null;

  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
  }

  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed - now);
}

/**
 * 退避时长：优先用服务端给的 `Retry-After`，否则指数退避（500ms、1000ms…）。
 * 结果按 `maxDelayMs` 封顶。
 */
export function backoffDelayMs(
  attempt: number,
  retryAfterMs: number | null,
  maxDelayMs = UAPI_DEFAULT_MAX_RETRY_DELAY_MS,
): number {
  const base = retryAfterMs ?? UAPI_BASE_BACKOFF_MS * 2 ** Math.max(0, attempt);
  return Math.min(Math.max(0, base), Math.max(0, maxDelayMs));
}

/**
 * 匿名请求失败后，是否值得改用密钥再试一次。
 *
 * - 限速 / 额度耗尽：密钥走独立配额，必须升级；
 * - 401 / 403（含 `CORS_FORBIDDEN`，文档明确建议「携带 Key」）：带上密钥可能就通了。
 *
 * 已经带密钥时永远返回 false，避免无意义的重试循环。
 */
export function shouldRetryWithKey(info: UapiErrorInfo, usedKey: boolean): boolean {
  if (usedKey) return false;
  if (info.kind === "rate-limit" || info.kind === "quota") return true;
  if (info.kind === "auth" || info.kind === "cors") return true;
  return false;
}

/**
 * 匿名被限流后应冷却到什么时候。
 *
 * - 游客月额度耗尽 → 次月 1 日 00:00（UTC+8），与文档「等待下月重置」一致；
 * - 动态限速 / 服务繁忙 → `now + max(Retry-After, 60s)`。
 *
 * 返回 0 表示无需冷却（该错误与匿名限流无关）。
 */
export function anonymousCooldownUntil(info: UapiErrorInfo, now = Date.now()): number {
  if (info.kind === "quota") {
    const shifted = new Date(now + CN_OFFSET_MS);
    const nextMonthUtcMs = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
    return nextMonthUtcMs - CN_OFFSET_MS;
  }
  if (info.kind !== "rate-limit") return 0;
  return now + Math.max(info.retryAfterMs ?? 0, UAPI_ANONYMOUS_COOLDOWN_MS);
}

/**
 * 从必应壁纸的 `format=json` 响应里取出图片地址。
 *
 * 优先高分辨率，再回退通用字段；响应体是错误形态（`{error}`）时返回 null。
 */
export function pickBingImageUrl(body: unknown, resolution: "4k" | "1080" = "4k"): string | null {
  const record = asRecord(body);
  if (!record) return null;
  // 壁纸接口的错误体是 {error: "..."}，不是标准信封
  if (typeof record.error === "string" && record.error.trim() !== "") return null;

  const keys =
    resolution === "1080"
      ? (["image_url_1080", "image_url", "image_url_4k"] as const)
      : (["image_url_4k", "image_url", "image_url_1080"] as const);

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/**
 * 壁纸缓存的 TTL：算到**下一个** 00:05（UTC+8），并限制在 5 分钟 ~ 24 小时之间。
 *
 * 壁纸按天更新（服务端另有约 30 分钟缓存），所以一天只需一个 JSON 请求；
 * 图片本身交给浏览器 HTTP 缓存，不再落盘成 data URL。
 *
 * 注意边界：若「今天的 00:05」尚未到达（即现在刚过 00:00），必须用它、
 * 而不是跳到明天，否则会把 24 小时的缓存压在刚换过壁纸的时刻上。
 */
export function bingWallpaperTtlMs(now = Date.now()): number {
  const shifted = new Date(now + CN_OFFSET_MS);
  const todayBoundaryMs =
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) +
    5 * 60 * 1000 -
    CN_OFFSET_MS;

  const boundaryMs =
    todayBoundaryMs > now ? todayBoundaryMs : todayBoundaryMs + 24 * 60 * 60 * 1000;
  const ttl = boundaryMs - now;
  return Math.min(BING_WALLPAPER_MAX_TTL_MS, Math.max(BING_WALLPAPER_MIN_TTL_MS, ttl));
}

/** 错误 → i18n 键名，供各调用点统一展示可读文案。 */
export function uapiErrorMessageKey(error: unknown): string {
  if (!(error instanceof UapiError)) return "uapiErrorUnavailable";
  switch (error.info.kind) {
    case "rate-limit":
      return "uapiErrorRateLimited";
    case "quota":
      return "uapiErrorQuotaExhausted";
    case "auth":
      return "uapiErrorUnauthorized";
    case "insufficient-credits":
      return "uapiErrorInsufficientCredits";
    case "not-found":
      return "uapiErrorNotFound";
    default:
      return "uapiErrorUnavailable";
  }
}

/**
 * 各错误键的中文兜底文案。
 *
 * 必须单独提供：`getMessage(key, default)` 在中文下会直接返回 `default`，
 * 只传键名是拿不到中文文案的。
 */
export const UAPI_ERROR_FALLBACKS: Record<string, string> = {
  uapiErrorRateLimited: "请求过于频繁，请稍后再试",
  uapiErrorQuotaExhausted: "本月游客额度已用尽，可在设置中配置密钥",
  uapiErrorUnauthorized: "密钥无效，请到设置中检查",
  uapiErrorInsufficientCredits: "账户余额不足",
  uapiErrorNotFound: "未找到相关数据",
  uapiErrorUnavailable: "服务暂时不可用，请稍后再试",
};

/**
 * 把任意错误转成可直接喂给 `getMessage` 的一对值（键 + 中文兜底）。
 *
 * 用法：`const { key, fallback } = uapiErrorText(e); setError(getMessage(key, fallback))`
 */
export function uapiErrorText(
  error: unknown,
  override?: string,
): { key: string; fallback: string } {
  const key = uapiErrorMessageKey(error);
  return { key, fallback: override ?? UAPI_ERROR_FALLBACKS[key] ?? "请求失败" };
}

/** 可选查询参数；`undefined` 的项会被忽略。 */
export type UapiQuery = Record<string, string | number | boolean | undefined>;

/** 调用选项。 */
export interface UapiRequestOptions {
  /** 查询参数。 */
  query?: UapiQuery;
  /** 单次调用能接受的最大退避时长；超过则快速失败（不阻塞界面）。 */
  maxRetryDelayMs?: number;
  /** 取消信号。 */
  signal?: AbortSignal;
  /**
   * 用户**主动刷新**：绕过本地节流（最小请求间隔）与并发去重，立即发一次真实请求。
   *
   * 服务端的 429 / 额度限制依然遵循（那是远端权威限制），但本项目自身的
   * 「礼貌节流」不应阻止用户明确要求的刷新。
   */
  force?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 拼接最终 URL：支持绝对地址，也支持相对路径。 */
export function buildUapiUrl(path: string, query?: UapiQuery): string {
  const base = /^https?:\/\//i.test(path)
    ? path
    : `${UAPI_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  if (!qs) return base;
  return base.includes("?") ? `${base}&${qs}` : `${base}?${qs}`;
}

/**
 * 全局限速闸门：保证相邻两次请求的**发起时刻**至少间隔
 * `UAPI_MIN_REQUEST_INTERVAL_MS`，避免多个小部件同时挂载造成瞬时并发。
 */
let lastRequestStartedAt = 0;
let slotChain: Promise<void> = Promise.resolve();

/**
 * 获取一次请求配额。
 *
 * `force` 为 true（用户主动刷新）时直接放行，不等待最小间隔；
 * 但仍会推进 `lastRequestStartedAt`，避免紧邻的下一次自动请求立刻贴上。
 */
async function acquireSlot(force: boolean): Promise<void> {
  if (force) {
    lastRequestStartedAt = Date.now();
    return;
  }
  const run = slotChain.then(async () => {
    const wait = lastRequestStartedAt + UAPI_MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await delay(wait);
    lastRequestStartedAt = Date.now();
  });
  slotChain = run.catch(() => undefined);
  return run;
}

/** 合并超时与外部取消信号。 */
function composeSignal(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(UAPI_FETCH_TIMEOUT_MS);
  if (!external || external.aborted) return external ?? timeout;

  const controller = new AbortController();
  const abort = () => controller.abort();
  timeout.addEventListener("abort", abort);
  external.addEventListener("abort", abort);
  return controller.signal;
}

interface RawResponse {
  status: number;
  body: unknown;
  headers: Headers | null;
}

/** 读取响应体：JSON 优先；空体或非 JSON 时返回 null 而不抛错。 */
async function readBody(response: Response): Promise<unknown> {
  // 生产环境的 Response 一定有 text()；测试替身可能只提供 json()。
  if (typeof response.text === "function") {
    let text = "";
    try {
      text = await response.text();
    } catch {
      return null;
    }
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 发一次请求。**绝不**把密钥写入日志或错误消息。
 */
async function requestOnce(
  url: string,
  apiKey: string | null,
  externalSignal?: AbortSignal,
): Promise<RawResponse> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    headers,
    signal: composeSignal(externalSignal),
  });

  return {
    status: response.status,
    body: await readBody(response),
    headers: response.headers ?? null,
  };
}

/** 进行中的请求：同一 URL + 同一认证模式只发一次。 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * 统一的 UAPI 请求入口。
 *
 * 认证策略：默认匿名（游客 IP 积分）；若已配置密钥且匿名处于冷却中则直接带密钥；
 * 匿名被限流 / 拒绝时自动带密钥重试一次。GET 请求幂等，升级重试是安全的。
 *
 * @throws UapiError 非 2xx 或网络层失败（含重试耗尽）。
 */
export async function uapiFetch<T>(path: string, options: UapiRequestOptions = {}): Promise<T> {
  const url = buildUapiUrl(path, options.query);
  const maxRetryDelayMs = options.maxRetryDelayMs ?? UAPI_DEFAULT_MAX_RETRY_DELAY_MS;

  await ensureUapiSettingsHydrated();
  const settings = useUapiSettings.getState();
  const configuredKey = settings.apiKey.trim();

  // 冷却期内不再浪费一次注定失败的匿名请求
  const cooldownActive = settings.anonymousBlockedUntil > Date.now();
  let useKey = Boolean(configuredKey) && (settings.preferKey || cooldownActive);

  const dedupeKey = `${url}|${useKey ? "key" : "anon"}`;
  // 主动刷新不去重：用户明确要求"现在就拉一次"，复用在途请求会让按钮看起来没反应
  if (!options.force) {
    const existing = inflight.get(dedupeKey) as Promise<T> | undefined;
    if (existing) return existing;
  }

  const task = (async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      let info: UapiErrorInfo;

      try {
        await acquireSlot(options.force === true && attempt === 0);
        const response = await requestOnce(url, useKey ? configuredKey : null, options.signal);
        if (response.status >= 200 && response.status < 300) return response.body as T;
        info = classifyUapiResponse(response.status, response.body, response.headers);
      } catch (error) {
        // 调用方主动取消：不重试、不记冷却
        if (options.signal?.aborted) throw error;
        info = networkErrorInfo();
      }

      // 1) 匿名被限流 / 拒绝且有密钥 → 立即带密钥重试（不计退避）
      if (!useKey && configuredKey && shouldRetryWithKey(info, false)) {
        markAnonymousBlocked(info);
        useKey = true;
        continue;
      }

      // 2) 匿名限流：即使没有密钥也记下冷却，避免反复撞墙
      if (!useKey && (info.kind === "rate-limit" || info.kind === "quota")) {
        markAnonymousBlocked(info);
      }

      // 3) 不可重试，或已用尽尝试次数
      if (!info.retryable || attempt >= UAPI_MAX_ATTEMPTS - 1) throw new UapiError(info);

      // 服务端要求的等待时间过长时不阻塞界面，直接失败让调用方走兜底
      if (info.retryAfterMs !== null && info.retryAfterMs > maxRetryDelayMs) {
        throw new UapiError(info);
      }

      await delay(backoffDelayMs(attempt, info.retryAfterMs, maxRetryDelayMs));
    }
  })();

  if (!options.force) {
    inflight.set(dedupeKey, task);
    try {
      return await task;
    } finally {
      inflight.delete(dedupeKey);
    }
  }
  return task;
}

/** 记录匿名冷却状态；失败不应影响主流程。 */
function markAnonymousBlocked(info: UapiErrorInfo): void {
  const until = anonymousCooldownUntil(info);
  if (until <= 0) return;
  useUapiSettings
    .getState()
    .markAnonymousBlocked(until, info.kind === "quota" ? "quota" : "rate-limit");
}

/**
 * 用给定密钥打一次真实请求以验证其有效性。
 *
 * 注意：**会消耗 1 积分**（`/network/myip` 标准数据源），设置页需要向用户说明。
 */
export async function testUapiKey(
  key: string,
): Promise<{ ok: true } | { ok: false; info: UapiErrorInfo }> {
  const trimmed = key.trim();
  if (!trimmed) {
    return {
      ok: false,
      info: {
        status: 0,
        code: "MISSING_KEY",
        kind: "auth",
        retryable: false,
        retryAfterMs: null,
        requestId: null,
      },
    };
  }

  try {
    // 用户在设置页主动点击测试：同样绕过本地节流
    await acquireSlot(true);
    const response = await requestOnce(`${UAPI_BASE}/network/myip`, trimmed);
    if (response.status >= 200 && response.status < 300) return { ok: true };
    return {
      ok: false,
      info: classifyUapiResponse(response.status, response.body, response.headers),
    };
  } catch {
    return { ok: false, info: networkErrorInfo() };
  }
}
