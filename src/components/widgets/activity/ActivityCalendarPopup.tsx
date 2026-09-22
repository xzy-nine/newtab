import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, ExternalLink, Pin, RefreshCw } from "lucide-react";
import { getMessage } from "@/lib/i18n";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CALENDAR_GAME_IDS,
  DEFAULT_WINDOW_DAYS,
  GAME_FALLBACK_NAMES,
  activityStatus,
  addDaysToDayKey,
  applySelectionFilter,
  buildAxisColumns,
  computeDefaultSelection,
  computeGanttLayout,
  fetchActivityEntries,
  fetchCapabilities,
  formatRange,
  ganttTodayPct,
  ganttWindow,
  isChildChecked,
  isParentChecked,
  readGameId,
  readPinnedIds,
  readPreviewMode,
  readSelected,
  readViewMode,
  readWindowDays,
  remainingText,
  selectionToIncludes,
  togglePinned,
  toggleSelectorValue,
  utc8DateLabel,
  utc8DayKey,
  utc8WeekdayLabel,
  type CalendarCapabilities,
  type ParsedActivityEntry,
  type RemainingText,
  type ViewMode,
} from "@/components/widgets/activity/activity";

interface ActivityCalendarPopupProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
}

/**
 * 窗口跨度可选项（天数）。
 *
 * 上限 365 天与接口默认 `to = from + 366 天` 对齐，一次请求即可覆盖；
 * 半年/一年正好对应"2~3 个月一个赛季/版本"的多个版本跨度。
 */
const WINDOW_OPTIONS = [7, 14, 30, 180, 365] as const;

/** 甘特泳道高度（像素），与 CSS 中的条高对应。 */
const GANTT_LANE_HEIGHT_PX = 34;

/** 横轴刻度窄于该百分比时隐藏文字（被窗口边界裁出的碎片块）。 */
const NARROW_AXIS_PCT = 3.5;

/**
 * 甘特条窄于该百分比时只画色块：不显示标题、也不显示固定按钮。
 *
 * 长窗口（半年/一年）里几天的活动只有 2~4% 宽，18px 的按钮加省略号
 * 会把条塞成一个"…"+图标，既看不懂也点不准。此时整条靠 hover 提示，
 * 双击条体仍可固定。
 */
const NARROW_BAR_PCT = 7;

/** 窗口跨度的显示文案：短跨度用「N 天」，长跨度用「半年 / 一年」。 */
function windowOptionLabel(days: number): string {
  if (days === 180) return getMessage("hoyoActivityHalfYear", "半年");
  if (days === 365) return getMessage("hoyoActivityOneYear", "一年");
  return `${days} ${getMessage("hoyoActivityDays", "天")}`;
}

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
 * 活动小部件的展开内容：筛选 + 甘特图 / 纯日程列表 + 固定操作。
 *
 * 该组件只在弹窗打开时挂载，因此日程请求也是"展开后才发出"。
 * 关键约束：
 * - **按桶整取、本地筛选**——筛选条件变化不发请求（长 TTL 才有意义）；
 * - **前瞻默认不显示**（它是 1 分钟事件，画成条必然不可见），
 *   可选降级为"只显示起点"的点标记；
 * - 时间一律按 **UTC+8** 换算展示，不跟随浏览器时区。
 */
export function ActivityCalendarPopup({ data, onDataChange }: ActivityCalendarPopupProps) {
  /**
   * 弹窗内切游戏时先用本地状态接管，而不是等父级把新 gameId 回灌回来。
   *
   * 若只 persist 再依赖 `data.gameId` 变化触发重新加载，一旦父级没能及时回灌
   * （例如父级持有的是点击时的快照），弹窗就会一直停在"加载中"：
   * 自身状态已清空，而 load 又没有被重新触发。
   *
   * 覆盖值记录"它是在哪个 props 值之上做出的选择"（`from`）：
   * - props 仍是 `from` → 父级还没跟上，用本地值 `to`；
   * - props 已变成别的值 → 父级已接手（或主动改成了另一个游戏），
   *   此时丢弃本地值、以 props 为准。
   * 这样在渲染期即可判定，不需要在 effect 里 setState 去清理。
   */
  const propsGameId = readGameId(data);
  const [gameOverride, setGameOverride] = useState<{ from: string; to: string } | null>(null);
  const gameId = gameOverride && gameOverride.from === propsGameId ? gameOverride.to : propsGameId;

  const previewMode = readPreviewMode(data);
  const [view, setView] = useState<ViewMode>(() => readViewMode(data));
  const [days, setDays] = useState(() => readWindowDays(data));
  const pinnedIds = useMemo(() => readPinnedIds(data), [data]);

  const [capabilities, setCapabilities] = useState<CalendarCapabilities | null>(null);
  const [entries, setEntries] = useState<ParsedActivityEntry[] | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(() => readSelected(data));
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");

  // 当前时间作为 state：既用于状态判定，也用于跨天推动窗口滚动
  const [now, setNow] = useState(() => Date.now());
  const from = utc8DayKey(now);
  const query = useMemo(
    () => ({ gameId, from, to: addDaysToDayKey(from, DEFAULT_WINDOW_DAYS) }),
    [gameId, from],
  );

  const persist = useCallback(
    (patch: Record<string, unknown>) => {
      onDataChange?.(patch);
    },
    [onDataChange],
  );

  /**
   * 每次请求的序号。用于丢弃"迟到的旧请求"结果：
   * 快速切换游戏时，上一个游戏的响应可能后到，不能让它覆盖新游戏的数据。
   */
  const requestRef = useRef(0);

  const load = useCallback(
    async (force: boolean) => {
      const token = ++requestRef.current;
      setLoading(true);
      setError("");
      setUnavailable(false);
      try {
        // capabilities 是筛选 UI 的唯一权威来源：不同游戏的父子结构不同，不能硬编码
        const caps = await fetchCapabilities(gameId, { force });
        // 慢响应保护：期间用户可能已切到别的游戏，晚到的旧结果必须丢弃，
        // 否则会把新游戏的数据/筛选结构覆盖回去。
        if (requestRef.current !== token) return;
        if (!caps) {
          setUnavailable(true);
          setCapabilities(null);
          setEntries([]);
          return;
        }
        setCapabilities(caps);
        // 初次进入用默认选中（排除角色生日与前瞻）；
        // 已有用户选择时保留它（selected 的初始值就来自持久化数据）
        setSelected((prev) => prev ?? computeDefaultSelection(caps.selectors));
        const next = await fetchActivityEntries(query, { force });
        if (requestRef.current !== token) return;
        setEntries(next);
      } catch {
        if (requestRef.current !== token) return;
        setError(getMessage("hoyoActivityLoadFailed", "活动获取失败"));
      } finally {
        if (requestRef.current === token) setLoading(false);
      }
    },
    [gameId, query],
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // 包一层 async IIFE，避免被判定为「effect 内同步 setState」
  useEffect(() => {
    void (async () => {
      await load(false);
    })();
  }, [load]);

  const onToggleSelector = useCallback(
    (value: string) => {
      if (!capabilities || !selected) return;
      const next = toggleSelectorValue(capabilities.selectors, selected, value);
      setSelected(next);
      persist({ selected: selectionToIncludes(capabilities.selectors, next) });
    },
    [capabilities, selected, persist],
  );

  const onTogglePin = useCallback(
    (id: string) => {
      const next = togglePinned(pinnedIds, id);
      persist({ pinned: next });
    },
    [pinnedIds, persist],
  );

  const onViewChange = useCallback(
    (next: ViewMode) => {
      setView(next);
      persist({ view: next });
    },
    [persist],
  );

  const onDaysChange = useCallback(
    (next: number) => {
      setDays(next);
      persist({ days: next });
    },
    [persist],
  );

  const onPreviewModeChange = useCallback(
    (next: "hide" | "point") => {
      persist({ preview: next });
    },
    [persist],
  );

  /**
   * 切换游戏。
   *
   * 必须同时清掉 capabilities 与选中集：不同游戏的父子筛选结构完全不同
   * （原神「游戏内活动」有子级、星铁没有；绝区零是「版本日程」+「卡池」），
   * 沿用上一个游戏的选中值会筛出空结果。
   *
   * 这里同时写本地覆盖值：`load` 依赖 `gameId`，覆盖值一变就会重新取数，
   * 不依赖父级回灌（详见组件顶部说明）。
   */
  const onGameChange = useCallback(
    (nextGameId: string) => {
      if (nextGameId === gameId) return;
      setGameOverride({ from: propsGameId, to: nextGameId });
      setCapabilities(null);
      setEntries(null);
      setSelected(null); // 置空后由 load 按新游戏的 capabilities 生成默认选中
      setUnavailable(false);
      setError("");
      persist({ gameId: nextGameId, selected: undefined, pinned: [] });
    },
    [gameId, propsGameId, persist],
  );

  const filtered = useMemo(() => {
    if (!entries || !selected) return [];
    return applySelectionFilter(entries, selected, { previewMode });
  }, [entries, selected, previewMode]);

  /**
   * 甘特窗口：向前回看若干天 + 向前看 N 天，并向上取整到整周。
   * 回看是为了让"进行中"的长活动不被裁在左边界上。
   */
  const win = useMemo(() => ganttWindow(now, days), [now, days]);
  const axisColumns = useMemo(() => buildAxisColumns(win), [win]);
  const layout = useMemo(
    () => computeGanttLayout(filtered, win.startMs, win.endMs),
    [filtered, win],
  );
  const todayPct = ganttTodayPct(win, now);

  // 纯日程列表：只展示窗口内仍有效或即将开始的，按开始时间排序
  const listRows = useMemo(
    () => filtered.filter((entry) => entry.endMs > now).sort((a, b) => a.startMs - b.startMs),
    [filtered, now],
  );

  return (
    <div className="activity-calendar">
      <div className="activity-calendar-bar">
        <div className="activity-calendar-games">
          {CALENDAR_GAME_IDS.map((id) => (
            <button
              key={id}
              className={`activity-calendar-game-btn ${gameId === id ? "is-active" : ""}`}
              onClick={() => onGameChange(id)}
            >
              {GAME_FALLBACK_NAMES[id] ?? id}
            </button>
          ))}
        </div>
        <div className="activity-calendar-views">
          <button
            className={`activity-calendar-view-btn ${view === "gantt" ? "is-active" : ""}`}
            onClick={() => onViewChange("gantt")}
          >
            {getMessage("hoyoActivityGantt", "甘特图")}
          </button>
          <button
            className={`activity-calendar-view-btn ${view === "list" ? "is-active" : ""}`}
            onClick={() => onViewChange("list")}
          >
            {getMessage("hoyoActivityList", "日程列表")}
          </button>
        </div>
        <button
          className="activity-calendar-refresh"
          title={getMessage("hoyoActivityRefresh", "刷新")}
          onClick={() => void load(true)}
          disabled={loading}
        >
          <RefreshCw className={`activity-calendar-refresh-icon ${loading ? "is-spinning" : ""}`} />
        </button>
      </div>

      {/* 筛选：父/子两级，勾父级 = 全选其子级 */}
      {capabilities && selected && (
        <div className="activity-calendar-filters">
          {capabilities.selectors.map((parent) => (
            <div key={parent.value} className="activity-calendar-filter-group">
              <label className="activity-calendar-filter-parent">
                <Checkbox
                  checked={isParentChecked(selected, parent.value)}
                  onCheckedChange={() => onToggleSelector(parent.value)}
                />
                <span>{parent.label}</span>
              </label>
              {parent.children.length > 0 && (
                <div className="activity-calendar-filter-children">
                  {parent.children.map((child) => (
                    <label key={child.value} className="activity-calendar-filter-child">
                      <Checkbox
                        checked={isChildChecked(selected, parent.value, child.value)}
                        onCheckedChange={() => onToggleSelector(child.value)}
                      />
                      <span>{child.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="activity-calendar-extra">
            <div className="activity-calendar-window">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option}
                  className={`activity-calendar-window-btn ${days === option ? "is-active" : ""}`}
                  onClick={() => onDaysChange(option)}
                >
                  {windowOptionLabel(option)}
                </button>
              ))}
            </div>
            <label className="activity-calendar-preview-toggle">
              <Checkbox
                checked={previewMode === "point"}
                onCheckedChange={(checked) => onPreviewModeChange(checked ? "point" : "hide")}
              />
              <span>{getMessage("hoyoActivityPreviewPoint", "前瞻只显示起点")}</span>
            </label>
          </div>
        </div>
      )}

      {unavailable ? (
        <div className="activity-calendar-state">
          {getMessage("hoyoActivityUnavailable", "该游戏暂无日程")}
        </div>
      ) : error ? (
        <div className="activity-calendar-state is-error">
          <AlertTriangle className="activity-calendar-state-icon" />
          <span>{error}</span>
        </div>
      ) : !entries ? (
        <div className="activity-calendar-state">
          <Loader2 className="activity-calendar-state-icon is-spinning" />
          <span>{getMessage("hoyoActivityLoading", "加载中...")}</span>
        </div>
      ) : view === "gantt" ? (
        <div className="activity-gantt">
          {/*
            时间轴网格：今天标记条 + 周标题 + 泳道区共用一个定位上下文，
            这样"今天"竖线才能从顶部贯穿到底（与参考日程表一致）。
          */}
          <div className="activity-gantt-grid">
            {/*
              今天标记单独占一条：它是贯穿全高的竖线的"头部"，
              若塞进周标题行会与「第 N 周 / 日期区间」文字重叠。
            */}
            <div className="activity-gantt-today-strip">
              <span
                className="activity-gantt-today-label"
                style={{ left: `${todayPct}%` }}
                title={getMessage("hoyoActivityToday", "今天")}
              >
                {getMessage("hoyoActivityToday", "今天")} {utc8DateLabel(now)}{" "}
                {utc8WeekdayLabel(now)}
              </span>
            </div>

            {/*
              横轴刻度：短窗口按「第 N 周 + 日期区间」，长窗口按月。
              半年/一年用周块会到 26/52 块，标签必然挤成一团。
              首尾被裁剪出的窄块不显示文字，否则会溢出成"7/2"这种碎片。
            */}
            <div className="activity-gantt-head">
              {axisColumns.map((column) => (
                <span
                  key={column.key}
                  className={`activity-gantt-week ${column.widthPct < NARROW_AXIS_PCT ? "is-narrow" : ""}`}
                  style={{ left: `${column.leftPct}%`, width: `${column.widthPct}%` }}
                  title={column.subLabel ? `${column.label} ${column.subLabel}` : column.label}
                >
                  <span className="activity-gantt-week-index">{column.label}</span>
                  {column.subLabel && (
                    <span className="activity-gantt-week-range">{column.subLabel}</span>
                  )}
                </span>
              ))}
            </div>

            {layout.bars.length === 0 ? (
              <div className="activity-calendar-state">
                {getMessage("hoyoActivityEmpty", "暂无活动")}
              </div>
            ) : (
              <div className="activity-gantt-body">
                {/* 刻度分隔线 */}
                {axisColumns.map((column) => (
                  <span
                    key={`grid-${column.key}`}
                    className="activity-gantt-gridline"
                    style={{ left: `${column.leftPct}%` }}
                  />
                ))}

                {/* 今天：贯穿全高的竖线（位于网格层，纵向覆盖整块时间轴） */}
                <span className="activity-gantt-today" style={{ left: `${todayPct}%` }} />

                {/*
                  泳道布局：互不重叠的活动共用同一行，按 lane 决定纵向位置。
                  条的宽度即真实时间跨度——这正是它与"纯进度条"的区别。
                */}
                <div
                  className="activity-gantt-lanes"
                  style={{ height: `${layout.laneCount * GANTT_LANE_HEIGHT_PX}px` }}
                >
                  {layout.bars.map((bar) => {
                    const isNarrow = !bar.isPoint && bar.widthPct < NARROW_BAR_PCT;
                    return (
                      <div
                        key={bar.entry.id}
                        className={`activity-gantt-bar ${statusOf(bar.entry, now)} ${
                          bar.isPoint ? "is-point" : ""
                        } ${isNarrow ? "is-narrow" : ""} ${
                          bar.clippedStart ? "is-clipped-start" : ""
                        } ${bar.clippedEnd ? "is-clipped-end" : ""}`}
                        style={{
                          left: `${bar.leftPct}%`,
                          width: bar.isPoint ? undefined : `${bar.widthPct}%`,
                          top: `${bar.lane * GANTT_LANE_HEIGHT_PX}px`,
                        }}
                        title={`${bar.entry.title} · ${formatRange(bar.entry)}`}
                        // 窄条放不下按钮，双击条体固定/取消固定
                        onDoubleClick={() => onTogglePin(bar.entry.id)}
                      >
                        <span className="activity-gantt-bar-title">{bar.entry.title}</span>
                        {!bar.isPoint && !isNarrow && (
                          <button
                            className={`activity-gantt-pin ${
                              pinnedIds.includes(bar.entry.id) ? "is-pinned" : ""
                            }`}
                            title={getMessage("hoyoActivityPin", "固定")}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePin(bar.entry.id);
                            }}
                          >
                            <Pin className="activity-gantt-pin-icon" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="activity-list">
          {listRows.length === 0 ? (
            <div className="activity-calendar-state">
              {getMessage("hoyoActivityEmpty", "暂无活动")}
            </div>
          ) : (
            listRows.map((entry) => (
              <div key={entry.id} className="activity-list-row">
                <button
                  className={`activity-list-pin ${pinnedIds.includes(entry.id) ? "is-pinned" : ""}`}
                  title={getMessage("hoyoActivityPin", "固定")}
                  onClick={() => onTogglePin(entry.id)}
                >
                  <Pin className="activity-list-pin-icon" />
                </button>
                <span className={`activity-list-status ${statusOf(entry, now)}`}>
                  {getMessage(
                    statusOf(entry, now) === "ongoing"
                      ? "hoyoActivityOngoing"
                      : "hoyoActivityUpcoming",
                    statusOf(entry, now) === "ongoing" ? "进行中" : "未开始",
                  )}
                </span>
                <span className="activity-list-title">{entry.title}</span>
                <span className="activity-list-kind">{entry.kind}</span>
                <span className="activity-list-remaining">
                  {remainingLabel(remainingText(entry, now))}
                </span>
                {entry.url && (
                  <a
                    className="activity-list-link"
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    title={entry.url}
                  >
                    <ExternalLink className="activity-list-link-icon" />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** 活动状态（用于样式类名）。 */
function statusOf(entry: ParsedActivityEntry, now: number): string {
  return activityStatus(entry, now);
}
