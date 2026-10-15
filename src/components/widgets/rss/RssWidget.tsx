import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Rss } from "lucide-react";
import { getMessage } from "@/lib/i18n";
import { resolveWidgetSizeMode, widgetPadding } from "@/lib/widget-layout";
import {
  TILE_ENTRY_LIMIT,
  feedTimeLabel,
  fetchFeed,
  readCachedSnapshot,
  readFeedUrl,
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
 * 磁贴是一份只读摘要：只展示最近 `TILE_ENTRY_LIMIT` 条条目的标题与时间，
 * 完整正文与全部条目放在展开弹窗里（点非控件区域展开）。
 *
 * 订阅地址存在 `data.url`，缺省为 `DEFAULT_FEED_URL`（DeepSeek 服务状态）。
 * 取数结果按地址缓存 15 分钟；挂载时先用缓存秒开，再后台按 TTL 补拉。
 */
export function RssWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: RssWidgetProps) {
  void onDataChange; // 磁贴在弹窗里改订阅，这里只读展示
  const url = useMemo(() => readFeedUrl(data), [data]);

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
  const entries = snapshot ? snapshot.entries.slice(0, compact ? 3 : TILE_ENTRY_LIMIT) : [];

  return (
    <div
      className="rss-widget"
      title={getMessage("widgetExpand", "展开详情")}
      style={{ padding: widgetPadding(mode) }}
    >
      <div className="rss-widget-top">
        <Rss className="rss-widget-source-icon" />
        <span className="rss-widget-source">{snapshot?.title || url}</span>
        {/*
          展示的是回落的旧内容：列表照常展示（总比空磁贴有用），
          但必须给出标记——否则用户会把一份过期的状态列表当成当前状态。
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
      ) : (
        <div className="rss-widget-list" data-no-drag>
          {/*
            可滚动列表：`data-no-drag` 只关闭磁贴拖拽，点击仍冒泡到磁贴以展开弹窗。
            条目本身不是 <a>，避免被拖拽判定当成控件而丢掉展开点击。
          */}
          {entries.map((entry) => (
            <div key={entry.id} className="rss-widget-item" title={entry.title}>
              <span className="rss-widget-item-title">{entry.title}</span>
              <span className="rss-widget-item-time">{feedTimeLabel(entry.publishedAt, now)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
