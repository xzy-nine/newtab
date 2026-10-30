import { vi } from "vitest";

/**
 * 活动小部件测试共用的响应夹具。
 *
 * 磁贴与弹窗调用同一套 Akasha 接口（`capabilities` + `calendar`），只按 URL
 * 分支的假响应两边都要用；各写一份会在接口路径变化时分叉。
 */

/** 单游戏（原神）的筛选规则，父子两级。 */
const CAPABILITIES_YS = {
  json: "/api/v1/games/ys/calendar",
  ics: "/api/v1/games/ys/calendar.ics",
  selectors: [
    {
      value: "游戏内活动",
      label: "游戏内活动",
      children: [{ value: "游戏内活动:七圣召唤", label: "七圣召唤" }],
    },
    { value: "版本日程", label: "版本日程", children: [] },
  ],
};

/**
 * 构造一个 ISO 时间：相对当前时间偏移若干天。
 * @param days 偏移天数，可为小数。
 * @returns ISO 时间字符串。
 */
export function isoInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 构造一条活动日程。
 *
 * 默认结束时间取"2 天后"，刻意留在 3 天阈值**以内**：阈值是闭区间（距结束
 * ≤ 3 天），而 `isoInDays(3)` 在取数前构造，渲染时已比此刻早了几毫秒，恰好
 * 落到阈值之外。边界值只应在专门测边界的用例里出现。
 * @param overrides 覆盖默认字段。
 * @returns 日程条目。
 */
export function calendarItem(overrides: Record<string, unknown>) {
  return {
    id: "e1",
    kind: "游戏内活动",
    title: "活动 A",
    start: isoInDays(-1),
    end: isoInDays(2),
    all_day: false,
    version: "7.0",
    labels: [],
    url: "https://example.com/a",
    ...overrides,
  };
}

/**
 * 构造一个 JSON 响应。
 * @param payload 响应体。
 * @param status HTTP 状态码。
 * @returns 响应对象。
 */
export function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

/** 只外显指定游戏的配置（用它把多游戏请求收窄成单游戏）。 */
export function only(...games: string[]) {
  return { displayGames: { mode: "custom" as const, games } };
}

/**
 * 该 URL 属于哪个游戏。
 * @param url 请求地址。
 * @returns 游戏 id；不匹配日程接口时为空串。
 */
export function gameOf(url: string): string {
  const match = /\/api\/v1\/games\/([^/]+)\/calendar/.exec(url);
  return match?.[1] ?? "";
}

/**
 * 已被请求过的游戏集合（忽略非日程请求）。
 * @param fetchMock 已记录调用的 `fetch` 桩。
 * @returns 游戏 id 集合。
 */
export function requestedGames(fetchMock: { mock: { calls: unknown[][] } }): Set<string> {
  return new Set(
    fetchMock.mock.calls.map((call) => gameOf(String(call[0]))).filter((id) => id !== ""),
  );
}

/**
 * 按 URL 分派响应：`capabilities` 与 `calendar` 走不同分支。
 * @param handlers 各分支的响应；缺省时使用原神筛选规则与空日程。
 * @returns `fetch` 桩实现。
 */
export function routeFetch(handlers: { capabilities?: Response; calendar?: Response }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/capabilities")) {
      return handlers.capabilities ?? jsonResponse(CAPABILITIES_YS);
    }
    return handlers.calendar ?? jsonResponse({ total: 0, items: [] });
  });
}

/**
 * 按游戏返回一条活动，用于验证"只请求被外显的游戏"。
 * @param titleOf 由游戏 id 生成活动标题。
 * @returns `fetch` 桩实现。
 */
export function gameScopedFetch(titleOf: (game: string) => string = (game) => `${game} 的活动`) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const game = gameOf(String(input));
    return jsonResponse({
      total: 1,
      items: [calendarItem({ id: `${game}-1`, title: titleOf(game), end: isoInDays(2) })],
    });
  });
}

/** 前瞻特别节目的活动标题。 */
const PREVIEW_TITLE = "3.1版本前瞻特别节目";

/**
 * 只返回一条前瞻特别节目的 `fetch` 桩。
 * @param end 结束时间；默认留出 1.1 天跨度。
 * @returns `fetch` 桩实现。
 */
export function previewFetch(end: string = isoInDays(1.1)) {
  return routeFetch({
    calendar: jsonResponse({
      total: 1,
      items: [
        calendarItem({
          id: "p",
          kind: "版本日程",
          title: PREVIEW_TITLE,
          labels: ["前瞻特别节目"],
          start: isoInDays(1),
          end,
        }),
      ],
    }),
  });
}

/**
 * 构造一个返回指定活动的 `fetch` 桩。
 * @param items 活动条目。
 * @returns `fetch` 桩实现。
 */
export function calendarFetch(items: unknown[]) {
  return routeFetch({ calendar: jsonResponse({ total: items.length, items }) });
}
