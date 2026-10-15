/**
 * RSS 小部件的纯逻辑与数据访问。
 *
 * 解析一律交给 feedsmith（RSS 2.0 / Atom / RDF / JSON Feed 通用解析器），
 * 本模块只承担：订阅地址规范化、解析结果归一化、正文取纯文本、
 * 时间的相对展示，以及带 TTL 缓存的取数。
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

/** 磁贴内展示的条目数上限。 */
export const TILE_ENTRY_LIMIT = 5;

/** 弹窗内摘要的截断长度。 */
export const SUMMARY_MAX_LENGTH = 240;

/** 缓存键前缀（与 cache-store 的命名空间拼接）。 */
const CACHE_PREFIX = "rss:";

/** 归一化后的订阅条目。 */
interface RssEntry {
  /** 稳定 id：优先源里的 guid/id，退化为链接，最后退化为下标。 */
  id: string;
  title: string;
  link: string;
  /** 正文纯文本（已去标签）。 */
  summary: string;
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

/** 订阅缓存键（按地址区分）。 */
function rssCacheKey(url: string): string {
  return `${CACHE_PREFIX}${url}`;
}

/** 快照是否可用（防御旧版本或损坏的缓存）。 */
function isUsableSnapshot(value: unknown): value is RssSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RssSnapshot>;
  return typeof snapshot.title === "string" && Array.isArray(snapshot.entries);
}

/** 把 HTML 片段取成单行纯文本；非字符串返回空串。 */
export function stripHtmlToText(value: unknown): string {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  if (!raw) return "";
  let text = raw;
  if (typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      text = doc.body?.textContent ?? raw;
    } catch {
      text = raw;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/** 按长度截断文本，超出时补省略号。 */
export function truncateText(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
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

/** 组装条目；标题缺失时用链接或正文兜底。 */
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
  const summary = stripHtmlToText(input.summary);
  const title = firstText(input.title, summary, link) || `${index + 1}`;
  return {
    id: firstText(input.id, link, `${index}`),
    title,
    link,
    summary,
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

/**
 * 进行中的请求（按地址）。仅用于避免同一地址的并发重复取数，
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

  const existing = inflight.get(target);
  if (existing) return existing;

  const task = (async (): Promise<RssFetchResult> => {
    try {
      const snapshot = await parseFeedDocument(await requestFeed(target));
      writeCache(rssCacheKey(target), snapshot);
      return { snapshot, fresh: true };
    } catch (error) {
      // 兜底不设年龄上限：过期的状态页内容仍比空磁贴有用
      const fallback = readStaleSnapshot(target);
      if (fallback) return { snapshot: fallback, fresh: false };
      throw error;
    }
  })();

  inflight.set(target, task);
  return task.finally(() => {
    inflight.delete(target);
  });
}

/** 读取已落盘的上次成功快照（不发请求）。 */
function readStaleSnapshot(target: string): RssSnapshot | null {
  const stale = readStaleCache<unknown>(rssCacheKey(target));
  return isUsableSnapshot(stale) ? stale : null;
}

/**
 * 读取**上次成功**的快照（不发请求）。
 *
 * 供磁贴首屏先渲染已有内容，随即被联网结果替换。
 */
export function readCachedSnapshot(url: string): RssSnapshot | null {
  const target = normalizeFeedUrl(url);
  return target ? readStaleSnapshot(target) : null;
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
