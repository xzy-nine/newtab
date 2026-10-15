/**
 * RSS 小部件的纯逻辑与数据访问。
 *
 * 解析一律交给 feedsmith（RSS 2.0 / Atom / RDF / JSON Feed 通用解析器），
 * 本模块只承担：订阅地址与类型、解析结果归一化、正文取纯文本、
 * 时间的相对展示，以及"每次联网 + 失败兜底"的取数。
 *
 * 除 `fetchFeed` 外全部是纯函数（不依赖 React 与浏览器存储），便于单元测试。
 */

import { format, formatDistanceToNow } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import type { AtomFeed, JsonFeed, RdfFeed, RssFeed } from "feedsmith";
import { readStaleCache, writeCache } from "@/lib/cache-store";
import { getCurrentLanguage, getMessage } from "@/lib/i18n";

/**
 * 默认订阅地址：DeepSeek 服务状态 RSS。
 * 小部件数据里没有订阅地址时使用它。
 */
export const DEFAULT_FEED_URL = "https://status.deepseek.com/feed.rss";

/** 单次请求超时（毫秒）。 */
const FEED_TIMEOUT_MS = 12 * 1000;

/** 单次最多归一化的条目数（解析与渲染的上限）。 */
export const MAX_ENTRIES = 50;

/**
 * 列表类磁贴内展示的条目数上限。
 *
 * 取 3 而不是更多：每条都带一段正文，磁贴高度固定，
 * 塞太多条会让每条都只剩标题可读，反而丢掉关键信息。
 * 状态类不看这个值——它只外显最新 1 条。
 */
const TILE_ENTRY_LIMIT = 3;

/** 弹窗内摘要的截断长度。 */
export const SUMMARY_MAX_LENGTH = 240;

/**
 * 磁贴内摘要的截断长度。
 *
 * 磁贴很窄，因此比弹窗短得多；但**必须给出这段正文**——
 * 状态页的标题只说明故障现象，正文才说明"现在是否已解决"。
 */
export const SUMMARY_TILE_LENGTH = 90;
/** 紧凑模式下的磁贴摘要长度。 */
export const SUMMARY_TILE_COMPACT_LENGTH = 50;

/** 缓存键前缀（与 cache-store 的命名空间拼接）。 */
const CACHE_PREFIX = "rss:";

/**
 * 订阅类型。
 *
 * - `status`：状态页（Statuspage / FlashDuty 之类），每条是一次事件进展，
 *   标题只说故障现象、正文才说明"是否已解决"，因此磁贴只外显**最新 1 条**
 *   并突出状态徽标；
 * - `list`：普通资讯/博客类订阅，按时间列出多条。
 */
export type RssFeedKind = "status" | "list";

/** 内置默认订阅的类型：DeepSeek 服务状态页。 */
export const DEFAULT_FEED_KIND: RssFeedKind = "status";

/** 读取小部件里的订阅类型；未设置时按默认（状态页）。 */
export function readFeedKind(data?: Record<string, unknown>): RssFeedKind {
  return data?.kind === "list" ? "list" : DEFAULT_FEED_KIND;
}

/**
 * 磁贴外显的条目数。
 *
 * - 状态类恒为 **1**：最新一条即当前状况，历史进展没有外显价值；
 * - 列表类按上限列出，紧凑模式再少一条（每条都带正文，宁可少而可读）。
 */
export function tileEntryLimit(kind: RssFeedKind, compact = false): number {
  if (kind === "status") return 1;
  return Math.max(1, TILE_ENTRY_LIMIT - (compact ? 1 : 0));
}

/** 归一化后的订阅条目。 */
export interface RssEntry {
  /** 稳定 id：优先源里的 guid/id，退化为链接，最后退化为下标。 */
  id: string;
  title: string;
  link: string;
  /** 正文纯文本（已去标签，且已摘掉开头的状态标记）。 */
  summary: string;
  /**
   * 正文开头的状态值（如 `resolved` / `identified`）。
   *
   * 状态页（Statuspage / FlashDuty）把"当前是否已解决"放在正文里，
   * 标题只说明故障现象，因此这个字段往往比标题更能回答"现在怎么样了"。
   * 源里没有该约定时为 undefined。
   */
  status?: string;
  /** 发布时间戳（毫秒）；源里没有或不可解析时为 null。 */
  publishedAt: number | null;
}

/** 归一化后的订阅快照。 */
export interface RssSnapshot {
  title: string;
  link: string;
  description: string;
  entries: RssEntry[];
  /** 抓取完成时刻（毫秒）。 */
  fetchedAt: number;
}

/** 取数失败的类别。 */
export type RssErrorKind = "invalid-url" | "http-error" | "empty-body" | "parse-error";

/** 携带类别信息的订阅异常。 */
export class RssError extends Error {
  constructor(
    readonly kind: RssErrorKind,
    readonly status = 0,
  ) {
    super(status > 0 ? `RSS_${kind}_${status}` : `RSS_${kind}`);
    this.name = "RssError";
  }
}

/**
 * 规范化订阅地址：只接受 http/https 绝对地址。
 * 非法输入返回 null。
 */
export function normalizeFeedUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

/** 读取小部件里的订阅地址；缺失或非法时回落到默认订阅。 */
export function readFeedUrl(data?: Record<string, unknown>): string {
  return normalizeFeedUrl(data?.url) ?? DEFAULT_FEED_URL;
}

/** 快照是否可用（防御旧版本或损坏的缓存）。 */
function isUsableSnapshot(value: unknown): value is RssSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RssSnapshot>;
  return typeof snapshot.title === "string" && Array.isArray(snapshot.entries);
}

/** 块级元素选择器：这些元素的后面是段落边界。 */
const BLOCK_SELECTOR = "p, div, li, tr, blockquote, section, h1, h2, h3, h4, h5, h6";

/**
 * 把 HTML 片段切成段落数组。
 *
 * 段落边界有两种：块级元素之间，以及同一块内的空行——后者是状态页的常见写法，
 * 同一个 `<p>` 里用空行分隔两段说明文字。
 *
 * 必须**保留段落结构**而不是压成一行：状态标记只在**首段**开头，
 * 摘除它需要知道首段的边界；压平后标记会与后文粘连，状态值随之被污染。
 */
export function htmlToParagraphs(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  let text = raw;
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      // `<br>` 只是折行，按单换行处理（下面会被归一化成空格）
      doc.body?.querySelectorAll("br").forEach((el) => {
        el.insertAdjacentText("afterend", "\n");
      });
      // 块级边界补空行，与块内空行走同一套切分规则
      doc.body?.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
        el.insertAdjacentText("afterend", "\n\n");
      });
      text = doc.body?.textContent ?? raw;
    } catch {
      text = raw;
    }
  }
  return text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** 把 HTML 片段取成单行纯文本；非字符串返回空串。 */
export function stripHtmlToText(value: unknown): string {
  return htmlToParagraphs(value).join(" ");
}

/** 按长度截断文本，超出时补省略号。 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

/**
 * 状态页正文开头的状态标记，如 `Status: resolved`。
 *
 * 只认**正文开头**（允许前置空白）：正文中段出现 "status:" 的往往是
 * 描述性文字而非状态字段，一并匹配会把普通内容误当成状态。
 */
const STATUS_PREFIX_RE = /^\s*status\s*[:：]\s*([^\s。.,，;；)）]+)/i;

/**
 * 从正文里摘出状态值，并返回去掉状态标记后的正文。
 *
 * 状态值**原样返回、不做翻译**：它是远端给出的机器值，
 * 替它另造一套文案既无必要也不可靠。
 *
 * 摘掉标记是因为它已由状态徽标单独表达，留在正文里会在弹窗中重复一遍。
 */
export function extractStatus(summary: string): { status?: string; summary: string } {
  const match = STATUS_PREFIX_RE.exec(summary);
  if (!match) return { summary };
  return {
    // 去掉尾随标点（`resolved.` / `resolved,`），保留远端原始大小写
    status: match[1]!.replace(/[.,;)]+$/, ""),
    summary: summary.slice(match[0].length).trim(),
  };
}

/** 把任意日期表示换算成毫秒时间戳；不可用时返回 null。 */
function toTimestamp(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/** feedsmith 的日期解析回调：无法解析时返回 null 而不是抛错。 */
function parseFeedDate(raw: string): number | null {
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

/** 取第一个非空字符串。 */
function firstText(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/** 从 Atom 的链接集合里取站点/条目链接：优先 rel="alternate" 或未声明 rel 的项。 */
function pickLink(links?: Array<{ href?: string; rel?: string }>): string {
  if (!links || links.length === 0) return "";
  const alternate = links.find((link) => !link.rel || link.rel === "alternate");
  return firstText(alternate?.href, links[0]?.href);
}

/**
 * 组装条目；标题缺失时用链接或正文兜底。
 *
 * 正文按段落取出并**摘掉开头的状态标记**：该标记已由状态徽标单独表达，
 * 留在正文里会重复一遍。
 */
function buildEntry(
  index: number,
  input: {
    id?: string;
    title?: string;
    link?: string;
    summary?: string;
    publishedAt: number | null;
  },
): RssEntry {
  const link = input.link?.trim() ?? "";
  const paragraphs = htmlToParagraphs(input.summary);
  const first = paragraphs[0];
  const extracted = first === undefined ? { summary: "" } : extractStatus(first);
  const rest = extracted.summary
    ? [extracted.summary, ...paragraphs.slice(1)]
    : paragraphs.slice(1);
  const summary = rest.join(" ");
  // 标题缺失时优先用去掉了状态标记的正文，避免标题变成 "Status: resolved"
  return {
    id: firstText(input.id, link, `${index}`),
    title: firstText(input.title, summary, link) || `${index + 1}`,
    link,
    summary,
    status: extracted.status,
    publishedAt: input.publishedAt,
  };
}

/** 归一化 RSS 2.0 解析结果。 */
function normalizeRss(feed: RssFeed.Feed<number | null>): RssSnapshot {
  const items = feed.items ?? [];
  return {
    title: firstText(feed.title, feed.link, DEFAULT_FEED_URL),
    link: firstText(feed.link),
    description: stripHtmlToText(feed.description),
    entries: items.slice(0, MAX_ENTRIES).map((item, index) =>
      buildEntry(index, {
        id: item.guid?.value,
        title: item.title,
        link: item.link,
        summary: item.description ?? item.content?.encoded ?? item.dc?.descriptions?.[0],
        publishedAt: toTimestamp(item.pubDate) ?? toTimestamp(item.dc?.dates?.[0]),
      }),
    ),
    fetchedAt: Date.now(),
  };
}

/** 归一化 Atom 解析结果。 */
function normalizeAtom(feed: AtomFeed.Feed<number | null>): RssSnapshot {
  const entries = feed.entries ?? [];
  return {
    title: firstText(feed.title?.value, pickLink(feed.links), DEFAULT_FEED_URL),
    link: pickLink(feed.links),
    description: stripHtmlToText(feed.subtitle?.value),
    entries: entries.slice(0, MAX_ENTRIES).map((entry, index) =>
      buildEntry(index, {
        id: entry.id,
        title: entry.title?.value,
        link: pickLink(entry.links),
        summary: entry.summary?.value ?? entry.content?.value,
        publishedAt: toTimestamp(entry.published) ?? toTimestamp(entry.updated),
      }),
    ),
    fetchedAt: Date.now(),
  };
}

/** 归一化 RDF（RSS 1.0）解析结果。 */
function normalizeRdf(feed: RdfFeed.Feed<number | null>): RssSnapshot {
  const items = feed.items ?? [];
  return {
    title: firstText(feed.title, feed.link, DEFAULT_FEED_URL),
    link: firstText(feed.link),
    description: stripHtmlToText(feed.description),
    entries: items.slice(0, MAX_ENTRIES).map((item, index) =>
      buildEntry(index, {
        id: item.rdf?.about,
        title: item.title,
        link: item.link,
        summary: item.description ?? item.dc?.descriptions?.[0] ?? item.content?.encoded,
        publishedAt: toTimestamp(item.dc?.dates?.[0]),
      }),
    ),
    fetchedAt: Date.now(),
  };
}

/** 归一化 JSON Feed 解析结果。 */
function normalizeJson(feed: JsonFeed.Feed<number | null>): RssSnapshot {
  const items = feed.items ?? [];
  return {
    title: firstText(feed.title, feed.home_page_url, DEFAULT_FEED_URL),
    link: firstText(feed.home_page_url, feed.feed_url),
    description: stripHtmlToText(feed.description),
    entries: items.slice(0, MAX_ENTRIES).map((item, index) =>
      buildEntry(index, {
        id: item.id,
        title: item.title,
        link: item.url ?? item.external_url,
        summary: item.content_text ?? item.content_html ?? item.summary,
        publishedAt: toTimestamp(item.date_published) ?? toTimestamp(item.date_modified),
      }),
    ),
    fetchedAt: Date.now(),
  };
}

/**
 * 解析订阅内容，返回归一化快照。
 *
 * feedsmith 以动态导入加载：订阅解析只在真正取数时发生，
 * 不进入新标签页首屏依赖。
 *
 * @throws 内容不符合任何订阅格式时抛 `RssError("parse-error")`。
 */
export async function parseFeedDocument(content: string): Promise<RssSnapshot> {
  const { parseFeed } = await import("feedsmith");
  try {
    const parsed = parseFeed<number | null>(content, {
      maxItems: MAX_ENTRIES,
      parseDateFn: parseFeedDate,
    });
    switch (parsed.format) {
      case "rss":
        return normalizeRss(parsed.feed);
      case "atom":
        return normalizeAtom(parsed.feed);
      case "rdf":
        return normalizeRdf(parsed.feed);
      case "json":
        return normalizeJson(parsed.feed);
      default:
        throw new RssError("parse-error");
    }
  } catch (error) {
    if (error instanceof RssError) throw error;
    throw new RssError("parse-error");
  }
}

/** 请求订阅内容。 */
async function requestFeed(url: string): Promise<string> {
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    headers: {
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.8, */*;q=0.5",
    },
  });
  if (!response.ok) throw new RssError("http-error", response.status);
  const content = await response.text();
  if (!content.trim()) throw new RssError("empty-body");
  return content;
}

/** 取数结果。 */
export interface RssFetchResult {
  snapshot: RssSnapshot;
  /** 是否为本次联网取得；false 表示联网失败、回落到了上次成功的内容。 */
  fresh: boolean;
}

/** 缓存键（按订阅地址区分）。 */
function rssCacheKey(target: string): string {
  return `${CACHE_PREFIX}${target}`;
}

/**
 * 进行中的请求。仅用于避免同一地址的并发重复取数，
 * 不承担"新鲜度"语义。
 */
const inflight = new Map<string, Promise<RssFetchResult>>();

/**
 * 取订阅数据。
 *
 * **每次都联网**：订阅是轻量纯文本，不设新鲜窗口，避免把上一轮内容
 * 当成当前内容展示（状态页尤其忌讳看到过期的"当前状态"）。
 *
 * 缓存唯一的用途是**远程故障时兜底**：联网失败则返回上次成功的内容并标记
 * `fresh: false`，让界面能提示"可能不新"，而不是空磁贴。
 *
 * 刻意不复用 `readThroughCache`：它在失败时静默返回旧值，调用方无从区分
 * "刚拿到的"与"回落到的"，也就无法给出过期提示。
 *
 * @throws 地址非法，或取数失败且从未成功过时抛出。
 */
export function fetchFeed(url: string): Promise<RssFetchResult> {
  const target = normalizeFeedUrl(url);
  if (!target) return Promise.reject(new RssError("invalid-url"));
  const key = rssCacheKey(target);

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<RssFetchResult> => {
    try {
      const snapshot = await parseFeedDocument(await requestFeed(target));
      writeCache(key, snapshot);
      return { snapshot, fresh: true };
    } catch (error) {
      // 兜底不设年龄上限：过期的状态页内容仍比空磁贴有用
      const fallback = readStaleSnapshot(key);
      if (fallback) return { snapshot: fallback, fresh: false };
      throw error;
    }
  })();

  inflight.set(key, task);
  return task.finally(() => {
    inflight.delete(key);
  });
}

/** 读取已落盘的上次成功快照（不发请求）。 */
function readStaleSnapshot(key: string): RssSnapshot | null {
  const stale = readStaleCache<unknown>(key);
  return isUsableSnapshot(stale) ? stale : null;
}

/**
 * 读取**上次成功**的快照（不发请求）。
 *
 * 供磁贴首屏先渲染已有内容，随即被联网结果替换。
 */
export function readCachedSnapshot(url: string): RssSnapshot | null {
  const target = normalizeFeedUrl(url);
  return target ? readStaleSnapshot(rssCacheKey(target)) : null;
}

/** date-fns 的展示语言：中文用 zhCN，其余用 enUS。 */
function dateLocale() {
  return getCurrentLanguage() === "en" ? enUS : zhCN;
}

/**
 * 条目时间的展示文案：
 * 1 分钟内「刚刚」，30 天内相对时间（date-fns 本地化），更早显示具体日期。
 */
export function feedTimeLabel(publishedAt: number | null, now = Date.now()): string {
  if (publishedAt === null) return "";
  const diff = now - publishedAt;
  if (diff < 60 * 1000) return getMessage("timeJustNow", "刚刚");
  if (diff < 30 * 24 * 60 * 60 * 1000) {
    return formatDistanceToNow(new Date(publishedAt), { addSuffix: true, locale: dateLocale() });
  }
  return format(new Date(publishedAt), "yyyy-MM-dd");
}
