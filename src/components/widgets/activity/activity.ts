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

import { readCache, removeCache, writeCache } from "@/lib/cache-store";

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
 * 选中「即将到期」的日程：按结束时间升序，未结束的排前面。
 *
 * 进行中的活动（已开始未结束）天然排在纯未来活动之前，因为它们更紧迫。
 */
export function selectExpiring(
  entries: ParsedActivityEntry[],
  now: number,
  limit: number,
): ParsedActivityEntry[] {
  return entries
    .filter((entry) => entry.endMs > now)
    .sort((a, b) => a.endMs - b.endMs)
    .slice(0, Math.max(0, limit));
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

// ───────────────────────────── 甘特图布局（纯计算） ─────────────────────────────

/** 一行甘特条的布局结果。 */
export interface GanttRow {
  entry: ParsedActivityEntry;
  /** 左边界百分比 0~100。 */
  leftPct: number;
  /** 宽度百分比 0~100；点标记为 0。 */
  widthPct: number;
  /** 事件过短（如 1 分钟的前瞻），只画起点标记而不画条。 */
  isPoint: boolean;
}

/**
 * 短于该阈值的事件按「点标记」处理。
 *
 * 前瞻特别节目实测为 1 分钟，按比例算宽度是 0，画成条必然不可见。
 */
export const POINT_THRESHOLD_MS = 60 * 60 * 1000;

/** 甘特条的最小宽度百分比，避免极短事件被压成 0 宽而消失。 */
export const MIN_BAR_WIDTH_PCT = 1.2;

export interface GanttLayoutOptions {
  /** 点标记阈值，缺省 1 小时。 */
  pointThresholdMs?: number;
  /** 最小条宽百分比，缺省 1.2。 */
  minWidthPct?: number;
}

/**
 * 计算甘特图每一行的位置。
 *
 * 只保留与窗口相交的事件（`end > windowStart && start < windowEnd`），
 * 两端各做 clamp，避免早于窗口开始或晚于结束的长条溢出画布。
 * 返回结果按开始时间升序。
 */
export function computeGanttRows(
  entries: ParsedActivityEntry[],
  windowStartMs: number,
  windowEndMs: number,
  options: GanttLayoutOptions = {},
): GanttRow[] {
  const span = windowEndMs - windowStartMs;
  if (!(span > 0)) return [];
  const pointThreshold = options.pointThresholdMs ?? POINT_THRESHOLD_MS;
  const minWidth = options.minWidthPct ?? MIN_BAR_WIDTH_PCT;

  const rows: GanttRow[] = [];
  for (const entry of entries) {
    if (entry.endMs <= windowStartMs || entry.startMs >= windowEndMs) continue;

    const clippedStart = Math.max(entry.startMs, windowStartMs);
    const clippedEnd = Math.min(entry.endMs, windowEndMs);
    const leftPct = ((clippedStart - windowStartMs) / span) * 100;

    // 点标记：事件本身很短（前瞻），或窗口内可见部分极短
    const isPoint = entry.endMs - entry.startMs <= pointThreshold;
    if (isPoint) {
      rows.push({ entry, leftPct, widthPct: 0, isPoint: true });
      continue;
    }

    let widthPct = ((clippedEnd - clippedStart) / span) * 100;
    if (widthPct < minWidth) widthPct = minWidth;
    // 右边界不得超出画布，否则条会溢出被裁掉
    if (leftPct + widthPct > 100) widthPct = Math.max(0, 100 - leftPct);

    rows.push({ entry, leftPct, widthPct, isPoint: false });
  }

  // rows 是本函数新建的数组，直接排序不会影响入参
  return rows.sort((a, b) => a.entry.startMs - b.entry.startMs);
}

/** 甘特图横轴的一天。 */
export interface GanttDayColumn {
  dayKey: string;
  /** 日期标签，如 `9/23`。 */
  label: string;
  /** 是否今天。 */
  isToday: boolean;
}

/** 生成横轴的天列（按 UTC+8）。 */
export function buildDayColumns(
  windowStartMs: number,
  days: number,
  now: number,
): GanttDayColumn[] {
  const todayKey = utc8DayKey(now);
  const columns: GanttDayColumn[] = [];
  const count = Math.max(0, Math.floor(days));
  for (let i = 0; i < count; i++) {
    const ms = windowStartMs + i * DAY_MS;
    const dayKey = utc8DayKey(ms);
    columns.push({ dayKey, label: utc8DateLabel(ms), isToday: dayKey === todayKey });
  }
  return columns;
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
  const merged: ParsedActivityEntry[] = [];
  let hit = false;
  for (const bucket of ["activity", "banner", "schedule"] as const) {
    const cached = readCache<unknown>(bucketCacheKey(query.gameId, bucket, query));
    if (isUsableEntries(cached)) {
      hit = true;
      merged.push(...cached);
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

/** 读取固定（pin）的活动 id 列表。 */
export function readPinnedIds(data?: Record<string, unknown>): string[] {
  const raw = data?.pinned;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
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
 * 按用户选择**在本地**过滤已缓存的日程。
 *
 * 关键设计：网络层按「桶」整取三类数据（各自长 TTL），筛选完全在前端做。
 * 这样切换筛选条件**不产生任何请求**，也不会破坏缓存复用；
 * 若把 include 塞进请求，每改一次勾选就要重拉一次，长 TTL 就失去意义了。
 *
 * 命中规则：
 * - 该 `kind` 的父级被选中 → 通过（等于"包含其全部子级"）；
 * - 或任一 label 命中了被选中的子级值 `kind:label` → 通过。
 */
export function applySelectionFilter(
  entries: ParsedActivityEntry[],
  selected: ReadonlySet<string>,
  options: { previewMode?: PreviewMode } = {},
): ParsedActivityEntry[] {
  if (selected.size === 0) return [];
  const filtered = entries.filter((entry) => {
    if (selected.has(entry.kind)) return true;
    return entry.labels.some((label) => selected.has(`${entry.kind}:${label}`));
  });
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
 * 缓存键。
 *
 * 刻意把 `from` 日期并入键：跨天后窗口滚动会自然产生新键，
 * 即使长 TTL 还没到期也会重新取数，避免"日期没滚动但数据已过期"。
 */
export function bucketCacheKey(
  gameId: string,
  bucket: ActivityBucket,
  query: CalendarQuery,
): string {
  return `${CACHE_PREFIX}${gameId}:${bucket}:${query.from}:${query.to}`;
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
 * 与 `cache-store` 的 `readThroughCache` 的唯一区别：**写入时按结果是否为空选择 TTL**。
 * 长 TTL 是本小部件的核心策略，而空结果的成因常常只是「版本更新前的空窗」，
 * 必须用短 TTL，否则会把待公布的内容一起吞掉。
 */
const inflight = new Map<string, Promise<unknown>>();

async function readThroughBucket<T>(
  key: string,
  producer: () => Promise<T>,
  ttl: number,
  isEmpty: (value: T) => boolean,
  validate: (value: unknown) => boolean,
): Promise<T> {
  const cached = readCache<unknown>(key);
  if (cached !== null && validate(cached)) return cached as T;
  if (cached !== null) removeCache(key);

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = (async () => {
    const value = await producer();
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
 * @throws CalendarUnavailableError 当该游戏不支持日程（404）。
 */
async function fetchBucket(
  query: CalendarQuery,
  bucket: ActivityBucket,
  ttl: number,
  force: boolean,
): Promise<ParsedActivityEntry[]> {
  const key = bucketCacheKey(query.gameId, bucket, query);
  if (force) removeCache(key);

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
  if (options.force) removeCache(key);

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
  ) as Promise<CalendarCapabilities | null>;
}

/** 取游戏列表（用于展示游戏名与图标）。 */
export async function fetchGames(options: { force?: boolean } = {}): Promise<GameSummary[]> {
  const key = `${CACHE_PREFIX}games`;
  if (options.force) removeCache(key);

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
  );
}

/** 按 id 取游戏名，取不到时回落到内置中文名。 */
export function gameLabel(games: readonly GameSummary[], gameId: string): string {
  return games.find((game) => game.id === gameId)?.name ?? GAME_FALLBACK_NAMES[gameId] ?? gameId;
}
