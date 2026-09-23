import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BING_WALLPAPER_FALLBACK_URL,
  UAPI_BASE,
  UAPI_MAX_ATTEMPTS,
  UapiError,
  anonymousCooldownUntil,
  backoffDelayMs,
  bingWallpaperTtlMs,
  buildUapiUrl,
  classifyUapiResponse,
  parseRetryAfter,
  pickBingImageUrl,
  shouldRetryWithKey,
  testUapiKey,
  uapiErrorMessageKey,
  uapiFetch,
} from "@/lib/uapi";
import { useUapiSettings } from "@/lib/uapi-settings-store";

/** 构造一个 fetch 响应替身：`uapiFetch` 依赖 status / text() / headers。 */
function rawResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
    json: async () => body,
    headers: new Headers(headers),
  } as unknown as Response;
}

describe("classifyUapiResponse", () => {
  it("maps documented error codes to their kind", () => {
    const cases: Array<[number, string, string]> = [
      [429, "RATE_LIMIT_EXCEEDED", "rate-limit"],
      [429, "SERVICE_BUSY", "rate-limit"],
      [429, "VISITOR_MONTHLY_QUOTA_EXHAUSTED", "quota"],
      [401, "UNAUTHORIZED", "auth"],
      [402, "INSUFFICIENT_CREDITS", "insufficient-credits"],
      [403, "CORS_FORBIDDEN", "cors"],
      [404, "NOT_FOUND", "not-found"],
      [400, "INVALID_PARAMETER", "request"],
      [500, "INTERNAL_SERVER_ERROR", "server"],
      [503, "SERVICE_UNAVAILABLE", "unavailable"],
    ];
    for (const [status, code, kind] of cases) {
      expect(classifyUapiResponse(status, { code }).kind).toBe(kind);
    }
  });

  it("falls back to the status code when the body has no machine code", () => {
    expect(classifyUapiResponse(404, null).code).toBe("HTTP_404");
    expect(classifyUapiResponse(429, { error: "壁纸获取失败" }).code).toBe("HTTP_429");
  });

  it("accepts the {error} envelope used by the wallpaper endpoint", () => {
    // 必应壁纸的错误体不是标准信封，但仍应按状态码归类
    const info = classifyUapiResponse(500, { error: "必应壁纸获取失败" });
    expect(info.kind).toBe("unavailable");
    expect(info.status).toBe(500);
  });

  it("marks documented retryable statuses and keeps 4xx terminal", () => {
    expect(classifyUapiResponse(429, { code: "RATE_LIMIT_EXCEEDED" }).retryable).toBe(true);
    expect(classifyUapiResponse(503, { code: "SERVICE_UNAVAILABLE" }).retryable).toBe(true);
    expect(classifyUapiResponse(500, { code: "INTERNAL_SERVER_ERROR" }).retryable).toBe(true);
    // 参数错误不能重试：修好请求才有意义
    expect(classifyUapiResponse(400, { code: "INVALID_PARAMETER" }).retryable).toBe(false);
    expect(classifyUapiResponse(401, { code: "UNAUTHORIZED" }).retryable).toBe(false);
    expect(classifyUapiResponse(404, { code: "NOT_FOUND" }).retryable).toBe(false);
  });

  it("never retries an exhausted visitor monthly quota", () => {
    // 额度要等下月重置，退避重试只会浪费请求
    expect(classifyUapiResponse(429, { code: "VISITOR_MONTHLY_QUOTA_EXHAUSTED" }).retryable).toBe(
      false,
    );
  });

  it("keeps Retry-After and X-Request-ID from the response headers", () => {
    const info = classifyUapiResponse(
      429,
      { code: "RATE_LIMIT_EXCEEDED" },
      new Headers({ "Retry-After": "30", "X-Request-ID": "req-123" }),
      1_000_000,
    );
    expect(info.retryAfterMs).toBe(30_000);
    expect(info.requestId).toBe("req-123");
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-02-19T00:00:00Z");

  it("parses a delay in seconds", () => {
    expect(parseRetryAfter("30", now)).toBe(30_000);
    expect(parseRetryAfter("0", now)).toBe(0);
  });

  it("parses an HTTP-date", () => {
    expect(parseRetryAfter("Thu, 19 Feb 2026 00:00:20 GMT", now)).toBe(20_000);
  });

  it("clamps a past HTTP-date to zero instead of going negative", () => {
    expect(parseRetryAfter("Thu, 19 Feb 2026 00:00:00 GMT", now)).toBe(0);
  });

  it("returns null for missing or malformed values", () => {
    expect(parseRetryAfter(null, now)).toBeNull();
    expect(parseRetryAfter("", now)).toBeNull();
    expect(parseRetryAfter("soon", now)).toBeNull();
  });
});

describe("backoffDelayMs", () => {
  it("uses exponential backoff without Retry-After", () => {
    expect(backoffDelayMs(0, null)).toBe(500);
    expect(backoffDelayMs(1, null)).toBe(1000);
    expect(backoffDelayMs(2, null)).toBe(2000);
  });

  it("prefers the server-provided Retry-After", () => {
    expect(backoffDelayMs(2, 7000)).toBe(7000);
  });

  it("caps at maxDelayMs", () => {
    expect(backoffDelayMs(5, null, 1500)).toBe(1500);
    expect(backoffDelayMs(0, 60_000, 5000)).toBe(5000);
  });
});

describe("shouldRetryWithKey", () => {
  const info = (kind: string) =>
    classifyUapiResponse(429, { code: "RATE_LIMIT_EXCEEDED" }).kind === kind;

  it("escalates to the key on rate limiting and quota exhaustion", () => {
    expect(
      shouldRetryWithKey(classifyUapiResponse(429, { code: "RATE_LIMIT_EXCEEDED" }), false),
    ).toBe(true);
    expect(
      shouldRetryWithKey(
        classifyUapiResponse(429, { code: "VISITOR_MONTHLY_QUOTA_EXHAUSTED" }),
        false,
      ),
    ).toBe(true);
    expect(info("rate-limit")).toBe(true);
  });

  it("escalates on auth and CORS rejection while anonymous", () => {
    // 文档对 CORS_FORBIDDEN 的建议就是「携带 Key」
    expect(shouldRetryWithKey(classifyUapiResponse(401, { code: "UNAUTHORIZED" }), false)).toBe(
      true,
    );
    expect(shouldRetryWithKey(classifyUapiResponse(403, { code: "CORS_FORBIDDEN" }), false)).toBe(
      true,
    );
  });

  it("never escalates once the key is already in use", () => {
    expect(
      shouldRetryWithKey(classifyUapiResponse(429, { code: "RATE_LIMIT_EXCEEDED" }), true),
    ).toBe(false);
    expect(shouldRetryWithKey(classifyUapiResponse(401, { code: "UNAUTHORIZED" }), true)).toBe(
      false,
    );
  });

  it("does not escalate on unrelated client errors", () => {
    expect(shouldRetryWithKey(classifyUapiResponse(404, { code: "NOT_FOUND" }), false)).toBe(false);
    expect(
      shouldRetryWithKey(classifyUapiResponse(400, { code: "INVALID_PARAMETER" }), false),
    ).toBe(false);
  });
});

describe("anonymousCooldownUntil", () => {
  const now = Date.parse("2026-02-19T00:00:00Z");

  it("waits until the first day of next month (UTC+8) when the quota is exhausted", () => {
    const info = classifyUapiResponse(429, { code: "VISITOR_MONTHLY_QUOTA_EXHAUSTED" });
    const until = anonymousCooldownUntil(info, now);
    // 2026-03-01 00:00 UTC+8 === 2026-02-28 16:00 UTC
    expect(new Date(until).toISOString()).toBe("2026-02-28T16:00:00.000Z");
  });

  it("rolls over the year boundary for a December quota exhaustion", () => {
    const december = Date.parse("2026-12-20T00:00:00Z");
    const info = classifyUapiResponse(429, { code: "VISITOR_MONTHLY_QUOTA_EXHAUSTED" });
    const until = anonymousCooldownUntil(info, december);
    expect(new Date(until).toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  it("uses at least a one minute cooldown for dynamic rate limiting", () => {
    const info = classifyUapiResponse(429, { code: "RATE_LIMIT_EXCEEDED" });
    expect(anonymousCooldownUntil(info, now)).toBe(now + 60_000);
  });

  it("honours a longer Retry-After", () => {
    const info = classifyUapiResponse(
      429,
      { code: "RATE_LIMIT_EXCEEDED" },
      new Headers({ "Retry-After": "300" }),
      now,
    );
    expect(anonymousCooldownUntil(info, now)).toBe(now + 300_000);
  });

  it("does not cool down for unrelated errors", () => {
    expect(anonymousCooldownUntil(classifyUapiResponse(404, { code: "NOT_FOUND" }), now)).toBe(0);
    expect(anonymousCooldownUntil(classifyUapiResponse(500, { code: "HTTP_500" }), now)).toBe(0);
  });
});

describe("pickBingImageUrl", () => {
  const body = {
    image_url: "https://cn.bing.com/th?id=1920",
    image_url_4k: "https://cn.bing.com/th?id=3840",
    image_url_1080: "https://cn.bing.com/th?id=1080",
  };

  it("prefers 4k by default", () => {
    expect(pickBingImageUrl(body)).toBe("https://cn.bing.com/th?id=3840");
  });

  it("honours an explicit 1080 request", () => {
    expect(pickBingImageUrl(body, "1080")).toBe("https://cn.bing.com/th?id=1080");
  });

  it("falls back to the generic field when the preferred one is missing", () => {
    expect(pickBingImageUrl({ image_url: "https://cn.bing.com/th?id=1920" })).toBe(
      "https://cn.bing.com/th?id=1920",
    );
  });

  it("returns null for the {error} envelope and unusable payloads", () => {
    expect(pickBingImageUrl({ error: "必应壁纸获取失败" })).toBeNull();
    expect(pickBingImageUrl({})).toBeNull();
    expect(pickBingImageUrl(null)).toBeNull();
    expect(pickBingImageUrl("nope")).toBeNull();
  });
});

describe("bingWallpaperTtlMs", () => {
  it("expires just after the next UTC+8 midnight", () => {
    // 2026-02-19 12:00 UTC+8
    const now = Date.parse("2026-02-19T04:00:00Z");
    const ttl = bingWallpaperTtlMs(now);
    expect(new Date(now + ttl).toISOString()).toBe("2026-02-19T16:05:00.000Z");
  });

  it("targets the next UTC+8 00:05 boundary even from late in the day", () => {
    // 下午打开也要能撑到次日，否则当天会重复请求
    const now = Date.parse("2026-02-19T16:06:00Z");
    const ttl = bingWallpaperTtlMs(now);
    expect(new Date(now + ttl).toISOString()).toBe("2026-02-20T16:05:00.000Z");
  });

  it("never exceeds the 24 hour safety ceiling", () => {
    const ttl = bingWallpaperTtlMs(Date.parse("2026-02-19T04:00:00Z"));
    expect(ttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("never drops below the 5 minute floor", () => {
    // 00:04 UTC+8：距下一个 00:05 边界只剩 1 分钟，必须抬到下限
    const now = Date.parse("2026-02-19T16:04:00Z");
    expect(bingWallpaperTtlMs(now)).toBe(5 * 60 * 1000);
  });
});

describe("uapiErrorMessageKey", () => {
  it("maps each kind to an i18n key", () => {
    const key = (status: number, code: string) =>
      uapiErrorMessageKey(new UapiError(classifyUapiResponse(status, { code })));
    expect(key(429, "RATE_LIMIT_EXCEEDED")).toBe("uapiErrorRateLimited");
    expect(key(429, "VISITOR_MONTHLY_QUOTA_EXHAUSTED")).toBe("uapiErrorQuotaExhausted");
    expect(key(401, "UNAUTHORIZED")).toBe("uapiErrorUnauthorized");
    expect(key(402, "INSUFFICIENT_CREDITS")).toBe("uapiErrorInsufficientCredits");
    expect(key(404, "NOT_FOUND")).toBe("uapiErrorNotFound");
    expect(key(503, "SERVICE_UNAVAILABLE")).toBe("uapiErrorUnavailable");
  });

  it("falls back for non-UAPI errors", () => {
    expect(uapiErrorMessageKey(new Error("boom"))).toBe("uapiErrorUnavailable");
  });
});

describe("buildUapiUrl", () => {
  it("resolves a relative path against the API base", () => {
    expect(buildUapiUrl("/misc/weather")).toBe(`${UAPI_BASE}/misc/weather`);
    expect(buildUapiUrl("misc/weather")).toBe(`${UAPI_BASE}/misc/weather`);
  });

  it("keeps absolute URLs untouched", () => {
    expect(buildUapiUrl("https://uapis.cn/api/v1/misc/weather?city=x")).toBe(
      "https://uapis.cn/api/v1/misc/weather?city=x",
    );
  });

  it("serializes query params and drops undefined values", () => {
    expect(buildUapiUrl("/misc/weather", { city: "北京", extended: true, adcode: undefined })).toBe(
      `${UAPI_BASE}/misc/weather?city=%E5%8C%97%E4%BA%AC&extended=true`,
    );
  });

  it("appends to an existing query string", () => {
    expect(buildUapiUrl("https://uapis.cn/api/v1/misc/weather?city=a", { lang: "zh" })).toBe(
      "https://uapis.cn/api/v1/misc/weather?city=a&lang=zh",
    );
  });
});

describe("uapiFetch authentication and retry", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  /** 让 store 处于「已 hydrate」状态，避免惰性 hydrate 覆盖测试内设置。 */
  function setSettings(patch: Partial<ReturnType<typeof useUapiSettings.getState>>) {
    useUapiSettings.setState({ hydrated: true, ...patch });
  }

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useUapiSettings.setState({
      apiKey: "",
      preferKey: false,
      anonymousBlockedUntil: 0,
      anonymousBlockedReason: "",
      lastCheck: null,
      hydrated: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** 取第 n 次请求的 headers（匿名时应不含 Authorization）。 */
  function headersOf(index: number): Record<string, string> {
    const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
    return (init?.headers ?? {}) as Record<string, string>;
  }

  it("calls anonymously first, without an Authorization header", async () => {
    fetchMock.mockResolvedValue(rawResponse(200, { temperature: 20 }));

    await expect(uapiFetch("/misc/weather")).resolves.toEqual({ temperature: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0).Authorization).toBeUndefined();
  });

  it("escalates to the key after an anonymous 429 and returns the data", async () => {
    setSettings({ apiKey: "secret-key" });
    fetchMock
      .mockResolvedValueOnce(rawResponse(429, { code: "RATE_LIMIT_EXCEEDED" }))
      .mockResolvedValueOnce(rawResponse(200, { temperature: 21 }));

    await expect(uapiFetch("/misc/weather")).resolves.toEqual({ temperature: 21 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOf(0).Authorization).toBeUndefined();
    expect(headersOf(1).Authorization).toBe("Bearer secret-key");
  });

  it("escalates to the key when the anonymous visitor quota is exhausted", async () => {
    setSettings({ apiKey: "secret-key" });
    fetchMock
      .mockResolvedValueOnce(rawResponse(429, { code: "VISITOR_MONTHLY_QUOTA_EXHAUSTED" }))
      .mockResolvedValueOnce(rawResponse(200, { ok: true }));

    await expect(uapiFetch("/network/myip")).resolves.toEqual({ ok: true });
    expect(headersOf(1).Authorization).toBe("Bearer secret-key");
  });

  it("throws a rate-limit error when no key is configured", async () => {
    fetchMock.mockResolvedValue(rawResponse(429, { code: "RATE_LIMIT_EXCEEDED" }));

    const error = await uapiFetch("/misc/weather", { maxRetryDelayMs: 20 }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UapiError);
    expect((error as UapiError).info.kind).toBe("rate-limit");
    // 429 本身可重试，因此会退避重试到次数上限
    expect(fetchMock).toHaveBeenCalledTimes(UAPI_MAX_ATTEMPTS);
    // 但没有密钥就绝不能凭空带上 Authorization
    for (let i = 0; i < fetchMock.mock.calls.length; i++) {
      expect(headersOf(i).Authorization).toBeUndefined();
    }
  });

  it("records the anonymous cooldown even without a key", async () => {
    fetchMock.mockResolvedValue(rawResponse(429, { code: "RATE_LIMIT_EXCEEDED" }));

    await uapiFetch("/misc/weather", { maxRetryDelayMs: 20 }).catch(() => undefined);
    expect(useUapiSettings.getState().anonymousBlockedUntil).toBeGreaterThan(Date.now());
    expect(useUapiSettings.getState().anonymousBlockedReason).toBe("rate-limit");
  });

  it("records the anonymous cooldown so later calls go straight to the key", async () => {
    setSettings({ apiKey: "secret-key" });
    fetchMock.mockResolvedValue(rawResponse(429, { code: "RATE_LIMIT_EXCEEDED" }));

    await uapiFetch("/misc/weather").catch(() => undefined);
    expect(useUapiSettings.getState().anonymousBlockedUntil).toBeGreaterThan(Date.now());
    expect(useUapiSettings.getState().anonymousBlockedReason).toBe("rate-limit");

    // 冷却期内：第一次请求就带密钥，不再浪费匿名配额
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(rawResponse(200, { ok: true }));
    await expect(uapiFetch("/misc/other")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(headersOf(0).Authorization).toBe("Bearer secret-key");
  });

  it("sends the key directly when preferKey is on", async () => {
    setSettings({ apiKey: "secret-key", preferKey: true });
    fetchMock.mockResolvedValue(rawResponse(200, { ok: true }));

    await uapiFetch("/misc/weather");
    expect(headersOf(0).Authorization).toBe("Bearer secret-key");
  });

  it("does not retry a 404", async () => {
    fetchMock.mockResolvedValue(rawResponse(404, { code: "NOT_FOUND" }));

    await expect(uapiFetch("/misc/weather")).rejects.toBeInstanceOf(UapiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 500 with backoff and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(rawResponse(500, { code: "INTERNAL_SERVER_ERROR" }))
      .mockResolvedValueOnce(rawResponse(200, { temperature: 22 }));

    await expect(uapiFetch("/misc/weather", { maxRetryDelayMs: 20 })).resolves.toEqual({
      temperature: 22,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails fast when Retry-After exceeds the caller's budget", async () => {
    fetchMock.mockResolvedValue(
      rawResponse(429, { code: "RATE_LIMIT_EXCEEDED" }, { "Retry-After": "120" }),
    );

    const startedAt = Date.now();
    await expect(uapiFetch("/misc/weather", { maxRetryDelayMs: 50 })).rejects.toBeInstanceOf(
      UapiError,
    );
    // 不应真的睡 120 秒
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a network failure as retryable", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(rawResponse(200, { ok: true }));

    await expect(uapiFetch("/misc/weather", { maxRetryDelayMs: 20 })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("deduplicates concurrent calls to the same URL and auth mode", async () => {
    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(() => gate);

    const first = uapiFetch("/misc/weather");
    const second = uapiFetch("/misc/weather");
    // 让两次调用的 slot 都跑完再放行，否则第二次调用可能还未复用 inflight
    await Promise.resolve();
    release(rawResponse(200, { temperature: 25 }));

    await expect(first).resolves.toEqual({ temperature: 25 });
    await expect(second).resolves.toEqual({ temperature: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never leaks the key into the thrown error message", async () => {
    setSettings({ apiKey: "super-secret-key", preferKey: true });
    fetchMock.mockResolvedValue(rawResponse(500, { code: "INTERNAL_SERVER_ERROR" }));

    const error = await uapiFetch("/misc/weather", { maxRetryDelayMs: 10 }).catch(
      (e: unknown) => e,
    );
    expect((error as Error).message).not.toContain("super-secret-key");
    expect(String(error)).not.toContain("super-secret-key");
  });
});

describe("testUapiKey", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports success for a 2xx response", async () => {
    fetchMock.mockResolvedValue(rawResponse(200, { ip: "1.2.3.4" }));
    await expect(testUapiKey("good-key")).resolves.toEqual({ ok: true });
  });

  it("sends the provided key as a Bearer token", async () => {
    fetchMock.mockResolvedValue(rawResponse(200, { ip: "1.2.3.4" }));
    await testUapiKey("good-key");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer good-key");
  });

  it("reports UNAUTHORIZED for an invalid key", async () => {
    fetchMock.mockResolvedValue(rawResponse(401, { code: "UNAUTHORIZED" }));
    const result = await testUapiKey("bad-key");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.info.kind).toBe("auth");
  });

  it("rejects an empty key without making a request", async () => {
    const result = await testUapiKey("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.info.code).toBe("MISSING_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("BING_WALLPAPER_FALLBACK_URL", () => {
  it("points at the image endpoint used before the JSON refactor", () => {
    expect(BING_WALLPAPER_FALLBACK_URL).toBe(`${UAPI_BASE}/image/bing-daily`);
  });
});
