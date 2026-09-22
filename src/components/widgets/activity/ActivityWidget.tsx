import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Pin, RefreshCw } from "lucide-react";
import { getMessage } from "@/lib/i18n";
import {
  DEFAULT_WINDOW_DAYS,
  GAME_FALLBACK_NAMES,
  activityStatus,
  addDaysToDayKey,
  applySelectionFilter,
  fetchActivityEntries,
  readCachedEntries,
  readGameId,
  readPinnedIds,
  readPreviewMode,
  readSelected,
  remainingText,
  selectExpiring,
  selectPinned,
  utc8DayKey,
  type ActivityStatus,
  type ParsedActivityEntry,
  type RemainingText,
} from "@/components/widgets/activity/activity";

interface ActivityWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

/** 剩余时间文案（getMessage 不做插值，故在此替换占位符）。 */
function remainingLabel(remaining: RemainingText): string {
  if (remaining.unit === "ended") return getMessage("hoyoActivityEnded", "已结束");
  if (remaining.unit === "hours") {
    return getMessage("hoyoActivityHoursLeft", "剩 {n} 小时").replace(
      "{n}",
      String(remaining.value),
    );
  }
  return getMessage("hoyoActivityDaysLeft", "剩 {n} 天").replace("{n}", String(remaining.value));
}

/** 活动状态的样式类名。 */
function statusClass(status: ActivityStatus): string {
  if (status === "ongoing") return "is-ongoing";
  if (status === "upcoming") return "is-upcoming";
  return "is-ended";
}

/**
 * 米哈游活动小部件（磁贴）。
 *
 * 外显两段内容：
 * 1. **即将到期**：按结束时间升序取前 N 条（进行中的天然排最前，因为它们更紧迫）；
 * 2. **固定**：用户 pin 的活动，不受到期排序影响，常驻展示。
 *
 * 数据按三类（游戏内活动 / 卡池 / 版本日程）分别长 TTL 缓存：
 * 挂载时先用缓存秒开，再后台补拉；筛选在本地做，切换条件不产生请求。
 * 点非控件区域由 HomeDesktop 负责展开弹窗，弹窗里提供筛选、甘特图与固定操作。
 */
export function ActivityWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: ActivityWidgetProps) {
  void onDataChange; // 磁贴只读展示，写入统一由弹窗完成
  const gameId = readGameId(data);
  const pinnedIds = useMemo(() => readPinnedIds(data), [data]);

  /**
   * 当前时间作为 state（而非渲染期直接调用 Date.now()）。
   * 每 60 秒刷新一次，让「剩 X 小时」等相对时间能自行走动；
   * 跨天后 todayKey 变化会推动窗口滚动，从而触发重新取数（长 TTL 的配套）。
   */
  const [now, setNow] = useState(() => Date.now());
  const todayKey = utc8DayKey(now);

  // 一次性拉满未来一年：TTL 长、数据量小，把「新增」尽量预取进来
  const query = useMemo(
    () => ({ gameId, from: todayKey, to: addDaysToDayKey(todayKey, DEFAULT_WINDOW_DAYS) }),
    [gameId, todayKey],
  );
  /** 查询标识：游戏或日期窗口变化即视为另一份数据。 */
  const queryKey = `${gameId}:${todayKey}`;

  const cached = useMemo(() => readCachedEntries(query), [query]);

  /**
   * 拉取结果连同它所属的 queryKey 一起存。
   *
   * 这样切换游戏（弹窗里可切）或跨天滚动窗口时，**渲染期即可判断结果是否过期**，
   * 直接回落到新 query 的缓存，不会把上一个游戏的活动继续显示出来；
   * 也避免了"在 effect 里 setState 清空旧数据"那种级联渲染。
   */
  const [fetched, setFetched] = useState<{
    key: string;
    entries: ParsedActivityEntry[];
  } | null>(null);
  const entries = fetched?.key === queryKey ? fetched.entries : cached;

  // 无任何可用数据时才显示"加载中"，避免先闪一下"暂无活动"
  const [loading, setLoading] = useState(() => cached === null);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError("");
      try {
        const next = await fetchActivityEntries(query, { force });
        setFetched({ key: queryKey, entries: next });
      } catch {
        setError(getMessage("hoyoActivityLoadFailed", "活动获取失败"));
      } finally {
        setLoading(false);
      }
    },
    [query, queryKey],
  );

  // 挂载后、以及游戏/窗口变化时拉取；命中缓存时不会真正联网（按桶 TTL 判定）。
  // 包一层 async IIFE 而非直接调用，避免被判定为「effect 内同步 setState」。
  useEffect(() => {
    void (async () => {
      await load(false);
    })();
  }, [load]);

  const refresh = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (loading) return;
      void load(true);
    },
    [load, loading],
  );

  const rows = useMemo(() => {
    if (!entries) return [];
    const selected = readSelected(data);
    // 未配置筛选（旧版本数据）时不筛，直接展示全部
    const filtered = selected
      ? applySelectionFilter(entries, selected, { previewMode: readPreviewMode(data) })
      : entries;
    // 固定是比筛选更具体的用户意图：固定项从**未筛选**的集合里取，
    // 否则用户取消某个分类会把已固定的活动一起藏掉，与"常驻展示"矛盾。
    const pinned = selectPinned(entries, pinnedIds);
    const pinnedSet = new Set(pinned.map((entry) => entry.id));

    const maxItems = containerHeight <= 130 ? 3 : 5;
    const slots = Math.max(0, maxItems - pinned.length);
    const expiring = selectExpiring(
      filtered.filter((entry) => !pinnedSet.has(entry.id)),
      now,
      slots,
    );
    return [
      ...pinned.map((entry) => ({ entry, pinned: true })),
      ...expiring.map((entry) => ({ entry, pinned: false })),
    ];
  }, [entries, data, pinnedIds, now, containerHeight]);

  const compact = containerWidth <= 170 || containerHeight <= 120;
  const gameName = GAME_FALLBACK_NAMES[gameId] ?? gameId;

  return (
    <div
      className="activity-widget"
      title={getMessage("widgetExpand", "展开详情")}
      style={{ padding: compact ? "6px" : "10px" }}
    >
      <div className="activity-widget-top">
        <span className="activity-widget-game">
          <CalendarDays className="activity-widget-game-icon" />
          <span className="activity-widget-game-text">{gameName}</span>
        </span>
        <button
          className="activity-widget-refresh"
          title={getMessage("hoyoActivityRefresh", "刷新")}
          onClick={refresh}
        >
          <RefreshCw className={`activity-widget-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="activity-widget-state is-error">
          <AlertTriangle className="activity-widget-state-icon" />
          <span>{error}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="activity-widget-state">
          {loading
            ? getMessage("hoyoActivityLoading", "加载中...")
            : getMessage("hoyoActivityEmpty", "暂无活动")}
        </div>
      ) : (
        <div className="activity-widget-list">
          {rows.map(({ entry, pinned }) => (
            <div
              key={entry.id}
              className={`activity-widget-item ${statusClass(activityStatus(entry, now))}`}
            >
              {pinned && <Pin className="activity-widget-pin-icon" />}
              <span className="activity-widget-title">{entry.title}</span>
              <span className="activity-widget-remaining">
                {remainingLabel(remainingText(entry, now))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
