import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Pin, RefreshCw } from "lucide-react";
import { getMessage } from "@/lib/i18n";
import { resolveWidgetSizeMode, widgetListCapacity, widgetPadding } from "@/lib/widget-layout";
import {
  CALENDAR_GAME_IDS,
  DEFAULT_WINDOW_DAYS,
  GAME_FALLBACK_NAMES,
  GAME_SHORT_NAMES,
  addDaysToDayKey,
  buildTileRows,
  fetchEntriesForGames,
  isPreviewEntry,
  matchesSelection,
  readCachedEntriesForGames,
  readDisplayGames,
  readPinnedMap,
  readPreviewMode,
  readSelected,
  readStaleEntriesForGames,
  remainingText,
  requiredGameIds,
  resolveDisplayGameIds,
  utc8DayKey,
  type ActivityTileRow,
  type GameEntries,
  type PinnedMap,
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

/**
 * 米哈游活动小部件（磁贴）。
 *
 * **外显范围是一份固定列表**（`displayGames`），与弹窗里"当前查看的游戏"无关：
 * 弹窗切游戏只改变弹窗内容，磁贴始终聚合展示允许外显的那几个游戏。
 *
 * 磁贴内容分两段：
 * 1. **即将截止**：从允许外显的游戏里按结束时间取前 N 条，
 *    距结束 ≤ 3 天的标红（`is-urgent`）；
 * 2. **固定**：用户 pin 的活动常驻展示，**不受到期排序影响，也不受勾选影响**——
 *    即使它所属的游戏被取消勾选，固定项依然显示。
 *
 * 一个游戏都不勾选时，只剩固定项（若没有固定项则是空态），即"允许不显示"。
 *
 * 数据仍按游戏 + 三类桶分别长 TTL 缓存：挂载时先用缓存秒开，再后台补拉；
 * 多个游戏并发取数且**互不影响**（单个游戏 404/失败不会打空整块磁贴）。
 * 点非控件区域由 HomeDesktop 负责展开弹窗。
 */
export function ActivityWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: ActivityWidgetProps) {
  void onDataChange; // 磁贴只读展示，写入统一由弹窗完成
  const pinned = useMemo<PinnedMap>(() => readPinnedMap(data), [data]);
  const displayGames = useMemo(() => readDisplayGames(data), [data]);

  // 磁贴外显的游戏集合：在候选集内求交，过滤掉已下线/无效的 id
  const displayGameIds = useMemo(
    () => resolveDisplayGameIds(displayGames, CALENDAR_GAME_IDS),
    [displayGames],
  );
  /**
   * 当前时间作为 state（而非渲染期直接调用 Date.now()）。
   * 每 60 秒刷新一次，让「剩 X 小时」等相对时间能自行走动；
   * 跨天后 todayKey 变化会推动窗口滚动，从而触发重新取数（长 TTL 的配套）。
   */
  const [now, setNow] = useState(() => Date.now());
  const todayKey = utc8DayKey(now);
  const to = useMemo(() => addDaysToDayKey(todayKey, DEFAULT_WINDOW_DAYS), [todayKey]);

  // 未外显但有固定项的游戏也要取数，否则那些固定项会凭空消失
  const queryGameIds = useMemo(
    () => requiredGameIds(displayGameIds, pinned),
    [displayGameIds, pinned],
  );
  /** 查询标识：参与取数的游戏集合或日期窗口变化即视为另一份数据。 */
  const queryKey = `${queryGameIds.join(",")}:${todayKey}`;

  /**
   * 首屏缓存：优先新鲜缓存，其次（可能已过期的）旧缓存。
   *
   * 过期只代表可能少了新增内容，直接清空会闪"暂无活动"；
   * 保持旧数据再后台刷新体验更好。
   */
  const cached = useMemo(
    () =>
      readCachedEntriesForGames(queryGameIds, todayKey, to) ??
      readStaleEntriesForGames(queryGameIds, todayKey, to),
    [queryGameIds, todayKey, to],
  );

  /**
   * 拉取结果连同它所属的 queryKey 一起存。
   *
   * 这样游戏集合变化（弹窗里改勾选）或跨天滚动窗口时，**渲染期即可判断结果是否过期**，
   * 直接回落到新 query 的缓存，不会把上一批游戏的陈旧数据继续显示出来；
   * 也避免了"在 effect 里 setState 清空旧数据"那种级联渲染。
   */
  const [fetched, setFetched] = useState<{ key: string; groups: GameEntries[] } | null>(null);
  const groups = fetched?.key === queryKey ? fetched.groups : cached;

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
        const { groups: next, failures } = await fetchEntriesForGames(queryGameIds, todayKey, to, {
          force,
        });
        // 远端一个游戏都没给数据时保持当前已展示的内容，不要用空数组覆盖
        if (next.length > 0 || cached === null) {
          setFetched({ key: queryKey, groups: next });
        }
        /**
         * 只要有游戏是"查不到日程"（404）而非"没开放"，就算一次失败。
         *
         * 这里刻意不看 `next.length`：全部游戏都网络失败、但本地还有旧缓存时，
         * 旧数据仍会照常展示，此时必须给出错误提示，否则用户看到的是
         * 一份静静过期的列表却毫无提示。
         */
        const failed = failures.filter((item) => !item.unavailable);
        if (failed.length > 0) {
          setError(getMessage("hoyoActivityLoadFailed", "活动获取失败"));
        }
      } catch {
        // 兜底：fetchEntriesForGames 已用 allSettled 消化异常，这里不会触发
        setError(getMessage("hoyoActivityLoadFailed", "活动获取失败"));
      } finally {
        setLoading(false);
      }
    },
    [queryGameIds, queryKey, todayKey, to, cached],
  );

  // 挂载后、以及游戏集合/窗口变化时拉取；命中缓存时不会真正联网（按桶 TTL 判定）。
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

  // 高度模式五组件共用（宽或高偏小即紧凑）
  const mode = resolveWidgetSizeMode({ width: containerWidth, height: containerHeight });

  const rows = useMemo<ActivityTileRow[]>(() => {
    if (!groups) return [];
    // 行数由当前磁贴高度推算：磁贴变矮时自动少显示一行，而不是把最后一行裁掉
    const maxItems = widgetListCapacity(containerHeight, mode);
    /**
     * 分类筛选沿用弹窗里保存的勾选（`selected`），对**所有外显游戏统一生效**。
     * 六种 `kind` 是接口层面的全局分类，各游戏通用，因此一份勾选可跨游戏套用。
     * 未配置筛选（旧版本数据）时不筛，保持与单游戏时代一致。
     */
    const selected = readSelected(data);
    const previewMode = readPreviewMode(data);
    return buildTileRows({
      groups,
      displayGameIds,
      pinned,
      now,
      maxItems,
      /**
       * 分类筛选沿用弹窗保存的勾选，对**所有外显游戏统一生效**：
       * 六种 `kind` 是接口层面的全局分类，各游戏通用，因此一份勾选可跨游戏套用。
       * 未配置筛选（旧版本数据）时不筛，保持与单游戏时代一致。
       */
      filter: selected
        ? (entry) =>
            matchesSelection(entry, selected) && (previewMode === "point" || !isPreviewEntry(entry))
        : undefined,
    });
  }, [groups, displayGameIds, pinned, now, mode, containerHeight, data]);

  /** 表头标题：外显全部游戏时显示游戏名，否则按勾选列出（都不勾选则为空态文案）。 */
  const heading = headingLabel(displayGameIds);
  const urgentCount = rows.filter((row) => row.urgent).length;

  return (
    <div
      className="activity-widget"
      title={getMessage("widgetExpand", "展开详情")}
      style={{ padding: widgetPadding(mode) }}
    >
      <div className="activity-widget-top">
        <span className="activity-widget-game">
          <CalendarDays className="activity-widget-game-icon" />
          <span className="activity-widget-game-text">{heading}</span>
        </span>
        {urgentCount > 0 && (
          <span
            className="activity-widget-urgent-count"
            title={getMessage("hoyoActivityUrgentHint", "即将截止")}
          >
            {urgentCount}
          </span>
        )}
        <button
          className="activity-widget-refresh"
          title={getMessage("hoyoActivityRefresh", "刷新")}
          onClick={refresh}
        >
          <RefreshCw className={`activity-widget-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      {error && rows.length === 0 ? (
        <div className="activity-widget-state is-error">
          <AlertTriangle className="activity-widget-state-icon" />
          <span>{error}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="activity-widget-state">
          {loading
            ? getMessage("hoyoActivityLoading", "加载中...")
            : displayGameIds.length === 0
              ? getMessage("hoyoActivityNoGameSelected", "未勾选外显游戏")
              : getMessage("hoyoActivityEmpty", "暂无活动")}
        </div>
      ) : (
        <div className="activity-widget-list">
          {rows.map((row) => (
            <div
              key={`${row.gameId}:${row.entry.id}`}
              className={`activity-widget-item ${row.pinned ? "is-pinned-row" : ""} ${
                row.urgent ? "is-urgent" : ""
              }`}
              title={`${GAME_FALLBACK_NAMES[row.gameId] ?? row.gameId} · ${row.entry.title}`}
            >
              {row.pinned && <Pin className="activity-widget-pin-icon" />}
              <span className={`activity-widget-game-tag game-${row.gameId}`}>
                {GAME_SHORT_NAMES[row.gameId] ?? row.gameId}
              </span>
              <span className="activity-widget-title">{row.entry.title}</span>
              <span className={`activity-widget-remaining ${row.urgent ? "is-urgent" : ""}`}>
                {remainingLabel(remainingText(row.entry, now))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 表头文案。
 *
 * 外显全部游戏时用「游戏活动」这类整体说法（列出三个名字会超出磁贴宽度）；
 * 只勾选一部分时列出简称，让用户一眼看出磁贴被收窄到了哪些游戏。
 */
function headingLabel(displayGameIds: readonly string[]): string {
  if (displayGameIds.length === 0) {
    return getMessage("hoyoActivityPinnedOnly", "仅固定");
  }
  if (displayGameIds.length >= CALENDAR_GAME_IDS.length) {
    return getMessage("hoyoActivityAllGames", "游戏活动");
  }
  return displayGameIds.map((id) => GAME_SHORT_NAMES[id] ?? id).join(" / ");
}
