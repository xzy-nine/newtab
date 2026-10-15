import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { getMessage } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { openUrl } from "@/lib/open-url";
import {
  DEFAULT_FEED_URL,
  SUMMARY_MAX_LENGTH,
  feedTimeLabel,
  fetchFeed,
  normalizeFeedUrl,
  readCachedSnapshot,
  readFeedUrl,
  truncateText,
  type RssSnapshot,
} from "@/components/widgets/rss/rss";

interface RssFeedPopupProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
}

/**
 * RSS 小部件的展开内容：订阅地址设置 + 完整条目列表。
 *
 * 该组件只在弹窗打开时挂载，因此展开才取数；结果与磁贴共享同一份兜底快照。
 * 条目点击交给 `openUrl`（侧边栏内留在侧边栏，新标签页中新开标签）。
 */
export function RssFeedPopup({ data, onDataChange }: RssFeedPopupProps) {
  const storedUrl = useMemo(() => readFeedUrl(data), [data]);
  /**
   * 弹窗内改地址时先用本地状态接管，而不是等父级把新地址回灌回来。
   *
   * 覆盖值记录"它是在哪个 props 值之上做出的选择"（`from`）：
   * props 仍是 `from` → 父级还没跟上，用本地值 `to`；props 已变成别的值 →
   * 父级已接手，丢弃本地值。这样在渲染期即可判定，无需在 effect 里 setState。
   */
  const [override, setOverride] = useState<{ from: string; to: string } | null>(null);
  const url = override && override.from === storedUrl ? override.to : storedUrl;
  /** 输入框草稿：只由用户编辑与提交改写，避免外部回灌覆盖正在输入的内容。 */
  const [draft, setDraft] = useState(storedUrl);
  /** 拉取结果连同它所属的地址一起存，切换订阅时渲染期即可判定是否过期。 */
  const [fetched, setFetched] = useState<{ url: string; snapshot: RssSnapshot } | null>(null);
  const cached = useMemo(() => readCachedSnapshot(url), [url]);
  const snapshot = fetched?.url === url ? fetched.snapshot : cached;
  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  /** 当前展示的是回落的旧内容而非本次联网结果。 */
  const [stale, setStale] = useState(false);
  /** 每次请求的序号：丢弃迟到的旧响应，避免覆盖新订阅的数据。 */
  const requestRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async (target: string) => {
    const token = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const { snapshot: next, fresh } = await fetchFeed(target);
      if (requestRef.current !== token) return;
      setFetched({ url: target, snapshot: next });
      // 回落到了旧内容：列表中常展示，但标记"可能不新"
      setStale(!fresh);
    } catch {
      if (requestRef.current === token) setError(getMessage("rssLoadFailed", "订阅获取失败"));
    } finally {
      if (requestRef.current === token) setLoading(false);
    }
  }, []);

  // 挂载与切换订阅时取数：每次都会联网
  useEffect(() => {
    void (async () => {
      await load(url);
    })();
  }, [url, load]);

  /** 提交订阅地址：非法输入回落到默认订阅；同一地址则视为"再刷新一次"。 */
  const applyUrl = useCallback(() => {
    const normalized = normalizeFeedUrl(draft) ?? DEFAULT_FEED_URL;
    setDraft(normalized);
    if (normalized === url) {
      void load(normalized);
      return;
    }
    setOverride({ from: storedUrl, to: normalized });
    onDataChange?.({ url: normalized, updatedAt: Date.now() });
  }, [draft, url, storedUrl, load, onDataChange]);

  const resetUrl = useCallback(() => {
    setDraft(DEFAULT_FEED_URL);
    if (DEFAULT_FEED_URL === url) {
      void load(DEFAULT_FEED_URL);
      return;
    }
    setOverride({ from: storedUrl, to: DEFAULT_FEED_URL });
    onDataChange?.({ url: DEFAULT_FEED_URL, updatedAt: Date.now() });
  }, [url, storedUrl, load, onDataChange]);

  const entries = snapshot?.entries ?? [];

  return (
    <div className="rss-feed">
      <div className="rss-feed-bar">
        <Input
          className="rss-feed-url"
          value={draft}
          placeholder={getMessage("rssUrlPlaceholder", "订阅地址（RSS/Atom/JSON Feed）")}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyUrl();
            if (e.key === "Escape") setDraft(url);
          }}
        />
        <Button size="sm" variant="outline" onClick={applyUrl} disabled={loading}>
          {getMessage("rssApplyUrl", "订阅")}
        </Button>
        <Button size="sm" variant="ghost" onClick={resetUrl} disabled={loading}>
          {getMessage("rssResetUrl", "默认")}
        </Button>
        <button
          className="rss-feed-refresh"
          title={getMessage("rssRefresh", "刷新")}
          onClick={() => void load(url)}
          disabled={loading}
        >
          <RefreshCw className={`rss-feed-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      <div className="rss-feed-head">
        <span className="rss-feed-title">{snapshot?.title || url}</span>
        {/*
          回落到旧内容时给出标记。列表照常展示（比空列表有用），
          但用户必须知道它不是本次刷新的结果。
        */}
        {stale && (
          <span className="rss-feed-stale" title={error}>
            <AlertTriangle className="rss-feed-stale-icon" />
            {getMessage("rssStaleContent", "刷新失败，内容可能不是最新")}
          </span>
        )}
        {entries.length > 0 && (
          <span className="rss-feed-count">
            {getMessage("rssEntryCount", "共 {n} 条").replace("{n}", String(entries.length))}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        error ? (
          <div className="rss-feed-state is-error">
            <AlertTriangle className="rss-feed-state-icon" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="rss-feed-state">
            {loading ? (
              <>
                <Loader2 className="rss-feed-state-icon is-spinning" />
                <span>{getMessage("rssLoading", "加载中...")}</span>
              </>
            ) : (
              <span>{getMessage("rssEmpty", "暂无更新")}</span>
            )}
          </div>
        )
      ) : (
        <div className="rss-feed-list">
          {entries.map((entry) => (
            <div key={entry.id} className="rss-feed-item">
              <div className="rss-feed-item-head">
                {entry.link ? (
                  <button
                    className="rss-feed-item-title"
                    title={entry.link}
                    onClick={() => openUrl(entry.link)}
                  >
                    {entry.title}
                  </button>
                ) : (
                  <span className="rss-feed-item-title">{entry.title}</span>
                )}
                {entry.publishedAt !== null && (
                  <span className="rss-feed-item-time">
                    {feedTimeLabel(entry.publishedAt, now)}
                  </span>
                )}
              </div>
              {entry.summary && (
                <p className="rss-feed-item-summary">
                  {truncateText(entry.summary, SUMMARY_MAX_LENGTH)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
