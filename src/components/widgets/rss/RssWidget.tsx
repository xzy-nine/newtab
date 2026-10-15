import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Rss } from "lucide-react";
import { getMessage } from "@/lib/i18n";
import { resolveWidgetSizeMode, widgetPadding } from "@/lib/widget-layout";
import {
  SUMMARY_TILE_COMPACT_LENGTH,
  SUMMARY_TILE_LENGTH,
  feedTimeLabel,
  fetchFeed,
  readCachedSnapshot,
  readFeedKind,
  readFeedUrl,
  tileEntryLimit,
  truncateText,
  type RssEntry,
  type RssSnapshot,
} from "@/components/widgets/rss/rss";

interface RssWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

/**
 * RSS 小部件（磁贴）。
 *
 * 两类订阅的**信息层级不同，因此布局也不同**：
 * - 状态类（内置的 DeepSeek 即此类）：只取最新 1 条，**正文是主体**——
 *   标题只说"发生了什么故障"，正文才说明"现在是否已解决"，
 *   因此正文占据表头之外的剩余空间并放大字号，标题退为次要的一行；
 * - 列表类：多条并列，每条「标题 + 正文摘要 + 时间」。
 *
 * 完整条目放在展开弹窗里（点非控件区域展开）。
 * 订阅地址存在 `data.url`，缺省为 `DEFAULT_FEED_URL`（DeepSeek 服务状态）。
 * 每次挂载都联网；联网失败时回落到上次成功的内容并标记"可能不新"。
 */
export function RssWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: RssWidgetProps) {
  void onDataChange; // 磁贴在弹窗里改订阅，这里只读展示
  const url = useMemo(() => readFeedUrl(data), [data]);
  /** 订阅类型：状态类只取最新 1 条，列表类多条。 */
  const kind = readFeedKind(data);

  const cached = useMemo(() => readCachedSnapshot(url), [url]);
  /** 拉取结果连同它所属的地址一起存，切换订阅时渲染期即可判定是否过期。 */
  const [fetched, setFetched] = useState<{ url: string; snapshot: RssSnapshot } | null>(null);
  const snapshot = fetched?.url === url ? fetched.snapshot : cached;

  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState("");
  /** 当前展示的是回落的旧内容而非本次联网结果。 */
  const [stale, setStale] = useState(false);
  /**
   * 当前时间作为 state（而非渲染期直接调用 Date.now()）。
   * 每 60 秒刷新一次，让「x 分钟前」这类相对时间自行走动。
   */
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { snapshot: next, fresh } = await fetchFeed(url);
      setFetched({ url, snapshot: next });
      // 回落到了旧内容：列表照常展示（比空磁贴有用），但要标记"可能不新"
      setStale(!fresh);
    } catch {
      setError(getMessage("rssLoadFailed", "订阅获取失败"));
    } finally {
      setLoading(false);
    }
  }, [url]);

  // 挂载与切换订阅时取数：每次都会联网（订阅是轻量纯文本，不做新鲜窗口）
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const refresh = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading) return;
      void load();
    },
    [load, loading],
  );

  const mode = resolveWidgetSizeMode({ width: containerWidth, height: containerHeight });
  const compact = mode === "compact";
  /** 外显条目数由订阅类型决定（状态类恒为 1，列表类按上限并随紧凑模式递减）。 */
  const entries = snapshot ? snapshot.entries.slice(0, tileEntryLimit(kind, compact)) : [];

  return (
    <div
      className={`rss-widget rss-widget-${kind} ${compact ? "is-compact" : ""}`}
      title={getMessage("widgetExpand", "展开详情")}
      style={{ padding: widgetPadding(mode) }}
    >
      <div className="rss-widget-top">
        <Rss className="rss-widget-source-icon" />
        <span className="rss-widget-source">{snapshot?.title || url}</span>
        {/*
          展示的是回落的旧内容：列表照常展示（总比空磁贴有用），
          但必须给出标记——否则用户会把一份过期的状态当成当前状态。
        */}
        {stale && (
          <span
            className="rss-widget-stale"
            title={getMessage("rssStaleContent", "刷新失败，内容可能不是最新")}
          >
            <AlertTriangle className="rss-widget-stale-icon" />
          </span>
        )}
        <button
          className="rss-widget-refresh"
          title={getMessage("rssRefresh", "刷新")}
          onClick={refresh}
        >
          <RefreshCw className={`rss-widget-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      {error && entries.length === 0 ? (
        <div className="rss-widget-state is-error">
          <AlertTriangle className="rss-widget-state-icon" />
          <span>{error}</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="rss-widget-state">
          {loading ? getMessage("rssLoading", "加载中...") : getMessage("rssEmpty", "暂无更新")}
        </div>
      ) : kind === "status" ? (
        <StatusTile entry={entries[0]!} now={now} />
      ) : (
        <ListTile entries={entries} compact={compact} now={now} />
      )}
    </div>
  );
}

/**
 * 状态类磁贴：正文为主体。
 *
 * 层级：状态徽标（是否已解决）> 正文（详情）> 标题（是什么故障）。
 * 正文**不截断**，而是占满剩余高度并在放不下时内部滚动——
 * 它才是这条订阅真正要传达的内容。
 */
function StatusTile({ entry, now }: { entry: RssEntry; now: number }) {
  const time = feedTimeLabel(entry.publishedAt, now);
  // 少数条目没有正文：此时标题就是唯一内容，直接作为主体展示
  const body = entry.summary || entry.title;

  return (
    <>
      <div className="rss-status-head">
        {/* 状态值原样展示，不做翻译——它是远端给出的机器值 */}
        {entry.status && <span className="rss-status">{entry.status}</span>}
        {time && <span className="rss-widget-item-time">{time}</span>}
      </div>
      {/*
        标题始终保留但退为次要的一行：它交代"是什么故障"，
        与正文（"现在怎么样了"）共同构成完整信息，紧凑模式下也不该丢。
        没有正文时标题本身就是主体，由下面的 body 承担。
      */}
      {entry.summary && (
        <p className="rss-status-title" title={entry.title}>
          {entry.title}
        </p>
      )}
      {/*
        `data-no-drag` 只关闭磁贴拖拽，点击仍冒泡到磁贴以展开弹窗；
        正文长时由它自己滚动，不把滚动链传给桌面。
      */}
      <div className="rss-status-body" data-no-drag>
        {body}
      </div>
    </>
  );
}

/** 列表类磁贴：多条并列，每条「标题 + 正文摘要 + 时间」。 */
function ListTile({
  entries,
  compact,
  now,
}: {
  entries: RssEntry[];
  compact: boolean;
  now: number;
}) {
  return (
    <div className="rss-widget-list" data-no-drag>
      {/*
        可滚动列表：`data-no-drag` 只关闭磁贴拖拽，点击仍冒泡到磁贴以展开弹窗。
        条目本身不是 <a>，避免被拖拽判定当成控件而丢掉展开点击。
      */}
      {entries.map((entry) => (
        <div key={entry.id} className="rss-widget-item">
          <div className="rss-widget-item-row">
            {entry.status && <span className="rss-status">{entry.status}</span>}
            <span className="rss-widget-item-title" title={entry.title}>
              {entry.title}
            </span>
            <span className="rss-widget-item-time">{feedTimeLabel(entry.publishedAt, now)}</span>
          </div>
          {entry.summary && (
            <p className="rss-widget-item-summary" title={entry.summary}>
              {truncateText(
                entry.summary,
                compact ? SUMMARY_TILE_COMPACT_LENGTH : SUMMARY_TILE_LENGTH,
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
