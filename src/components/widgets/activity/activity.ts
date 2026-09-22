/**
 * 米哈游活动小部件的纯逻辑与数据访问。
 *
 * 数据来自 Akasha（https://akasha.trrw.cn，OpenAPI 3.1：`/openapi.json`）：
 * - `GET /api/v1/games`：游戏列表；
 * - `GET /api/v1/games/{game_id}/calendar`：日程（活动 / 卡池 / 版本日程等）；
 * - `GET /api/v1/games/{game_id}/calendar/capabilities`：筛选规则（父子两级）。
 *
 * 本模块把网络与纯计算分开：时间换算、解析、筛选、甘特布局、URL 构造都是纯函数，
 * 便于单元测试；只有 fetchXxx 系列会发请求。
 *
 * 关键接口语义（均已实测）：
 * 1. 日程只对 `ys` / `sr` / `zzz` 开放，其余游戏返回 404 且 message 为
 *    "calendar is not available for game xxx"；
 * 2. `from` / `to` 是**区间重叠**筛选（不是"开始时间落在区间内"），
 *    因此长活动会出现在窗口外沿，正是甘特图需要的语义；
 * 3. `include` 选父级 = 包含其全部子级，选子级 = 只取该子级；多个 include 之间是 OR；
 * 4. `all_day` 事件的 `end` **不包含**在事件内（start=09-07、end=09-08 表示单日）；
 *    定时事件为 UTC RFC 3339。
 */

import { readFreshCache, readStaleCache, removeCache, writeCache } from "@/lib/cache-store";

/** Akasha 服务地址。 */
export const AKASHA_BASE = "https://akasha.trrw.cn";

/** 每条日程记录在数据库中的分类（`kind`），API 只会有这六种。 */
export const CALENDAR_KINDS = [
  "游戏内活动",
  "网页活动",
  "版本日程",
  "卡池",
  "通行证",
  "角色生日",
] as const;

/** 支持日程的游戏 ID；其余游戏调用日程接口会返回 404。 */
export const CALENDAR_GAME_IDS = ["ys", "sr", "zzz"] as const;

/** 游戏中文名兜底（`/games` 返回前用于展示）。 */
export const GAME_FALLBACK_NAMES: Record<string, string> = {
  ys: "原神",
  sr: "崩坏：星穹铁道",
  zzz: "绝区零",
};

/**
 * 游戏简称，供磁贴内的窄标签使用。
 *
 * 磁贴一行只有 240px 左右，`崩坏：星穹铁道` 会占掉大半宽度，
 * 因此跨游戏聚合时必须用简称，全名留给弹窗与 tooltip。
 */
export const GAME_SHORT_NAMES: Record<string, string> = {
  ys: "原神",
  sr: "星铁",
  zzz: "绝区零",
};

/** 默认游戏：原神。 */
export const DEFAULT_GAME_ID = "ys";

/**
 * 「前瞻特别节目」的标签名。
 *
 * 实测这类条目一律是**1 分钟**事件（11:30:00Z → 11:31:00Z，即北京时间 19:30），
 * 按真实比例画到甘特图上宽度为 0、必然看不见，因此默认不显示，
 * 可选降级为只画起点标记。
 */
export const PREVIEW_LABEL = "前瞻特别节目";

/** `kind` → 缓存桶。三类数据变化速率差一个数量级，必须分开缓存各自 TTL。 */
export type ActivityBucket = "activity" | "banner" | "schedule";

/** 各缓存桶包含的一级分类（`include` 值）。 */
export const BUCKET_INCLUDES: Record<ActivityBucket, string[]> = {
  // 「游戏内活动」含 七圣召唤 / 千星奇域 等子级，传父级即包含全部子级
  activity: ["游戏内活动", "网页活动", "通行证"],
  banner: ["卡池"],
  schedule: ["版本日程"],
};

/**
 * 各桶的缓存时长。
 *
 * 日程一旦收录就基本不变，变化的主要形式是「新增」，所以长 TTL 是合理的。
 * 三类数据变化速率不同，分开而不是共用一个 TTL：
 * 否则活动一更新会把同样稳定的卡池/版本日程一起作废。
 */
export const ACTIVITY_TTL_MS = 12 * 60 * 60 * 1000;
export const BANNER_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const SCHEDULE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * **空结果**的缓存时长（1 小时），必须远短于上面的长 TTL。
 *
 * 卡池/活动在「版本更新前的空窗期」会整体为空，若按长 TTL 固化，
 * 会把整个新版本的内容一起吞掉。空只代表"当前还没公布"，随时会被填上。
 */
export const EMPTY_RESULT_TTL_MS = 60 * 60 * 1000;

/** 筛选规则（capabilities）的缓存时长：结构极少变动。 */
export const CAPABILITIES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 游戏列表的缓存时长。 */
export const GAMES_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 默认时间窗口长度（天）；接口 `to` 缺省为 from + 366 天。 */
export const DEFAULT_WINDOW_DAYS = 366;

/** 网络请求超时（毫秒）。 */
const FETCH_TIMEOUT_MS = 12 * 1000;

/** 分页单页上限（接口 limit 最大 500）。 */
const PAGE_LIMIT = 500;

/** 分页兜底页数上限，防御异常 total。 */
const MAX_PAGES = 5;

const CACHE_PREFIX = "hoyo-activity:";

// ───────────────────────────── 时间：统一按 UTC+8 ─────────────────────────────

/** 国服时区偏移。 */
export const CN_OFFSET_MS = 8 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * 把 UTC 毫秒时间换算成 UTC+8 的"墙上时间"各部分。
 *
 * 刻意不使用浏览器本地时区：接口是 UTC，国服活动按 UTC+8 才是自然语义。
 * 若跟随浏览器时区，「9/23 03:00Z」在 UTC-5 下会落到 9/22，跨日边界会产生歧义。
 */
function utc8Parts(ms: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const d = new Date(ms + CN_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** UTC+8 下的日期键 `YYYY-MM-DD`。 */
export function utc8DayKey(ms: number): string {
  const p = utc8Parts(ms);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** UTC+8 下的紧凑日期，如 `9/23`。 */
export function utc8DateLabel(ms: number): string {
  const p = utc8Parts(ms);
  return `${p.month}/${p.day}`;
}

/** UTC+8 下的时间，如 `06:00`。 */
export function utc8TimeLabel(ms: number): string {
  const p = utc8Parts(ms);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** UTC+8 下的零填充日期，如 `09/23`（横轴区间标签用，保证等宽对齐）。 */
export function utc8DateLabelPadded(ms: number): string {
  const p = utc8Parts(ms);
  return `${pad2(p.month)}/${pad2(p.day)}`;
}

/** UTC+8 下的星期，如 `周三`。 */
export function utc8WeekdayLabel(ms: number): string {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[utc8Parts(ms).weekday] ?? "";
}

/** 把一个 `YYYY-MM-DD` 日期键解析成 UTC+8 当天 00:00 的毫秒时间戳。 */
export function utc8MidnightMs(dayKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey.trim());
  if (!match) return Number.NaN;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return utc - CN_OFFSET_MS;
}

/** 日期键加天数，返回新的日期键。 */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const base = utc8MidnightMs(dayKey);
  if (!Number.isFinite(base)) return dayKey;
  return utc8DayKey(base + days * DAY_MS);
}

/** 指定日期键距另一日期键的天数差（later - earlier）。 */
export function dayKeyDiff(later: string, earlier: string): number {
  const a = utc8MidnightMs(later);
  const b = utc8MidnightMs(earlier);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((a - b) / DAY_MS);
}

// ───────────────────────────────── 数据模型 ─────────────────────────────────

/** 一条日程（已规范化为 camelCase）。 */
export interface ParsedActivityEntry {
  id: string;
  /** 一级分类，如「游戏内活动」。 */
  kind: string;
  title: string;
  /** 原始 start 字段（定时事件为 UTC RFC 3339，全天事件为 YYYY-MM-DD）。 */
  start: string;
  /** 原始 end 字段；全天事件的 end **不包含**在事件内。 */
  end: string;
  allDay: boolean;
  /** 所属版本，可能为空（角色生日为 null）。 */
  version?: string;
  cover?: string;
  /** 二级标签，如「七圣召唤」「版本维护」。 */
  labels: string[];
  url: string;
  /** 起始时间戳（全天事件取 UTC+8 当天 00:00）。 */
  startMs: number;
  /** 结束时间戳；全天事件为**不含**的边界。 */
  endMs: number;
  bucket: ActivityBucket;
}

/** 游戏摘要。 */
export interface GameSummary {
  id: string;
  name: string;
  icon?: string;
  index: number;
}

/** 筛选规则里的一项（子级值形如 `父:子`）。 */
export interface CalendarSelectorOption {
  value: string;
  label: string;
}

/** 筛选规则里的一个一级分类及其子级。 */
export interface CalendarSelector extends CalendarSelectorOption {
  children: CalendarSelectorOption[];
}

/** 日程筛选规则。 */
export interface CalendarCapabilities {
  gameId: string;
  json: string;
  ics: string;
  selectors: CalendarSelector[];
}

/** 日程接口对某游戏不可用时抛出。 */
export class CalendarUnavailableError extends Error {
  constructor(readonly gameId: string) {
    super(`calendar is not available for game ${gameId}`);
    this.name = "CalendarUnavailableError";
  }
}

// ───────────────────────────────── 解析 ─────────────────────────────────

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** `kind` → 缓存桶；未知分类归入活动桶，保证不会丢数据。 */
export function bucketOfKind(kind: string): ActivityBucket {
  if (kind === "卡池") return "banner";
  if (kind === "版本日程") return "schedule";
  return "activity";
}

/**
 * 解析一条日程记录；缺少必要字段或时间无法解析时返回 null。
 *
 * 全天事件按 UTC+8 的日边界换算：start 取当天 00:00，end 是**不含**的边界，
 * 因此 `2026-09-07 → 2026-09-08` 得到恰好一天的区间。
 */
export function parseActivityEntry(raw: unknown): ParsedActivityEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id);
  const kind = str(r.kind);
  const title = str(r.title);
  const start = str(r.start);
  const end = str(r.end);
  if (!id || !kind || !title || !start || !end) return null;

  const allDay = r.all_day === true;

  let startMs: number;
  let endMs: number;
  if (allDay) {
    startMs = utc8MidnightMs(start);
    endMs = utc8MidnightMs(end);
  } else {
    startMs = Date.parse(start);
    endMs = Date.parse(end);
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  // 结束早于开始属脏数据，直接丢弃而不是画成负宽度
  if (endMs < startMs) return null;

  const labels = Array.isArray(r.labels)
    ? r.labels.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id,
    kind,
    title,
    start,
    end,
    allDay,
    version: str(r.version),
    cover: str(r.cover),
    labels,
    url: str(r.url) ?? "",
    startMs,
    endMs,
    bucket: bucketOfKind(kind),
  };
}

/** 解析日程列表响应；不可用的条目会被丢弃。 */
export function normalizeCalendarResponse(raw: unknown): ParsedActivityEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const result: ParsedActivityEntry[] = [];
  for (const item of items) {
    const parsed = parseActivityEntry(item);
    if (parsed) result.push(parsed);
  }
  return result;
}

/** 读取分页响应里的 total，用于判断是否还要继续翻页。 */
export function readTotal(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const total = (raw as Record<string, unknown>).total;
  return typeof total === "number" && Number.isFinite(total) ? total : 0;
}

/** 解析筛选规则；结构不合法时返回 null。 */
export function parseCapabilities(raw: unknown, gameId: string): CalendarCapabilities | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const selectorsRaw = r.selectors;
  if (!Array.isArray(selectorsRaw)) return null;

  const selectors: CalendarSelector[] = [];
  for (const item of selectorsRaw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const value = str(s.value);
    const label = str(s.label);
    if (!value || !label) continue;
    const children: CalendarSelectorOption[] = [];
    if (Array.isArray(s.children)) {
      for (const child of s.children) {
        if (!child || typeof child !== "object") continue;
        const c = child as Record<string, unknown>;
        const cValue = str(c.value);
        const cLabel = str(c.label);
        if (cValue && cLabel) children.push({ value: cValue, label: cLabel });
      }
    }
    selectors.push({ value, label, children });
  }

  return {
    gameId,
    json: str(r.json) ?? "",
    ics: str(r.ics) ?? "",
    selectors,
  };
}

/** 解析游戏列表响应。 */
export function normalizeGamesResponse(raw: unknown): GameSummary[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];
  const result: GameSummary[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    const id = str(g.id);
    const name = str(g.name);
    if (!id || !name) continue;
    result.push({
      id,
      name,
      icon: str(g.icon),
      index: typeof g.index === "number" ? g.index : 0,
    });
  }
  return result;
}

/** 判断一条日程是否为「前瞻特别节目」。 */
export function isPreviewEntry(entry: ParsedActivityEntry): boolean {
  return entry.labels.includes(PREVIEW_LABEL) || entry.title.includes(PREVIEW_LABEL);
}

/** 前瞻的展示方式：默认隐藏，或只画起点标记。 */
export type PreviewMode = "hide" | "point";

/** 按前瞻展示方式过滤。 */
export function filterPreview(
  entries: ParsedActivityEntry[],
  mode: PreviewMode,
): ParsedActivityEntry[] {
  if (mode === "point") return entries;
  return entries.filter((entry) => !isPreviewEntry(entry));
}

// ───────────────────────────── 状态与排序（纯计算） ─────────────────────────────

/** 活动相对当前时间所处的阶段。 */
export type ActivityStatus = "ongoing" | "upcoming" | "ended";

/** 判断活动状态；结束时刻视为已结束（半开区间）。 */
export function activityStatus(entry: ParsedActivityEntry, now: number): ActivityStatus {
  if (now < entry.startMs) return "upcoming";
  if (now < entry.endMs) return "ongoing";
  return "ended";
}

/** 距结束还有多少天（向上取整）；已结束返回 0。 */
export function daysUntilEnd(entry: ParsedActivityEntry, now: number): number {
  if (now >= entry.endMs) return 0;
  return Math.ceil((entry.endMs - now) / DAY_MS);
}

/** 距开始还有多少天（向上取整）；已开始返回 0。 */
export function daysUntilStart(entry: ParsedActivityEntry, now: number): number {
  if (now >= entry.startMs) return 0;
  return Math.ceil((entry.startMs - now) / DAY_MS);
}

/**
 * 选中「即将到期」的条目：按结束时间升序，未结束的排前面。
 *
 * 进行中的活动（已开始未结束）天然排在纯未来活动之前，因为它们更紧迫。
 *
 * 泛型版本供磁贴使用：磁贴要跨游戏聚合，条目外面包了一层 `gameId`，
 * 因此结束时间用取键函数给出，而不是硬取 `entry.endMs`。
 */
export function selectExpiringItems<T>(
  items: readonly T[],
  endOf: (item: T) => number,
  now: number,
  limit: number,
): T[] {
  return items
    .filter((item) => endOf(item) > now)
    .sort((a, b) => endOf(a) - endOf(b))
    .slice(0, Math.max(0, limit));
}

/** 选中「即将到期」的日程（`selectExpiringItems` 的日程特化）。 */
export function selectExpiring(
  entries: ParsedActivityEntry[],
  now: number,
  limit: number,
): ParsedActivityEntry[] {
  return selectExpiringItems(entries, (entry) => entry.endMs, now, limit);
}

/**
 * 「即将截止」的判定阈值：距结束不足该天数即标红提醒。
 *
 * 取 3 天是"还能安排但不该再拖"的经验值：更短会漏掉需要提前规划的限时活动，
 * 更长则几乎整块列表都被标红，反而失去提示意义。
 */
export const URGENT_DAYS = 3;
export const URGENT_THRESHOLD_MS = URGENT_DAYS * DAY_MS;

/**
 * 是否为「即将截止」：未结束，且距结束不超过阈值。
 *
 * 已结束的一律返回 false——磁贴常规列表本就不含已结束项，
 * 固定项则可能已结束，把它标红会误导成"还要到期"。
 */
export function isUrgent(
  entry: ParsedActivityEntry,
  now: number,
  thresholdMs = URGENT_THRESHOLD_MS,
): boolean {
  if (now >= entry.endMs) return false;
  return entry.endMs - now <= thresholdMs;
}

/** 按 id 取出被固定的日程，保持传入的固定顺序。 */
export function selectPinned(
  entries: ParsedActivityEntry[],
  pinnedIds: readonly string[],
): ParsedActivityEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const result: ParsedActivityEntry[] = [];
  for (const id of pinnedIds) {
    const entry = byId.get(id);
    if (entry) result.push(entry);
  }
  return result;
}

/** 切换某个 id 的固定状态，返回新的固定列表。 */
export function togglePinned(pinnedIds: readonly string[], id: string): string[] {
  return pinnedIds.includes(id) ? pinnedIds.filter((item) => item !== id) : [...pinnedIds, id];
}

/** 某条日程是否被固定。 */
export function isPinned(pinnedIds: readonly string[], id: string): boolean {
  return pinnedIds.includes(id);
}

/**
 * 固定项的存储形式：按游戏分开的 id 集合。
 *
 * 磁贴改为跨游戏聚合后，只用一维 id 列表会出问题——不同游戏的日程 id
 * 理论上可能相撞，且区分"这条固定项属于哪个游戏"也才能正确取数与展示来源。
 */
export type PinnedMap = Record<string, string[]>;

/** 读取按游戏分组的固定项；兼容旧版本的一维数组（归给默认游戏）。 */
export function readPinnedMap(data?: Record<string, unknown>): PinnedMap {
  const raw = data?.pinned;
  // 旧数据是一条扁平数组，迁移到默认游戏名下，避免升级后固定项全部丢失
  if (Array.isArray(raw)) {
    const ids = raw.filter((item): item is string => typeof item === "string");
    return ids.length > 0 ? { [DEFAULT_GAME_ID]: ids } : {};
  }
  if (!raw || typeof raw !== "object") return {};
  const result: PinnedMap = {};
  for (const [gameId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const ids = value.filter((item): item is string => typeof item === "string");
    if (ids.length > 0) result[gameId] = ids;
  }
  return result;
}

/** 取某个游戏的固定 id 列表。 */
export function pinnedIdsOf(map: PinnedMap, gameId: string): string[] {
  return map[gameId] ?? [];
}

/**
 * 切换某个游戏里的某个固定项，返回新的分组映射。
 *
 * 空数组要从映射里删掉而不是留一个空列表：否则"取消最后一个固定项"会写入
 * 一堆空 key，既脏又会让"是否有固定项"的判断写法变复杂。
 */
export function togglePinnedInMap(map: PinnedMap, gameId: string, id: string): PinnedMap {
  const current = map[gameId] ?? [];
  const next = togglePinned(current, id);
  const result: PinnedMap = { ...map };
  if (next.length === 0) delete result[gameId];
  else result[gameId] = next;
  return result;
}

/** 某个游戏里是否有固定项。 */
export function hasPinnedInMap(map: PinnedMap, gameId: string): boolean {
  return (map[gameId]?.length ?? 0) > 0;
}

// ───────────────────────────── 甘特图布局（纯计算） ─────────────────────────────

/**
 * 短于该阈值的事件按「点标记」处理。
 *
 * 前瞻特别节目实测为 1 分钟，按比例算宽度是 0，画成条必然不可见。
 */
export const POINT_THRESHOLD_MS = 60 * 60 * 1000;

/** 甘特条的最小宽度百分比，避免极短事件被压成 0 宽而消失。 */
export const MIN_BAR_WIDTH_PCT = 1.2;

/**
 * 今天在甘特窗口中的横向位置：**前 30% 回看、后 70% 前瞻**。
 *
 * 以今天为基准而不是"从今天往后铺"：这样既能看到已经进行中的活动
 * 已经跑了多久（左侧 30%），又把大部分宽度留给未来（右侧 70%）。
 */
export const GANTT_LOOKBACK_RATIO = 0.3;

/** 甘特图的时间窗口（总天数已取整到整周，便于切成整数个周块）。 */
export interface GanttWindow {
  startMs: number;
  endMs: number;
  /** 窗口总天数，为 7 的倍数。 */
  days: number;
  /** 周数。 */
  weeks: number;
}

/**
 * 由「今天 + 期望的总跨度天数」推出甘特窗口。
 *
 * - **今天固定在 30% 处**（前 30% 回看 / 后 70% 前瞻）；
 * - 总天数取整到**整周**，使横轴恰好切成等宽的周块；
 * - 回看天数取整到整天，保持日边界干净。
 *
 * 注意：这里刻意**不做"起点对齐到周一"**。日历周对齐与"今天恰好 30%"
 * 是互斥的（今天距周一的偏移由星期几决定，无法同时满足）。
 * 30/70 的可读性更重要，因此周块改为"从窗口起点起的连续 7 天"，
 * 并用 `09/14-09/20` 这样的区间标签消除歧义。
 */
export function ganttWindow(now: number, totalDays: number): GanttWindow {
  const requested = Math.max(1, Math.floor(totalDays));
  // 取整到整周：保证每个周块等宽
  const weeks = Math.max(1, Math.round(requested / 7));
  const days = weeks * 7;
  // 今天落在 30% 处；取整到整天，避免窗口起点落在半天上
  const back = Math.round(days * GANTT_LOOKBACK_RATIO);

  const todayStartMs = utc8MidnightMs(utc8DayKey(now));
  const startMs = todayStartMs - back * DAY_MS;
  return { startMs, endMs: startMs + days * DAY_MS, days, weeks };
}

/**
 * 今天在该窗口中的百分比位置。
 *
 * 用「今天 00:00（UTC+8）」定位，而不是当前时刻：
 * 否则同一天内随着时间推移竖线会缓慢右移，且 30% 的基准会漂移。
 */
export function ganttTodayPct(win: GanttWindow, now: number): number {
  const span = win.endMs - win.startMs;
  if (!(span > 0)) return 0;
  const todayStartMs = utc8MidnightMs(utc8DayKey(now));
  return ((todayStartMs - win.startMs) / span) * 100;
}

/**
 * 横轴粒度：短窗口按周，长窗口按月。
 *
 * 赛季/版本约 2~3 个月，所以半年窗口只跨 2~3 个版本、一年跨 4~6 个。
 * 若长窗口仍按周分块，半年会有 26 块、一年 52 块，标签必然挤成一团；
 * 改用月块既能容纳标签，也正好对得上"一个版本一两个月"的阅读习惯。
 */
export type GanttAxisUnit = "week" | "month";

/** 超过该天数改用月粒度（约两个月以上，周块已密到放不下文字）。 */
export const GANTT_MONTH_UNIT_THRESHOLD_DAYS = 70;

/** 按窗口长度选择横轴粒度。 */
export function ganttAxisUnit(win: GanttWindow): GanttAxisUnit {
  return win.days > GANTT_MONTH_UNIT_THRESHOLD_DAYS ? "month" : "week";
}

/** 甘特图横轴的一个刻度块。 */
export interface GanttAxisColumn {
  /** 稳定 key（含起止日），可直接用作 React key。 */
  key: string;
  /** 主标签，如「第 1 周」「9月」。 */
  label: string;
  /** 次标签，如 `09/14-09/20`，或跨年时的年份；可能为空。 */
  subLabel: string;
  leftPct: number;
  widthPct: number;
}

/** 周粒度的刻度块（每块恰好 7 天）。 */
function buildWeekAxis(win: GanttWindow): GanttAxisColumn[] {
  const columns: GanttAxisColumn[] = [];
  for (let i = 0; i < win.weeks; i++) {
    const startMs = win.startMs + i * 7 * DAY_MS;
    // 区间标签取"含当天"的末日，便于直接阅读
    const lastMs = startMs + 6 * DAY_MS;
    columns.push({
      key: `w-${utc8DayKey(startMs)}`,
      label: `第 ${i + 1} 周`,
      subLabel: `${utc8DateLabelPadded(startMs)}-${utc8DateLabelPadded(lastMs)}`,
      leftPct: ((i * 7) / win.days) * 100,
      widthPct: (7 / win.days) * 100,
    });
  }
  return columns;
}

/** 月粒度的刻度块；首尾两块按窗口边界裁剪。 */
function buildMonthAxis(win: GanttWindow): GanttAxisColumn[] {
  const span = win.endMs - win.startMs;
  const columns: GanttAxisColumn[] = [];
  const first = utc8Parts(win.startMs);
  const lastParts = utc8Parts(win.endMs - 1); // 末端的最后一天
  // 跨年时才显示年份，否则半年窗口里年份会重复多次
  const spansYears = first.year !== lastParts.year;

  let year = first.year;
  let month = first.month;
  while (year < lastParts.year || (year === lastParts.year && month <= lastParts.month)) {
    const monthStartMs = utc8MidnightMs(`${year}-${pad2(month)}-01`);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const monthEndMs = utc8MidnightMs(`${nextYear}-${pad2(nextMonth)}-01`);

    const clippedStart = Math.max(monthStartMs, win.startMs);
    const clippedEnd = Math.min(monthEndMs, win.endMs);
    if (clippedEnd > clippedStart) {
      columns.push({
        key: `m-${year}-${pad2(month)}`,
        label: `${month}月`,
        // 跨年窗口里标出年份：首个整月与每年 1 月
        subLabel: spansYears && (columns.length === 0 || month === 1) ? String(year) : "",
        leftPct: ((clippedStart - win.startMs) / span) * 100,
        widthPct: ((clippedEnd - clippedStart) / span) * 100,
      });
    }

    year = nextYear;
    month = nextMonth;
  }
  return columns;
}

/** 生成横轴刻度；粒度随窗口长度自动切换。 */
export function buildAxisColumns(win: GanttWindow, unit = ganttAxisUnit(win)): GanttAxisColumn[] {
  return unit === "month" ? buildMonthAxis(win) : buildWeekAxis(win);
}

/** 一条甘特条的布局结果。 */
export interface GanttBar {
  entry: ParsedActivityEntry;
  /** 所在泳道（0 起）。互不重叠的活动会共用同一泳道。 */
  lane: number;
  /** 左边界百分比 0~100。 */
  leftPct: number;
  /** 宽度百分比 0~100；点标记为 0。 */
  widthPct: number;
  /** 事件过短（如 1 分钟的前瞻），只画起点标记而不画条。 */
  isPoint: boolean;
  /** 左端被窗口截断（说明实际开始早于窗口）。 */
  clippedStart: boolean;
  /** 右端被窗口截断（说明实际结束晚于窗口）。 */
  clippedEnd: boolean;
}

/** 甘特图布局结果。 */
export interface GanttLayout {
  bars: GanttBar[];
  /** 泳道总数；为 0 表示没有可见活动。 */
  laneCount: number;
}

export interface GanttLayoutOptions {
  /** 点标记阈值，缺省 1 小时。 */
  pointThresholdMs?: number;
  /** 最小条宽百分比，缺省 1.2。 */
  minWidthPct?: number;
}

/**
 * 计算甘特图布局：**泳道装箱** + 两端裁剪。
 *
 * 与"每个活动一行"的进度条式布局不同，这里把互不重叠的活动放进同一泳道
 * （贪心：放进第一条「上一段已结束」的泳道，都不满足则新开一条），
 * 这样短时间内先后发生的多个活动共享一行，行数更少、也更像真正的时间轴。
 *
 * 只保留与窗口相交的事件（`end > start_w && start < end_w`），两端各做 clamp，
 * 避免早于窗口开始或晚于结束的长条溢出画布。
 */
export function computeGanttLayout(
  entries: ParsedActivityEntry[],
  windowStartMs: number,
  windowEndMs: number,
  options: GanttLayoutOptions = {},
): GanttLayout {
  const span = windowEndMs - windowStartMs;
  if (!(span > 0)) return { bars: [], laneCount: 0 };
  const pointThreshold = options.pointThresholdMs ?? POINT_THRESHOLD_MS;
  const minWidth = options.minWidthPct ?? MIN_BAR_WIDTH_PCT;

  const visible = entries
    .filter((entry) => entry.endMs > windowStartMs && entry.startMs < windowEndMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const bars: GanttBar[] = [];
  /** 每条泳道当前的占用结束时间。 */
  const laneEnds: number[] = [];

  for (const entry of visible) {
    // 贪心找一条空闲泳道；找不到就新开一条
    let lane = laneEnds.findIndex((end) => end <= entry.startMs);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(entry.endMs);
    } else {
      laneEnds[lane] = Math.max(laneEnds[lane]!, entry.endMs);
    }

    const clippedStart = Math.max(entry.startMs, windowStartMs);
    const clippedEnd = Math.min(entry.endMs, windowEndMs);
    const leftPct = ((clippedStart - windowStartMs) / span) * 100;

    // 点标记：事件本身很短（前瞻），或窗口内可见部分极短
    const isPoint = entry.endMs - entry.startMs <= pointThreshold;
    let widthPct = isPoint ? 0 : ((clippedEnd - clippedStart) / span) * 100;
    if (!isPoint) {
      if (widthPct < minWidth) widthPct = minWidth;
      // 右边界不得超出画布，否则条会溢出被裁掉
      if (leftPct + widthPct > 100) widthPct = Math.max(0, 100 - leftPct);
    }

    bars.push({
      entry,
      lane,
      leftPct,
      widthPct,
      isPoint,
      clippedStart: entry.startMs < windowStartMs,
      clippedEnd: entry.endMs > windowEndMs,
    });
  }

  return { bars, laneCount: laneEnds.length };
}

/**
 * 距结束的展示文案：不足一天按小时，其余按天。
 *
 * 返回结构化结果而不是拼好的字符串，便于调用方按语言本地化。
 */
export type RemainingText =
  | { unit: "ended" }
  | { unit: "hours"; value: number }
  | { unit: "days"; value: number };

/** 计算剩余时间文案（按 UTC+8 无关的绝对时长）。 */
export function remainingText(entry: ParsedActivityEntry, now: number): RemainingText {
  if (now >= entry.endMs) return { unit: "ended" };
  const ms = entry.endMs - now;
  if (ms < DAY_MS) return { unit: "hours", value: Math.max(1, Math.ceil(ms / HOUR_MS)) };
  return { unit: "days", value: Math.ceil(ms / DAY_MS) };
}

/** 活动时间范围文案，如 `8/12 11:00 → 11/3 14:59`（北京时间）。 */
export function formatRange(entry: ParsedActivityEntry): string {
  if (entry.allDay) {
    // 全天事件的 end 不含当天，展示为闭区间需回退一天
    const lastDay = utc8DayKey(entry.endMs - 1);
    return entry.start === lastDay ? entry.start : `${entry.start} → ${lastDay}`;
  }
  const start = `${utc8DateLabel(entry.startMs)} ${utc8TimeLabel(entry.startMs)}`;
  const end = `${utc8DateLabel(entry.endMs)} ${utc8TimeLabel(entry.endMs)}`;
  return `${start} → ${end}`;
}

/**
 * 直接读缓存（不发请求），用于首屏秒开。
 *
 * 磁贴挂载时应先用它渲染出已有数据，再决定是否联网刷新，
 * 避免每次打开新标签页都先闪一下"加载中"。
 */
export function readCachedEntries(query: CalendarQuery): ParsedActivityEntry[] | null {
  return mergeBuckets((bucket) => {
    // 用 readFreshCache：readCache 会删掉过期条目，而那份过期数据
    // 正是 readStaleEntries 的兜底来源，不能被首屏读取顺手清掉。
    const cached = readFreshCache<unknown>(bucketCacheKey(query.gameId, bucket));
    return isUsableEntries(cached) ? cached : null;
  });
}

/**
 * 读取**已过期**的日程缓存（不发请求）。
 *
 * 用于「远端拿不到数据时保持当前数据」：日程条目一旦收录就基本不变，
 * 过期只说明可能少了新增内容，继续展示远好过清空。
 */
export function readStaleEntries(query: CalendarQuery): ParsedActivityEntry[] | null {
  return mergeBuckets((bucket) => {
    const cached = readStaleCache<unknown>(bucketCacheKey(query.gameId, bucket));
    return isUsableEntries(cached) ? cached : null;
  });
}

/** 按桶读取并合并去重；三桶全空视为未命中。 */
function mergeBuckets(
  load: (bucket: ActivityBucket) => ParsedActivityEntry[] | null,
): ParsedActivityEntry[] | null {
  const merged: ParsedActivityEntry[] = [];
  let hit = false;
  for (const bucket of ["activity", "banner", "schedule"] as const) {
    const entries = load(bucket);
    if (entries !== null) {
      hit = true;
      merged.push(...entries);
    }
  }
  // 三桶全无缓存才算未命中；命中任一桶即可先渲染（其余桶随后补拉）
  if (!hit) return null;
  const seen = new Set<string>();
  return merged.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

/** 缓存是否已有该窗口的数据（不发请求即可判断能否秒开）。 */
export function hasCachedEntries(query: CalendarQuery): boolean {
  return readCachedEntries(query) !== null;
}

// ───────────────────────────── 筛选选择（父/子两级） ─────────────────────────────

/**
 * 父级是否被选中。
 *
 * 语义：`include` 传父级即等于包含其全部子级（实测验证），
 * 所以选中状态直接存父级 value 即可，不需要展开成子级列表。
 */
export function isParentChecked(selected: ReadonlySet<string>, parentValue: string): boolean {
  return selected.has(parentValue);
}

/** 子级是否被选中：父级被选中时，其所有子级都视为选中。 */
export function isChildChecked(
  selected: ReadonlySet<string>,
  parentValue: string,
  childValue: string,
): boolean {
  return selected.has(parentValue) || selected.has(childValue);
}

/**
 * 切换一个筛选值（父级或子级），返回新的选中集合。
 *
 * - 勾父级 → 加父级、清掉其全部子级（用父级表示"全选"）；
 * - 取消父级 → 同时清掉其全部子级；
 * - 勾某个子级 → 若父级在集合里，展开成"父级其余子级 + 该子级"（等价于父级减去未勾的）；
 * - 取消某个子级 → 同理展开成"父级其余子级"。
 *
 * 这样服务端始终收到语义明确的值：要么是父级（=全部子级），要么是显式子级列表（OR）。
 */
export function toggleSelectorValue(
  selectors: readonly CalendarSelector[],
  selected: ReadonlySet<string>,
  value: string,
): Set<string> {
  const next = new Set(selected);
  const parent = selectors.find((item) => item.value === value);

  if (parent) {
    if (next.has(parent.value)) {
      next.delete(parent.value);
      for (const child of parent.children) next.delete(child.value);
    } else {
      next.add(parent.value);
      for (const child of parent.children) next.delete(child.value);
    }
    return next;
  }

  // 目标是子级：找到它的父级
  const owner = selectors.find((item) => item.children.some((child) => child.value === value));
  if (!owner) {
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const wasChecked = next.has(owner.value) || next.has(value);
  if (wasChecked) {
    if (next.has(owner.value)) {
      // 父级"全选"被打破：展开成除该子级外的其余子级
      next.delete(owner.value);
      for (const child of owner.children) next.add(child.value);
    }
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

/** 把选中集合转成发给服务端的 `include` 数组（保持 capabilities 的声明顺序）。 */
export function selectionToIncludes(
  selectors: readonly CalendarSelector[],
  selected: ReadonlySet<string>,
): string[] {
  const ordered: string[] = [];
  for (const parent of selectors) {
    if (selected.has(parent.value)) {
      ordered.push(parent.value);
      continue;
    }
    for (const child of parent.children) {
      if (selected.has(child.value)) ordered.push(child.value);
    }
  }
  // 兜底：集合里可能有不在 capabilities 中的值（例如旧版本残留）
  for (const value of selected) {
    if (!ordered.includes(value)) ordered.push(value);
  }
  return ordered;
}

/** 默认选中全部一级分类（再由默认排除项收窄）。 */
export function defaultSelection(selectors: readonly CalendarSelector[]): Set<string> {
  return new Set(selectors.map((item) => item.value));
}

// ───────────────────────────── 小部件数据读写（纯函数） ─────────────────────────────

/** 视图模式：甘特图或纯日程列表。 */
export type ViewMode = "gantt" | "list";

/** 小部件持久化数据的读取器集合。 */
export function readGameId(data?: Record<string, unknown>): string {
  const value = data?.gameId;
  return typeof value === "string" && value.trim() !== "" ? value : DEFAULT_GAME_ID;
}

/**
 * 磁贴外显的游戏范围。
 *
 * 与弹窗里"当前查看的游戏"（`gameId`）**完全无关**：
 * `gameId` 只决定弹窗内展示哪个游戏的日程，
 * 而这里是磁贴要聚合展示的游戏集合，是一份固定列表。
 */
type DisplayGamesMode = "all" | "custom";

/** 外显游戏配置。 */
export interface DisplayGamesSetting {
  mode: DisplayGamesMode;
  /** `mode === "custom"` 时生效的游戏 id 列表。 */
  games: string[];
}

/**
 * 读取磁贴外显游戏配置。
 *
 * 兼容两种历史/手写形态：
 * - 缺省（旧版本数据）→ `all`，即维持原来的"总是显示"行为，升级后外观不变；
 * - 裸数组 → 视为 `custom` 列表（写入侧的简化形式）。
 *
 * **不做排序或去重以外的裁剪**：具体哪些 id 有意义由调用方按
 * `CALENDAR_GAME_IDS` 过滤（纯逻辑层不绑定游戏集合）。
 */
export function readDisplayGames(data?: Record<string, unknown>): DisplayGamesSetting {
  const raw = data?.displayGames;
  if (Array.isArray(raw)) {
    return { mode: "custom", games: uniqueStrings(raw) };
  }
  if (!raw || typeof raw !== "object") return { mode: "all", games: [] };
  const r = raw as Record<string, unknown>;
  const games = Array.isArray(r.games) ? uniqueStrings(r.games) : [];
  // 只有显式写了 mode: "custom" 才进入自定义；否则一律按"全部"处理
  const mode: DisplayGamesMode = r.mode === "custom" ? "custom" : "all";
  return { mode, games };
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "" || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * 按候选游戏顺序解析出真正要外显的游戏 id。
 *
 * - `all` → 全部候选；
 * - `custom` → 只保留候选里被勾选的（按候选顺序，而不是用户勾选顺序，
 *   这样磁贴里游戏的分组顺序始终稳定）；
 * - 一个都没勾选 → 返回空数组，由调用方决定"只显示固定项"。
 *
 * 关键在于"在候选集内求交"：用户在旧版本勾过、后来被下线的游戏 id
 * 不会让磁贴去请求一个不存在的游戏。
 */
export function resolveDisplayGameIds(
  setting: DisplayGamesSetting,
  candidates: readonly string[],
): string[] {
  if (setting.mode === "all") return [...candidates];
  const chosen = new Set(setting.games);
  return candidates.filter((id) => chosen.has(id));
}

/** 某个游戏是否允许外显（弹窗勾选框用）。 */
export function isDisplayGameChecked(setting: DisplayGamesSetting, gameId: string): boolean {
  return setting.mode === "all" ? true : setting.games.includes(gameId);
}

/**
 * 切换某个游戏的外显勾选状态，返回新的配置。
 *
 * 从 `all` 切换到具体勾选时，要先展开成"全部候选减去取消的那个"，
 * 否则"在全部显示的状态下取消一个"会变成"一个都不显示"。
 */
export function toggleDisplayGame(
  setting: DisplayGamesSetting,
  gameId: string,
  candidates: readonly string[],
): DisplayGamesSetting {
  const current = isDisplayGameChecked(setting, gameId)
    ? resolveDisplayGameIds(setting, candidates)
    : resolveDisplayGameIds({ mode: "custom", games: setting.games }, candidates);
  const chosen = new Set(current);
  if (chosen.has(gameId)) chosen.delete(gameId);
  else chosen.add(gameId);
  return { mode: "custom", games: candidates.filter((id) => chosen.has(id)) };
}

/** 一个游戏的日程集合（磁贴跨游戏聚合的基本单元）。 */
export interface GameEntries {
  gameId: string;
  entries: ParsedActivityEntry[];
}

/** 磁贴外显的一行。 */
export interface ActivityTileRow {
  gameId: string;
  entry: ParsedActivityEntry;
  /** 来自固定列表：常驻展示，不受外显游戏勾选影响。 */
  pinned: boolean;
  /** 即将截止，需要标红。 */
  urgent: boolean;
}

/** 跨游戏行的去重键（不能只用 id：不同游戏的日程 id 可能相撞）。 */
function rowKey(gameId: string, id: string): string {
  return `${gameId}\u0000${id}`;
}

/** 把多个游戏的日程聚合成磁贴展示行的参数。 */
export interface BuildTileRowsOptions {
  /** 已取到的各游戏日程。允许只包含部分游戏（缺的按空处理）。 */
  groups: readonly GameEntries[];
  /** 允许外显的游戏 id（决定"即将截止"的取数范围）。 */
  displayGameIds: readonly string[];
  /** 按游戏分组的固定项。 */
  pinned: PinnedMap;
  now: number;
  /** 磁贴能完整容纳的行数。 */
  maxItems: number;
  /**
   * 分类筛选（弹窗里的父/子两级勾选），**只作用于"即将截止"区**。
   *
   * 固定项刻意不受它影响：固定是比分类筛选更具体的用户意图，
   * 否则用户取消某个分类会把已固定的活动一起藏掉，与"常驻展示"矛盾。
   */
  filter?: (entry: ParsedActivityEntry) => boolean;
}

/**
 * 按磁贴规则排出展示行（需求 1~4 的落点）。
 *
 * 1. **"即将截止"只从允许外显的游戏里取**——未勾选的游戏不出现在这一区，
 *    空集合时该区为空，从而支持"不显示"；
 * 2. **固定项始终显示**，即使它所属的游戏没被勾选：固定是更明确的用户意图，
 *    与"是否外显该游戏"无关，否则取消勾选会把固定项一起藏掉；
 * 3. **外显与弹窗里查看的游戏无关**：本函数只接受 `displayGameIds`，
 *    完全不看 `gameId`，因此磁贴是一份与弹窗选择解耦的固定列表。
 *
 * 排序与旧的单游戏磁贴一致：固定项在前（保持用户固定顺序），
 * 其余按结束时间升序，取满可用槽位为止。
 */
export function buildTileRows(options: BuildTileRowsOptions): ActivityTileRow[] {
  const { groups, displayGameIds, pinned, now, maxItems, filter } = options;
  const byGame = new Map(groups.map((group) => [group.gameId, group.entries]));

  /**
   * 固定项的游戏遍历顺序：先按允许外显的顺序，再补上"只被固定、未被勾选"的游戏。
   * 后者按 id 排序，保证同一份数据每次渲染出的行序稳定。
   */
  const displaySet = new Set(displayGameIds);
  const extraPinnedGames = Object.keys(pinned)
    .filter((gameId) => !displaySet.has(gameId))
    .sort();
  const orderedGames = [...displayGameIds, ...extraPinnedGames];

  const pinnedRows: ActivityTileRow[] = [];
  const pinnedKeys = new Set<string>();
  for (const gameId of orderedGames) {
    const ids = pinned[gameId];
    if (!ids || ids.length === 0) continue;
    const entries = byGame.get(gameId);
    if (!entries) continue;
    for (const entry of selectPinned(entries, ids)) {
      pinnedRows.push({ gameId, entry, pinned: true, urgent: isUrgent(entry, now) });
      pinnedKeys.add(rowKey(gameId, entry.id));
    }
  }

  // 即将截止：只允许外显的游戏参与，且跳过已经作为固定项展示过的行
  const candidates: { gameId: string; entry: ParsedActivityEntry }[] = [];
  for (const gameId of displayGameIds) {
    const entries = byGame.get(gameId);
    if (!entries) continue;
    for (const entry of entries) {
      if (pinnedKeys.has(rowKey(gameId, entry.id))) continue;
      // 分类筛选只作用于这一区：固定项在上面已经无条件展示完了
      if (filter && !filter(entry)) continue;
      candidates.push({ gameId, entry });
    }
  }
  const slots = Math.max(0, maxItems - pinnedRows.length);
  const expiringRows = selectExpiringItems(candidates, (item) => item.entry.endMs, now, slots).map(
    ({ gameId, entry }) => ({ gameId, entry, pinned: false, urgent: isUrgent(entry, now) }),
  );

  return [...pinnedRows, ...expiringRows];
}

/** 按游戏读取缓存并聚合成组；全部未命中时返回 null。 */
function collectGameEntries(
  gameIds: readonly string[],
  read: (gameId: string) => ParsedActivityEntry[] | null,
): GameEntries[] | null {
  const groups: GameEntries[] = [];
  for (const gameId of gameIds) {
    const entries = read(gameId);
    if (entries) groups.push({ gameId, entries });
  }
  return groups.length > 0 ? groups : null;
}

/**
 * 首屏读取多个游戏的缓存（不发请求）。
 *
 * 只要有任一游戏命中就返回，让磁贴立刻有内容可渲染；
 * 全都未命中才返回 null，此时调用方显示"加载中"。
 */
export function readCachedEntriesForGames(
  gameIds: readonly string[],
  from: string,
  to: string,
): GameEntries[] | null {
  return collectGameEntries(gameIds, (gameId) => readCachedEntries({ gameId, from, to }));
}

/** 读取多个游戏的**过期**缓存（不发请求），供远端不可用时兜底。 */
export function readStaleEntriesForGames(
  gameIds: readonly string[],
  from: string,
  to: string,
): GameEntries[] | null {
  return collectGameEntries(gameIds, (gameId) => readStaleEntries({ gameId, from, to }));
}

/** 多游戏取数的结果：成功的组 + 失败的明细。 */
export interface GameEntriesResult {
  groups: GameEntries[];
  failures: {
    gameId: string;
    /** true = 该游戏本就不提供日程（404），属正常状态而非网络故障。 */
    unavailable: boolean;
  }[];
}

/**
 * 并发取多个游戏的日程。
 *
 * 与单游戏版本的关键差别：**单个游戏失败不影响其余游戏**。
 * 有的游戏本就不支持日程（404 → `CalendarUnavailableError`），
 * 若用 `Promise.all` 整体 reject，一个未开放日程的游戏就会把整块磁贴打空；
 * 而磁贴要汇总多个游戏，局部失败必须局部消化。
 * 失败的游戏回落到它自己的缓存（可能已过期），仍无缓存则记进 `failures`，
 * 由调用方区分"该游戏没有日程"与"网络故障"。
 */
export async function fetchEntriesForGames(
  gameIds: readonly string[],
  from: string,
  to: string,
  options: { force?: boolean } = {},
): Promise<GameEntriesResult> {
  const results = await Promise.allSettled(
    gameIds.map(async (gameId) => ({
      gameId,
      entries: await fetchActivityEntries({ gameId, from, to }, options),
    })),
  );

  const groups: GameEntries[] = [];
  const failures: GameEntriesResult["failures"] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === "fulfilled") {
      groups.push(result.value);
      continue;
    }
    const gameId = gameIds[i]!;
    const fallback =
      readCachedEntries({ gameId, from, to }) ?? readStaleEntries({ gameId, from, to });
    if (fallback) {
      groups.push({ gameId, entries: fallback });
      continue;
    }
    failures.push({
      gameId,
      unavailable: result.reason instanceof CalendarUnavailableError,
    });
  }
  return { groups, failures };
}

/**
 * 需要取数的游戏集合：允许外显的 + 有固定项但未被勾选的。
 *
 * 后者必须一并取数，否则"取消勾选某个游戏但固定了它的一条活动"时，
 * 那条固定项会因为拿不到该游戏的数据而凭空消失。
 */
export function requiredGameIds(displayGameIds: readonly string[], pinned: PinnedMap): string[] {
  const ids = [...displayGameIds];
  for (const gameId of Object.keys(pinned).sort()) {
    if (!ids.includes(gameId)) ids.push(gameId);
  }
  return ids;
}

/** 读取前瞻展示方式。 */
export function readPreviewMode(data?: Record<string, unknown>): PreviewMode {
  return data?.preview === "point" ? "point" : "hide";
}

/** 读取视图模式。 */
export function readViewMode(data?: Record<string, unknown>): ViewMode {
  return data?.view === "list" ? "list" : "gantt";
}

/** 读取时间窗口天数。 */
export function readWindowDays(data?: Record<string, unknown>): number {
  const value = data?.days;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  return 14;
}

/** 读取用户选中的筛选值；未设置时返回 null（表示用默认值）。 */
export function readSelected(data?: Record<string, unknown>): Set<string> | null {
  const raw = data?.selected;
  if (!Array.isArray(raw)) return null;
  const values = raw.filter((item): item is string => typeof item === "string");
  return values.length > 0 ? new Set(values) : null;
}

/**
 * 计算一份默认选中集合：全选一级分类后，去掉默认排除项。
 *
 * 排除 `角色生日`（全天事件过多）与 `版本日程:前瞻特别节目`（1 分钟事件）。
 */
export function computeDefaultSelection(selectors: readonly CalendarSelector[]): Set<string> {
  const selected = defaultSelection(selectors);
  const preview = selectors.find((item) => item.children.some((c) => c.label === PREVIEW_LABEL));
  // 有子级时按子级精确排除，避免误排掉整个「版本日程」
  if (preview) {
    const child = preview.children.find((c) => c.label === PREVIEW_LABEL);
    if (child) {
      selected.delete(preview.value);
      for (const item of preview.children) {
        if (item.value !== child.value) selected.add(item.value);
      }
    }
  }
  selected.delete("角色生日");
  return selected;
}

/**
 * 单条日程是否命中筛选条件。
 *
 * 命中规则：
 * - 该 `kind` 的父级被选中 → 通过（等于"包含其全部子级"）；
 * - 或任一 label 命中了被选中的子级值 `kind:label` → 通过。
 *
 * 抽成谓词供两处复用：`applySelectionFilter` 批量筛选，
 * 以及磁贴里对单条固定项/候选做归属判断。
 */
export function matchesSelection(
  entry: ParsedActivityEntry,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.has(entry.kind)) return true;
  return entry.labels.some((label) => selected.has(`${entry.kind}:${label}`));
}

/**
 * 按用户选择**在本地**过滤已缓存的日程。
 *
 * 关键设计：网络层按「桶」整取三类数据（各自长 TTL），筛选完全在前端做。
 * 这样切换筛选条件**不产生任何请求**，也不会破坏缓存复用；
 * 若把 include 塞进请求，每改一次勾选就要重拉一次，长 TTL 就失去意义了。
 */
export function applySelectionFilter(
  entries: ParsedActivityEntry[],
  selected: ReadonlySet<string>,
  options: { previewMode?: PreviewMode } = {},
): ParsedActivityEntry[] {
  if (selected.size === 0) return [];
  const filtered = entries.filter((entry) => matchesSelection(entry, selected));
  return filterPreview(filtered, options.previewMode ?? "hide");
}

// ───────────────────────────────── URL 构造 ─────────────────────────────────

/** 日程 JSON 路径。 */
export function calendarPath(gameId: string): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/calendar`;
}

/** 日程筛选规则路径。 */
export function calendarCapabilitiesPath(gameId: string): string {
  return `/api/v1/games/${encodeURIComponent(gameId)}/calendar/capabilities`;
}

/** 游戏列表路径。 */
export const GAMES_PATH = "/api/v1/games";

export interface CalendarQuery {
  gameId: string;
  /** 开始日期 `YYYY-MM-DD`。 */
  from: string;
  /** 结束日期 `YYYY-MM-DD`。 */
  to: string;
  /** 包含的筛选值，可多值（OR）。 */
  include?: readonly string[];
  /** 排除的筛选值，在 include 之后生效。 */
  exclude?: readonly string[];
  limit?: number;
  offset?: number;
}

/**
 * 构造日程查询 URL。
 *
 * `include` / `exclude` 通过重复参数传递（服务端按数组接收），
 * 子级值形如 `游戏内活动:七圣召唤`，必须整体作为一个参数值。
 */
export function buildCalendarUrl(query: CalendarQuery): string {
  const search = new URLSearchParams();
  search.set("from", query.from);
  search.set("to", query.to);
  for (const value of query.include ?? []) search.append("include", value);
  for (const value of query.exclude ?? []) search.append("exclude", value);
  search.set("limit", String(query.limit ?? PAGE_LIMIT));
  if (query.offset) search.set("offset", String(query.offset));
  return `${AKASHA_BASE}${calendarPath(query.gameId)}?${search.toString()}`;
}

/** 按"今天起 N 天"构造默认查询窗口。 */
export function defaultQuery(
  gameId: string,
  now: number,
  options: { include?: readonly string[]; exclude?: readonly string[]; days?: number } = {},
): CalendarQuery {
  const from = utc8DayKey(now);
  const to = addDaysToDayKey(from, options.days ?? DEFAULT_WINDOW_DAYS);
  return { gameId, from, to, include: options.include, exclude: options.exclude };
}

// ───────────────────────────────── 缓存键 ─────────────────────────────────

/**
 * 缓存键：**只按游戏与桶**，不含查询窗口的日期。
 *
 * 这一点是本小部件长 TTL 能否成立的关键。此前把 `from` / `to` 并入键，
 * 而查询窗口以「今天」为起点，于是**每天都会换一把新键**，
 * 长 TTL 从未真正生效——等于每天必然重拉三个桶。
 *
 * 实测上游语义：接口只保留当前官方活动列表，会**删除**已下线的旧活动，
 * 因此缓存是"当前集合的快照"；`from` / `to` 仅用于服务端筛选，
 * 甘特窗口由 `now` 在前端本地计算，与缓存键无关。
 *
 * 跨天时窗口虽然滚动，但缓存内容仍然有效（长活动本就不该因跨天丢失），
 * 由各桶 TTL（12 小时 / 3 天）负责新鲜度。
 */
export function bucketCacheKey(gameId: string, bucket: ActivityBucket): string {
  return `${CACHE_PREFIX}${gameId}:${bucket}`;
}

/** 缓存是否可用（防御旧版本或损坏数据）。 */
export function isUsableEntries(value: unknown): value is ParsedActivityEntry[] {
  return Array.isArray(value);
}

/** 缓存是否可用（筛选规则）。 */
export function isUsableCapabilities(value: unknown): value is CalendarCapabilities {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<CalendarCapabilities>;
  return typeof c.gameId === "string" && Array.isArray(c.selectors);
}

/** 缓存是否可用（游戏列表）。 */
export function isUsableGames(value: unknown): value is GameSummary[] {
  return Array.isArray(value);
}

// ───────────────────────────────── 网络 ─────────────────────────────────

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return { ok: false, status: response.status, data: null };
  return { ok: true, status: response.status, data: await response.json() };
}

/**
 * 带非对称 TTL 的读缓存。
 *
 * 与 `cache-store` 的 `readThroughCache` 的区别：
 * 1. **写入时按结果是否为空选择 TTL**。长 TTL 是本小部件的核心策略，
 *    而空结果的成因常常只是「版本更新前的空窗」，必须用短 TTL，
 *    否则会把待公布的内容一起吞掉。
 * 2. **主动刷新失败时保留旧数据**：用户点刷新但网络不通，不应把已展示的
 *    日程清空——继续用（可能已过期的）旧值并把错误交给调用方即可。
 */
const inflight = new Map<string, Promise<unknown>>();

async function readThroughBucket<T>(
  key: string,
  producer: () => Promise<T>,
  ttl: number,
  isEmpty: (value: T) => boolean,
  validate: (value: unknown) => boolean,
  force = false,
): Promise<T> {
  if (!force) {
    // 用 readFreshCache 而非 readCache：后者会删除过期条目，
    // 而那份过期数据正是下面「远端未返回」时要用到的兜底。
    const cached = readFreshCache<unknown>(key);
    if (cached !== null) {
      if (validate(cached)) return cached as T;
      // 结构不合法（旧版本/损坏）的缓存直接丢弃，避免反复命中坏数据
      removeCache(key);
    }
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = (async () => {
    let value: T;
    try {
      value = await producer();
    } catch (error) {
      // 远端未返回：有旧值就继续用旧值，避免界面被清空。
      // 404（该游戏无日程）与取消等语义由调用方处理，故仅在存在旧值时兜底。
      const stale = readStaleCache<unknown>(key);
      if (stale !== null && validate(stale)) return stale as T;
      throw error;
    }
    writeCache(key, value, isEmpty(value) ? EMPTY_RESULT_TTL_MS : ttl);
    return value;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/**
 * 取某个游戏某个桶的日程。
 *
 * @param force 用户主动刷新：忽略缓存与并发去重，立即联网；
 *   失败时仍回落到已有的（可能过期的）缓存。
 * @throws CalendarUnavailableError 当该游戏不支持日程（404）。
 */
async function fetchBucket(
  query: CalendarQuery,
  bucket: ActivityBucket,
  ttl: number,
  force: boolean,
): Promise<ParsedActivityEntry[]> {
  const key = bucketCacheKey(query.gameId, bucket);

  return readThroughBucket(
    key,
    async () => {
      const entries: ParsedActivityEntry[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const url = buildCalendarUrl({
          ...query,
          include: BUCKET_INCLUDES[bucket],
          limit: PAGE_LIMIT,
          offset,
        });
        const { ok, status, data } = await fetchJson(url);
        if (!ok) {
          if (status === 404) throw new CalendarUnavailableError(query.gameId);
          throw new Error(`HTTP ${status}`);
        }
        const batch = normalizeCalendarResponse(data);
        entries.push(...batch);
        const total = readTotal(data);
        offset += batch.length;
        // 没有下一页就停：批量为空或已取满 total
        if (batch.length === 0 || offset >= total) break;
      }
      return entries;
    },
    ttl,
    isEmpty,
    isUsableEntries,
    force,
  );
}

/** 结果是否为空数组。 */
function isEmpty(entries: ParsedActivityEntry[]): boolean {
  return entries.length === 0;
}

/**
 * 并发取三个桶的日程并合并。
 *
 * 三个桶各自独立缓存（TTL 不同），所以这里发三次请求；
 * 单次窗口内的数据量很小（实测一年窗口仅个位数到几十条）。
 * @throws CalendarUnavailableError 当该游戏不支持日程。
 */
export async function fetchActivityEntries(
  query: CalendarQuery,
  options: { force?: boolean } = {},
): Promise<ParsedActivityEntry[]> {
  const force = options.force ?? false;
  const [activity, banner, schedule] = await Promise.all([
    fetchBucket(query, "activity", ACTIVITY_TTL_MS, force),
    fetchBucket(query, "banner", BANNER_TTL_MS, force),
    fetchBucket(query, "schedule", SCHEDULE_TTL_MS, force),
  ]);
  // 同一活动理论上只属于一个 kind，这里仍按 id 去重以防御重复分页
  const seen = new Set<string>();
  const merged: ParsedActivityEntry[] = [];
  for (const entry of [...activity, ...banner, ...schedule]) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    merged.push(entry);
  }
  return merged;
}

/**
 * 取某游戏的日程筛选规则。
 *
 * 返回 null 表示该游戏不支持日程（404），调用方据此走"暂无日程"空态。
 * 这是运行时的唯一权威来源：不同游戏的父子结构不同，不能硬编码。
 */
export async function fetchCapabilities(
  gameId: string,
  options: { force?: boolean } = {},
): Promise<CalendarCapabilities | null> {
  const key = `${CACHE_PREFIX}capabilities:${gameId}`;

  function isEmptyCapabilities(value: CalendarCapabilities | null): boolean {
    return value === null;
  }

  function validate(value: unknown): boolean {
    return value === null || isUsableCapabilities(value);
  }

  return readThroughBucket(
    key,
    async () => {
      const url = `${AKASHA_BASE}${calendarCapabilitiesPath(gameId)}`;
      const { ok, status, data } = await fetchJson(url);
      if (!ok) {
        // 404 = 该游戏没有日程，属正常状态而非网络错误
        if (status === 404) return null;
        throw new Error(`HTTP ${status}`);
      }
      return parseCapabilities(data, gameId);
    },
    CAPABILITIES_TTL_MS,
    isEmptyCapabilities,
    validate,
    options.force === true,
  ) as Promise<CalendarCapabilities | null>;
}

/** 取游戏列表（用于展示游戏名与图标）。 */
export async function fetchGames(options: { force?: boolean } = {}): Promise<GameSummary[]> {
  const key = `${CACHE_PREFIX}games`;

  function isEmptyGames(value: GameSummary[]): boolean {
    return value.length === 0;
  }

  return readThroughBucket(
    key,
    async () => {
      const { ok, status, data } = await fetchJson(`${AKASHA_BASE}${GAMES_PATH}`);
      if (!ok) throw new Error(`HTTP ${status}`);
      return normalizeGamesResponse(data);
    },
    GAMES_TTL_MS,
    isEmptyGames,
    isUsableGames,
    options.force === true,
  );
}

/** 按 id 取游戏名，取不到时回落到内置中文名。 */
export function gameLabel(games: readonly GameSummary[], gameId: string): string {
  return games.find((game) => game.id === gameId)?.name ?? GAME_FALLBACK_NAMES[gameId] ?? gameId;
}
