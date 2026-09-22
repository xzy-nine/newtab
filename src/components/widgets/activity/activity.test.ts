import { describe, it, expect } from "vitest";
import {
  ACTIVITY_TTL_MS,
  BANNER_TTL_MS,
  DEFAULT_GAME_ID,
  EMPTY_RESULT_TTL_MS,
  PREVIEW_LABEL,
  SCHEDULE_TTL_MS,
  addDaysToDayKey,
  applySelectionFilter,
  activityStatus,
  bucketOfKind,
  buildCalendarUrl,
  buildWeekColumns,
  computeDefaultSelection,
  computeGanttLayout,
  dayKeyDiff,
  defaultQuery,
  daysUntilEnd,
  filterPreview,
  formatRange,
  gameLabel,
  ganttTodayPct,
  ganttWindow,
  isChildChecked,
  isParentChecked,
  isPreviewEntry,
  normalizeCalendarResponse,
  normalizeGamesResponse,
  parseActivityEntry,
  parseCapabilities,
  readGameId,
  readPinnedIds,
  readPreviewMode,
  readSelected,
  readViewMode,
  readWindowDays,
  remainingText,
  selectExpiring,
  selectPinned,
  selectionToIncludes,
  togglePinned,
  toggleSelectorValue,
  utc8DayKey,
  utc8MidnightMs,
  utc8TimeLabel,
  type CalendarSelector,
  type ParsedActivityEntry,
} from "./activity";

/** 构造一条日程（测试用）。 */
function makeEntry(overrides: Partial<ParsedActivityEntry> = {}): ParsedActivityEntry {
  const startMs = Date.parse("2026-09-01T03:00:00Z");
  const endMs = Date.parse("2026-09-10T03:00:00Z");
  return {
    id: "id-1",
    kind: "游戏内活动",
    title: "测试活动",
    start: "2026-09-01T03:00:00Z",
    end: "2026-09-10T03:00:00Z",
    allDay: false,
    labels: [],
    url: "https://example.com",
    startMs,
    endMs,
    bucket: "activity",
    ...overrides,
  };
}

describe("bucketOfKind", () => {
  it("maps the three cached kinds to their buckets", () => {
    expect(bucketOfKind("卡池")).toBe("banner");
    expect(bucketOfKind("版本日程")).toBe("schedule");
    expect(bucketOfKind("游戏内活动")).toBe("activity");
  });

  it("falls back to the activity bucket so no data is dropped", () => {
    expect(bucketOfKind("角色生日")).toBe("activity");
    expect(bucketOfKind("未知分类")).toBe("activity");
  });

  it("keeps the three TTLs distinct and long", () => {
    // 日程基本不变，因此都是长 TTL；活动最易变所以最短
    expect(ACTIVITY_TTL_MS).toBeLessThan(BANNER_TTL_MS);
    expect(BANNER_TTL_MS).toBe(SCHEDULE_TTL_MS);
    // 空结果必须显著更短，否则版本空窗会被固化
    expect(EMPTY_RESULT_TTL_MS).toBeLessThan(ACTIVITY_TTL_MS);
  });
});

describe("UTC+8 时间换算", () => {
  it("shifts UTC into the UTC+8 calendar day", () => {
    // 2026-09-22T22:00Z 在 +8 是 9/23 06:00，跨日
    const ms = Date.parse("2026-09-22T22:00:00Z");
    expect(utc8DayKey(ms)).toBe("2026-09-23");
    expect(utc8TimeLabel(ms)).toBe("06:00");
  });

  it("keeps a late-UTC event on the same day in +8", () => {
    // 15:59Z → 23:59 +8 仍属同日
    const ms = Date.parse("2026-09-22T15:59:00Z");
    expect(utc8DayKey(ms)).toBe("2026-09-22");
  });

  it("does not follow the host timezone (deterministic)", () => {
    // 该时刻在 UTC-5 会落到 9/22，但 +8 固定为 9/23
    expect(utc8DayKey(Date.parse("2026-09-22T22:00:00Z"))).toBe("2026-09-23");
  });

  it("round-trips a day key through UTC+8 midnight", () => {
    const ms = utc8MidnightMs("2026-09-07");
    expect(utc8DayKey(ms)).toBe("2026-09-07");
    expect(utc8TimeLabel(ms)).toBe("00:00");
  });

  it("adds days and diffs them", () => {
    expect(addDaysToDayKey("2026-09-07", 1)).toBe("2026-09-08");
    expect(addDaysToDayKey("2026-09-07", 30)).toBe("2026-10-07");
    expect(dayKeyDiff("2026-09-10", "2026-09-01")).toBe(9);
  });

  it("returns NaN-safe values for malformed day keys", () => {
    expect(Number.isNaN(utc8MidnightMs("nope"))).toBe(true);
    expect(addDaysToDayKey("nope", 1)).toBe("nope");
  });
});

describe("parseActivityEntry", () => {
  it("parses a timed event", () => {
    const entry = parseActivityEntry({
      id: "abc",
      kind: "游戏内活动",
      title: "七圣召唤·热斗模式",
      start: "2026-08-29T02:00:00Z",
      end: "2026-09-13T19:59:00Z",
      all_day: false,
      version: "7.0",
      cover: "https://example.com/c.png",
      labels: ["七圣召唤"],
      url: "https://example.com/a",
    })!;
    expect(entry.id).toBe("abc");
    expect(entry.allDay).toBe(false);
    expect(entry.version).toBe("7.0");
    expect(entry.labels).toEqual(["七圣召唤"]);
    expect(entry.startMs).toBe(Date.parse("2026-08-29T02:00:00Z"));
    expect(entry.bucket).toBe("activity");
  });

  it("treats an all-day end as exclusive", () => {
    // 接口语义：start=09-07、end=09-08 表示 9/7 单日
    const entry = parseActivityEntry({
      id: "character-1",
      kind: "角色生日",
      title: "重云生日",
      start: "2026-09-07",
      end: "2026-09-08",
      all_day: true,
      labels: [],
      url: "https://example.com",
    })!;
    expect(entry.allDay).toBe(true);
    expect(entry.startMs).toBe(utc8MidnightMs("2026-09-07"));
    expect(entry.endMs).toBe(utc8MidnightMs("2026-09-08"));
    expect(entry.endMs - entry.startMs).toBe(24 * 60 * 60 * 1000);
  });

  it("drops entries missing required fields", () => {
    const base = {
      id: "x",
      kind: "游戏内活动",
      title: "t",
      start: "2026-09-01T00:00:00Z",
      end: "2026-09-02T00:00:00Z",
      all_day: false,
    };
    expect(parseActivityEntry({ ...base, id: undefined })).toBeNull();
    expect(parseActivityEntry({ ...base, kind: undefined })).toBeNull();
    expect(parseActivityEntry({ ...base, title: undefined })).toBeNull();
    expect(parseActivityEntry({ ...base, start: undefined })).toBeNull();
    expect(parseActivityEntry({ ...base, end: undefined })).toBeNull();
    expect(parseActivityEntry(null)).toBeNull();
    expect(parseActivityEntry("nope")).toBeNull();
  });

  it("drops unparseable timestamps and inverted ranges", () => {
    expect(parseActivityEntry({ ...makeEntry(), start: "not-a-date" })).toBeNull();
    // end < start 属脏数据，不能画成负宽度
    expect(
      parseActivityEntry({
        id: "x",
        kind: "游戏内活动",
        title: "t",
        start: "2026-09-10T00:00:00Z",
        end: "2026-09-01T00:00:00Z",
        all_day: false,
      }),
    ).toBeNull();
  });

  it("tolerates a null version and null cover (character birthdays)", () => {
    const entry = parseActivityEntry({
      id: "c",
      kind: "角色生日",
      title: "生日",
      start: "2026-09-07",
      end: "2026-09-08",
      all_day: true,
      version: null,
      cover: null,
      labels: [],
      url: "u",
    })!;
    expect(entry.version).toBeUndefined();
    expect(entry.cover).toBeUndefined();
  });

  it("filters non-string labels", () => {
    const entry = parseActivityEntry({
      ...makeEntry(),
      labels: ["ok", 42, null, "fine"],
    })!;
    expect(entry.labels).toEqual(["ok", "fine"]);
  });
});

describe("normalizeCalendarResponse", () => {
  it("keeps usable items and drops malformed ones", () => {
    const entries = normalizeCalendarResponse({
      total: 3,
      items: [
        {
          id: "a",
          kind: "游戏内活动",
          title: "A",
          start: "2026-09-01T00:00:00Z",
          end: "2026-09-02T00:00:00Z",
          all_day: false,
          labels: [],
          url: "u",
        },
        { id: "broken" },
        null,
      ],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.id).toBe("a");
  });

  it("returns an empty array for unusable shapes", () => {
    expect(normalizeCalendarResponse(null)).toEqual([]);
    expect(normalizeCalendarResponse({})).toEqual([]);
    expect(normalizeCalendarResponse({ items: "nope" })).toEqual([]);
  });
});

describe("parseCapabilities", () => {
  const raw = {
    json: "/api/v1/games/ys/calendar",
    ics: "/api/v1/games/ys/calendar.ics",
    selectors: [
      {
        value: "游戏内活动",
        label: "游戏内活动",
        children: [
          { value: "游戏内活动:七圣召唤", label: "七圣召唤" },
          { value: "游戏内活动:千星奇域", label: "千星奇域" },
        ],
      },
      { value: "卡池", label: "卡池", children: [] },
    ],
  };

  it("parses parents and children, tolerating empty children", () => {
    const caps = parseCapabilities(raw, "ys")!;
    expect(caps.selectors).toHaveLength(2);
    expect(caps.selectors[0]!.children).toEqual([
      { value: "游戏内活动:七圣召唤", label: "七圣召唤" },
      { value: "游戏内活动:千星奇域", label: "千星奇域" },
    ]);
    // 原神的卡池 children 为空数组，必须容忍
    expect(caps.selectors[1]!.children).toEqual([]);
  });

  it("returns null when selectors are missing", () => {
    expect(parseCapabilities({}, "ys")).toBeNull();
    expect(parseCapabilities(null, "ys")).toBeNull();
  });
});

describe("normalizeGamesResponse / gameLabel", () => {
  it("parses the game list", () => {
    const games = normalizeGamesResponse({
      items: [
        { id: "ys", name: "原神", index: 1, icon: "i" },
        { id: "sr", name: "崩坏：星穹铁道", index: 2 },
      ],
    });
    expect(games).toHaveLength(2);
    expect(gameLabel(games, "sr")).toBe("崩坏：星穹铁道");
  });

  it("falls back to the built-in name when the list is unavailable", () => {
    expect(gameLabel([], "ys")).toBe("原神");
    expect(gameLabel([], "zzz")).toBe("绝区零");
    expect(gameLabel([], "unknown")).toBe("unknown");
  });
});

describe("前瞻处理", () => {
  const preview = makeEntry({
    id: "preview",
    labels: [PREVIEW_LABEL],
    title: "3.1版本前瞻特别节目",
  });

  it("detects preview entries by label or title", () => {
    expect(isPreviewEntry(preview)).toBe(true);
    expect(isPreviewEntry(makeEntry({ title: "2.8版本前瞻特别节目", labels: [] }))).toBe(true);
    expect(isPreviewEntry(makeEntry())).toBe(false);
  });

  it("hides previews by default and keeps them as points when asked", () => {
    const entries = [preview, makeEntry({ id: "other" })];
    expect(filterPreview(entries, "hide")).toHaveLength(1);
    expect(filterPreview(entries, "point")).toHaveLength(2);
  });
});

describe("活动状态与排序", () => {
  const entry = makeEntry(); // 2026-09-01 ~ 2026-09-10
  const startMs = entry.startMs;
  const endMs = entry.endMs;

  it("classifies ongoing / upcoming / ended with a half-open interval", () => {
    expect(activityStatus(entry, startMs - 1)).toBe("upcoming");
    expect(activityStatus(entry, startMs)).toBe("ongoing");
    expect(activityStatus(entry, endMs - 1)).toBe("ongoing");
    // 结束时刻即视为已结束
    expect(activityStatus(entry, endMs)).toBe("ended");
  });

  it("computes days until end", () => {
    expect(daysUntilEnd(entry, endMs)).toBe(0);
    expect(daysUntilEnd(entry, endMs - 1000)).toBe(1);
    expect(daysUntilEnd(entry, endMs - 24 * 60 * 60 * 1000)).toBe(1);
    expect(daysUntilEnd(entry, endMs - 24 * 60 * 60 * 1000 - 1)).toBe(2);
  });

  it("reports hours when less than a day remains", () => {
    expect(remainingText(entry, endMs - 30 * 60 * 1000)).toEqual({ unit: "hours", value: 1 });
    expect(remainingText(entry, endMs - 5 * 60 * 60 * 1000)).toEqual({ unit: "hours", value: 5 });
    expect(remainingText(entry, endMs - 25 * 60 * 60 * 1000)).toEqual({ unit: "days", value: 2 });
    expect(remainingText(entry, endMs)).toEqual({ unit: "ended" });
  });

  it("selects expiring entries by end time and skips ended ones", () => {
    const a = makeEntry({ id: "a", endMs: endMs + 3, end: "x" });
    const b = makeEntry({ id: "b", endMs: endMs + 1, end: "x" });
    const done = makeEntry({ id: "done", endMs: endMs - 1, end: "x" });
    const result = selectExpiring([a, b, done], endMs, 10);
    expect(result.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("honours the limit", () => {
    const many = [1, 2, 3].map((n) => makeEntry({ id: `m${n}`, endMs: endMs + n, end: "x" }));
    expect(selectExpiring(many, endMs, 2)).toHaveLength(2);
    expect(selectExpiring(many, endMs, 0)).toHaveLength(0);
  });

  it("keeps pinned entries in the pinned order", () => {
    const a = makeEntry({ id: "a" });
    const b = makeEntry({ id: "b" });
    const c = makeEntry({ id: "c" });
    expect(selectPinned([a, b, c], ["c", "a"]).map((e) => e.id)).toEqual(["c", "a"]);
    // 固定但已不在数据里的 id 被忽略
    expect(selectPinned([a], ["missing", "a"]).map((e) => e.id)).toEqual(["a"]);
  });

  it("toggles pinned ids", () => {
    expect(togglePinned([], "a")).toEqual(["a"]);
    expect(togglePinned(["a", "b"], "a")).toEqual(["b"]);
    expect(togglePinned(["a"], "b")).toEqual(["a", "b"]);
  });
});

describe("computeGanttLayout", () => {
  const windowStart = utc8MidnightMs("2026-09-01");
  const windowEnd = utc8MidnightMs("2026-09-11");

  it("places a fully-inside event proportionally", () => {
    // 9/3 00:00 (+8) ~ 9/5 00:00 (+8)，窗口共 10 天 → left 20%、width 20%
    const entry = makeEntry({
      startMs: utc8MidnightMs("2026-09-03"),
      endMs: utc8MidnightMs("2026-09-05"),
    });
    const { bars } = computeGanttLayout([entry], windowStart, windowEnd);
    expect(bars[0]!.leftPct).toBeCloseTo(20, 5);
    expect(bars[0]!.widthPct).toBeCloseTo(20, 5);
    expect(bars[0]!.isPoint).toBe(false);
  });

  it("clamps an event that starts before the window and flags the clip", () => {
    const entry = makeEntry({
      startMs: utc8MidnightMs("2026-08-01"),
      endMs: utc8MidnightMs("2026-09-03"),
    });
    const { bars } = computeGanttLayout([entry], windowStart, windowEnd);
    expect(bars[0]!.leftPct).toBe(0);
    expect(bars[0]!.widthPct).toBeCloseTo(20, 5);
    expect(bars[0]!.clippedStart).toBe(true);
    expect(bars[0]!.clippedEnd).toBe(false);
  });

  it("clamps an event that ends after the window and flags the clip", () => {
    const entry = makeEntry({
      startMs: utc8MidnightMs("2026-09-09"),
      endMs: utc8MidnightMs("2026-12-01"),
    });
    const { bars } = computeGanttLayout([entry], windowStart, windowEnd);
    expect(bars[0]!.leftPct).toBeCloseTo(80, 5);
    expect(bars[0]!.widthPct).toBeCloseTo(20, 5);
    expect(bars[0]!.clippedEnd).toBe(true);
  });

  it("splits at the UTC+8 day boundary, not the host day boundary", () => {
    // 窗口起点 9/1 00:00 (+8) = 8/31 16:00Z。
    // 事件 9/1 22:00Z 在 +8 是 9/2 06:00，即窗口内第 30 小时；
    // 窗口 10 天 = 240 小时 → 30/240 = 12.5%。
    // 若误按 UTC 日历日算（当作 9/1 当天 = 第 24 小时）会得到 10%，故此处能区分两种实现。
    const entry = makeEntry({
      startMs: Date.parse("2026-09-01T22:00:00Z"),
      endMs: Date.parse("2026-09-02T22:00:00Z"),
    });
    const { bars } = computeGanttLayout([entry], windowStart, windowEnd);
    expect(bars[0]!.leftPct).toBeCloseTo(12.5, 5);
    // 明确否定"按 UTC 天数"的错误算法
    expect(bars[0]!.leftPct).not.toBeCloseTo(10, 1);
  });

  it("drops events entirely outside the window", () => {
    const before = makeEntry({
      startMs: utc8MidnightMs("2026-08-01"),
      endMs: utc8MidnightMs("2026-08-10"),
    });
    const after = makeEntry({
      startMs: utc8MidnightMs("2026-10-01"),
      endMs: utc8MidnightMs("2026-10-10"),
    });
    expect(computeGanttLayout([before, after], windowStart, windowEnd).bars).toEqual([]);
    expect(computeGanttLayout([before, after], windowStart, windowEnd).laneCount).toBe(0);
  });

  it("marks a 1-minute preview as a point instead of a zero-width bar", () => {
    // 实测前瞻为 11:30:00Z → 11:31:00Z，按比例宽度为 0
    const entry = makeEntry({
      startMs: Date.parse("2026-09-03T11:30:00Z"),
      endMs: Date.parse("2026-09-03T11:31:00Z"),
    });
    const { bars } = computeGanttLayout([entry], windowStart, windowEnd);
    expect(bars[0]!.isPoint).toBe(true);
    expect(bars[0]!.widthPct).toBe(0);
  });

  it("enforces a minimum width so short bars stay visible", () => {
    // 窗口 10 天，忽略阈值后仍要保证最小宽度
    const entry = makeEntry({
      startMs: utc8MidnightMs("2026-09-03"),
      endMs: utc8MidnightMs("2026-09-03") + 2 * 60 * 60 * 1000,
    });
    const { bars } = computeGanttLayout([entry], windowStart, windowEnd, {
      pointThresholdMs: 60 * 1000,
      minWidthPct: 1.2,
    });
    expect(bars[0]!.isPoint).toBe(false);
    expect(bars[0]!.widthPct).toBeGreaterThanOrEqual(1.2);
  });

  it("never lets a bar overflow the right edge", () => {
    const entries = [
      makeEntry({ startMs: windowEnd - 60 * 1000, endMs: windowEnd }),
      makeEntry({
        startMs: utc8MidnightMs("2026-09-10"),
        endMs: utc8MidnightMs("2026-09-11"),
      }),
    ];
    for (const bar of computeGanttLayout(entries, windowStart, windowEnd, {
      pointThresholdMs: 1,
    }).bars) {
      expect(bar.leftPct + bar.widthPct).toBeLessThanOrEqual(100.0001);
    }
  });

  it("packs non-overlapping events onto the same lane", () => {
    // 先后发生、互不重叠 → 应共用一条泳道（这是与"每活动一行"的关键区别）
    const first = makeEntry({
      id: "first",
      startMs: utc8MidnightMs("2026-09-02"),
      endMs: utc8MidnightMs("2026-09-03"),
    });
    const second = makeEntry({
      id: "second",
      startMs: utc8MidnightMs("2026-09-05"),
      endMs: utc8MidnightMs("2026-09-06"),
    });
    const { bars, laneCount } = computeGanttLayout([first, second], windowStart, windowEnd);
    expect(laneCount).toBe(1);
    expect(bars.map((b) => b.lane)).toEqual([0, 0]);
  });

  it("gives overlapping events separate lanes", () => {
    const a = makeEntry({
      id: "a",
      startMs: utc8MidnightMs("2026-09-02"),
      endMs: utc8MidnightMs("2026-09-06"),
    });
    const b = makeEntry({
      id: "b",
      startMs: utc8MidnightMs("2026-09-03"),
      endMs: utc8MidnightMs("2026-09-05"),
    });
    const { bars, laneCount } = computeGanttLayout([a, b], windowStart, windowEnd);
    expect(laneCount).toBe(2);
    expect(bars.find((x) => x.entry.id === "a")!.lane).toBe(0);
    expect(bars.find((x) => x.entry.id === "b")!.lane).toBe(1);
  });

  it("reuses a freed lane instead of always adding new ones", () => {
    // A 与 C 不重叠，可与 B 交错：最多只需 2 条泳道
    const a = makeEntry({
      id: "a",
      startMs: utc8MidnightMs("2026-09-02"),
      endMs: utc8MidnightMs("2026-09-04"),
    });
    const b = makeEntry({
      id: "b",
      startMs: utc8MidnightMs("2026-09-03"),
      endMs: utc8MidnightMs("2026-09-07"),
    });
    const c = makeEntry({
      id: "c",
      startMs: utc8MidnightMs("2026-09-06"),
      endMs: utc8MidnightMs("2026-09-08"),
    });
    const { bars, laneCount } = computeGanttLayout([a, b, c], windowStart, windowEnd);
    expect(laneCount).toBe(2);
    // c 应复用 a 让出的 0 号泳道
    expect(bars.find((x) => x.entry.id === "c")!.lane).toBe(0);
  });

  it("treats back-to-back events as non-overlapping", () => {
    // 前一个的 end 正好等于后一个的 start → 可共用泳道（半开区间）
    const a = makeEntry({
      id: "a",
      startMs: utc8MidnightMs("2026-09-02"),
      endMs: utc8MidnightMs("2026-09-04"),
    });
    const b = makeEntry({
      id: "b",
      startMs: utc8MidnightMs("2026-09-04"),
      endMs: utc8MidnightMs("2026-09-06"),
    });
    expect(computeGanttLayout([a, b], windowStart, windowEnd).laneCount).toBe(1);
  });

  it("returns nothing for a non-positive window", () => {
    expect(computeGanttLayout([makeEntry()], windowEnd, windowStart).bars).toEqual([]);
    expect(computeGanttLayout([makeEntry()], windowStart, windowStart).bars).toEqual([]);
  });
});

describe("ganttWindow / buildWeekColumns", () => {
  it("aligns the window to whole weeks", () => {
    const now = utc8MidnightMs("2026-09-22");
    const win = ganttWindow(now, 14);
    expect(win.days % 7).toBe(0);
    expect(win.days).toBe(win.weeks * 7);
    // 窗口必须包含今天
    expect(win.startMs).toBeLessThanOrEqual(now);
    expect(win.endMs).toBeGreaterThan(now);
  });

  it("looks back so ongoing events are not clipped at the left edge", () => {
    const now = utc8MidnightMs("2026-09-22");
    const win = ganttWindow(now, 14);
    // 起点严格早于今天（有回看），否则进行中的活动会贴左边界
    expect(win.startMs).toBeLessThan(utc8MidnightMs("2026-09-22"));
  });

  it("snaps the window start to a Monday so weeks are real calendar weeks", () => {
    // 2026-09-22 是周二；起点必须落在周一，否则「第 N 周」会变成"周六~周五"
    const win = ganttWindow(utc8MidnightMs("2026-09-22"), 14);
    const startWeekday = new Date(win.startMs + 8 * 60 * 60 * 1000).getUTCDay();
    expect(startWeekday).toBe(1); // 1 = 周一
    expect(win.startMs).toBeLessThanOrEqual(utc8MidnightMs("2026-09-22"));
    expect(win.endMs).toBeGreaterThan(utc8MidnightMs("2026-09-22"));
  });

  it("splits the axis into consecutive 7-day week blocks", () => {
    const win = ganttWindow(utc8MidnightMs("2026-09-22"), 14);
    const columns = buildWeekColumns(win);
    expect(columns).toHaveLength(win.weeks);
    expect(columns[0]!.index).toBe(1);
    // 每块宽度相等且合计 100%
    const total = columns.reduce((sum, c) => sum + c.widthPct, 0);
    expect(total).toBeCloseTo(100, 5);
    // 相邻块首尾相接
    for (let i = 1; i < columns.length; i++) {
      expect(columns[i]!.leftPct).toBeCloseTo(
        columns[i - 1]!.leftPct + columns[i - 1]!.widthPct,
        5,
      );
    }
  });

  it("labels each week block as a date range", () => {
    const win = ganttWindow(utc8MidnightMs("2026-09-22"), 14);
    const [first] = buildWeekColumns(win);
    // 形如 09/17-09/23
    expect(first!.rangeLabel).toMatch(/^\d{2}\/\d{2}-\d{2}\/\d{2}$/);
  });

  it("puts today inside the window and reports its position", () => {
    const now = utc8MidnightMs("2026-09-22") + 12 * 60 * 60 * 1000;
    const win = ganttWindow(now, 14);
    const pct = ganttTodayPct(win, now);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });
});

describe("父子两级筛选", () => {
  const selectors: CalendarSelector[] = [
    {
      value: "游戏内活动",
      label: "游戏内活动",
      children: [
        { value: "游戏内活动:七圣召唤", label: "七圣召唤" },
        { value: "游戏内活动:千星奇域", label: "千星奇域" },
      ],
    },
    {
      value: "版本日程",
      label: "版本日程",
      children: [{ value: "版本日程:版本维护", label: "版本维护" }],
    },
    { value: "卡池", label: "卡池", children: [] },
  ];

  it("treats all children as checked when the parent is checked", () => {
    // 实测：include 传父级即包含其全部子级
    const selected = new Set(["游戏内活动"]);
    expect(isParentChecked(selected, "游戏内活动")).toBe(true);
    expect(isChildChecked(selected, "游戏内活动", "游戏内活动:七圣召唤")).toBe(true);
    expect(isChildChecked(selected, "游戏内活动", "游戏内活动:千星奇域")).toBe(true);
  });

  it("checks a child independently when only the child is selected", () => {
    const selected = new Set(["游戏内活动:七圣召唤"]);
    expect(isParentChecked(selected, "游戏内活动")).toBe(false);
    expect(isChildChecked(selected, "游戏内活动", "游戏内活动:七圣召唤")).toBe(true);
    expect(isChildChecked(selected, "游戏内活动", "游戏内活动:千星奇域")).toBe(false);
  });

  it("expands a parent into explicit children when one child is unchecked", () => {
    // 父级全选时取消一个子级 → 展开为"其余子级"
    const next = toggleSelectorValue(selectors, new Set(["游戏内活动"]), "游戏内活动:七圣召唤");
    expect(next.has("游戏内活动")).toBe(false);
    expect(next.has("游戏内活动:七圣召唤")).toBe(false);
    expect(next.has("游戏内活动:千星奇域")).toBe(true);
  });

  it("collapses children back to the parent when the parent is checked", () => {
    const next = toggleSelectorValue(selectors, new Set(["游戏内活动:千星奇域"]), "游戏内活动");
    expect(next.has("游戏内活动")).toBe(true);
    // 用父级表示全选，子级不应残留
    expect(next.has("游戏内活动:千星奇域")).toBe(false);
  });

  it("clears children when the parent is unchecked", () => {
    const next = toggleSelectorValue(
      selectors,
      new Set(["游戏内活动", "游戏内活动:七圣召唤"]),
      "游戏内活动",
    );
    expect(next.size).toBe(0);
  });

  it("handles parents without children", () => {
    const next = toggleSelectorValue(selectors, new Set(), "卡池");
    expect(next.has("卡池")).toBe(true);
    expect(toggleSelectorValue(selectors, next, "卡池").has("卡池")).toBe(false);
  });

  it("builds includes in capabilities order", () => {
    const includes = selectionToIncludes(
      selectors,
      new Set(["卡池", "游戏内活动:千星奇域", "版本日程"]),
    );
    expect(includes).toEqual(["游戏内活动:千星奇域", "版本日程", "卡池"]);
  });

  it("keeps unknown leftover values rather than dropping them", () => {
    const includes = selectionToIncludes(selectors, new Set(["已下线分类"]));
    expect(includes).toEqual(["已下线分类"]);
  });

  it("defaults to excluding 角色生日 and only the preview child", () => {
    const withBirthday = [
      ...selectors,
      { value: "角色生日", label: "角色生日", children: [] },
      {
        value: "版本日程",
        label: "版本日程",
        children: [
          { value: "版本日程:版本维护", label: "版本维护" },
          { value: `版本日程:${PREVIEW_LABEL}`, label: PREVIEW_LABEL },
        ],
      },
    ];
    const selected = computeDefaultSelection(withBirthday);
    expect(selected.has("角色生日")).toBe(false);
    expect(selected.has(`版本日程:${PREVIEW_LABEL}`)).toBe(false);
    // 版本维护不能被误排除
    expect(selected.has("版本日程:版本维护")).toBe(true);
    expect(selected.has("游戏内活动")).toBe(true);
  });
});

describe("applySelectionFilter", () => {
  const activity = makeEntry({ id: "a", kind: "游戏内活动", labels: ["七圣召唤"] });
  const banner = makeEntry({ id: "b", kind: "卡池", labels: [] });
  const preview = makeEntry({
    id: "p",
    kind: "版本日程",
    labels: [PREVIEW_LABEL],
    title: "3.1版本前瞻特别节目",
  });
  const maintenance = makeEntry({
    id: "m",
    kind: "版本日程",
    labels: ["版本维护"],
    title: "3.1版本维护",
  });
  const entries = [activity, banner, preview, maintenance];

  it("lets a selected parent include all of its children", () => {
    const result = applySelectionFilter(entries, new Set(["游戏内活动"]));
    expect(result.map((e) => e.id)).toEqual(["a"]);
  });

  it("filters by an explicit child value", () => {
    const result = applySelectionFilter(entries, new Set(["游戏内活动:七圣召唤"]));
    expect(result.map((e) => e.id)).toEqual(["a"]);
    const none = applySelectionFilter(entries, new Set(["游戏内活动:千星奇域"]));
    expect(none).toEqual([]);
  });

  it("excludes previews by default and keeps them in point mode", () => {
    const selected = new Set(["版本日程"]);
    expect(applySelectionFilter(entries, selected).map((e) => e.id)).toEqual(["m"]);
    expect(
      applySelectionFilter(entries, selected, { previewMode: "point" }).map((e) => e.id),
    ).toEqual(["p", "m"]);
  });

  it("returns nothing when nothing is selected", () => {
    expect(applySelectionFilter(entries, new Set())).toEqual([]);
  });
});

describe("buildCalendarUrl", () => {
  it("repeats include/exclude as array parameters", () => {
    const url = buildCalendarUrl({
      gameId: "ys",
      from: "2026-09-01",
      to: "2026-09-30",
      include: ["游戏内活动", "通行证"],
      exclude: ["角色生日"],
    });
    // 子级/父级值是完整字符串，且可重复出现（服务端按 OR 处理）
    expect(url).toContain("include=%E6%B8%B8%E6%88%8F%E5%86%85%E6%B4%BB%E5%8A%A8");
    expect(url).toContain("include=%E9%80%9A%E8%A1%8C%E8%AF%81");
    expect(url).toContain("exclude=%E8%A7%92%E8%89%B2%E7%94%9F%E6%97%A5");
    expect(url).toContain("from=2026-09-01");
    expect(url).toContain("to=2026-09-30");
  });

  it("keeps a child value's colon intact as one parameter", () => {
    const url = buildCalendarUrl({
      gameId: "ys",
      from: "2026-09-01",
      to: "2026-09-30",
      include: ["游戏内活动:七圣召唤"],
    });
    // 冒号必须被编码在单个参数内，不能拆成两个
    expect(url).toContain(`include=${encodeURIComponent("游戏内活动:七圣召唤")}`);
    expect(url.match(/include=/g)).toHaveLength(1);
  });

  it("targets the right game and defaults the page size", () => {
    const url = buildCalendarUrl({ gameId: "zzz", from: "2026-09-01", to: "2026-09-30" });
    expect(url).toContain("/api/v1/games/zzz/calendar");
    expect(url).toContain("limit=500");
  });

  it("omits offset on the first page", () => {
    const url = buildCalendarUrl({ gameId: "ys", from: "a", to: "b" });
    expect(url).not.toContain("offset=");
    expect(buildCalendarUrl({ gameId: "ys", from: "a", to: "b", offset: 500 })).toContain(
      "offset=500",
    );
  });

  it("builds a one-year default window", () => {
    const query = defaultQuery("ys", utc8MidnightMs("2026-09-01"));
    expect(query.from).toBe("2026-09-01");
    expect(query.to).toBe("2027-09-02");
  });
});

describe("小部件数据读取", () => {
  it("falls back to the default game", () => {
    expect(readGameId({ gameId: "zzz" })).toBe("zzz");
    expect(readGameId({})).toBe(DEFAULT_GAME_ID);
    expect(readGameId(undefined)).toBe(DEFAULT_GAME_ID);
    expect(readGameId({ gameId: "  " })).toBe(DEFAULT_GAME_ID);
  });

  it("reads pinned ids and ignores malformed entries", () => {
    expect(readPinnedIds({ pinned: ["a", "b"] })).toEqual(["a", "b"]);
    expect(readPinnedIds({ pinned: ["a", 1, null] })).toEqual(["a"]);
    expect(readPinnedIds({})).toEqual([]);
  });

  it("reads view, preview and window settings with defaults", () => {
    expect(readViewMode({ view: "list" })).toBe("list");
    expect(readViewMode({})).toBe("gantt");
    expect(readPreviewMode({ preview: "point" })).toBe("point");
    expect(readPreviewMode({})).toBe("hide");
    expect(readWindowDays({ days: 30 })).toBe(30);
    expect(readWindowDays({})).toBe(14);
    expect(readWindowDays({ days: -5 })).toBe(14);
    expect(readWindowDays({ days: 3.7 })).toBe(3);
  });

  it("returns null selection when nothing is configured", () => {
    expect(readSelected({})).toBeNull();
    expect(readSelected({ selected: [] })).toBeNull();
    const selected = readSelected({ selected: ["卡池"] })!;
    expect(selected.has("卡池")).toBe(true);
  });
});

describe("formatRange", () => {
  it("formats a timed range in UTC+8", () => {
    const entry = makeEntry({
      startMs: Date.parse("2026-08-12T03:00:00Z"),
      endMs: Date.parse("2026-09-01T19:59:00Z"),
    });
    expect(formatRange(entry)).toBe("8/12 11:00 → 9/2 03:59");
  });

  it("collapses a single all-day event", () => {
    const entry = makeEntry({
      allDay: true,
      start: "2026-09-07",
      end: "2026-09-08",
      startMs: utc8MidnightMs("2026-09-07"),
      endMs: utc8MidnightMs("2026-09-08"),
    });
    expect(formatRange(entry)).toBe("2026-09-07");
  });

  it("shows the inclusive last day for a multi-day all-day event", () => {
    const entry = makeEntry({
      allDay: true,
      start: "2026-09-07",
      end: "2026-09-10",
      startMs: utc8MidnightMs("2026-09-07"),
      endMs: utc8MidnightMs("2026-09-10"),
    });
    expect(formatRange(entry)).toBe("2026-09-07 → 2026-09-09");
  });
});
