/**
 * 桌面小部件的统一尺寸与"高度模式"。
 *
 * 背景：桌面磁贴的高度基准与各组件内部的紧凑/常规判定原先散落在各处——
 * 磁贴侧写死传入 `containerHeight = 300`，组件侧则各写一套阈值
 * （计数器 ≤135/100、计时器只看宽 <160、便签完全忽略），
 * 结果是"传入 300、实际外显明显不足"，新旧组件高度观感不一致。
 *
 * 这里把两件事收敛到一处：
 * 1. **磁贴高度基准** `WIDGET_TILE_HEIGHT`：桌面磁贴与传给组件的
 *    `containerHeight` 用同一个值，避免"说的 300、量的不是 300"；
 * 2. **高度模式判定** `resolveWidgetSizeMode`：宽度与高度任一进入紧凑阈值
 *    即判定为紧凑，五个组件共用，不再各写各的。
 *
 * 纯逻辑、无 React 依赖，便于单元测试与复用。
 */

/**
 * 桌面磁贴的统一高度（像素）。
 *
 * 与第二行文件夹磁贴（`.desktop-folder-panel` / `.is-folder-preview`）取同一高度：
 * 桌面上"文件夹行"与"小部件行"因此等高。桌面小部件磁贴一律采用该高度，
 * 并作为 `containerHeight` 传给组件，使组件内部的紧凑判定与真实外显高度一致。
 *
 * 注意：CSS 侧同名基准是 `--desktop-tile-height`，两处必须保持一致。
 */
export const WIDGET_TILE_HEIGHT = 150;

/**
 * 紧凑模式阈值（像素）。
 *
 * 磁贴宽度小于 `compactWidth`，**或**高度小于 `compactHeight` 即视为紧凑：
 * 收紧内边距、缩小标题与正文，保证内容不被裁切。
 */
export const WIDGET_COMPACT_WIDTH = 160;
export const WIDGET_COMPACT_HEIGHT = 120;

/** 尺寸模式：紧凑或常规。 */
export type WidgetSizeMode = "compact" | "regular";

/** 判断紧凑模式所需的尺寸输入。 */
export interface WidgetSizeInput {
  width?: number;
  height?: number;
}

/** 判定尺寸是否进入紧凑模式；宽度与高度任一低于阈值即为紧凑。 */
export function isCompactSize({ width, height }: WidgetSizeInput): boolean {
  if (typeof width === "number" && width < WIDGET_COMPACT_WIDTH) return true;
  if (typeof height === "number" && height < WIDGET_COMPACT_HEIGHT) return true;
  return false;
}

/**
 * 解析尺寸模式。
 *
 * 尺寸缺失（如弹窗内未传参的默认渲染）按常规模式处理：
 * 宁可多留内边距，也不要因缺省值把常规布局误判成紧凑。
 */
export function resolveWidgetSizeMode(input: WidgetSizeInput = {}): WidgetSizeMode {
  return isCompactSize(input) ? "compact" : "regular";
}

/** 紧凑模式下的磁贴内边距（像素）。 */
export const WIDGET_PADDING_COMPACT = 6;
/** 常规模式下的磁贴内边距（像素）。 */
export const WIDGET_PADDING_REGULAR = 10;

/** 按尺寸模式取磁贴内边距。 */
export function widgetPadding(mode: WidgetSizeMode): string {
  return `${mode === "compact" ? WIDGET_PADDING_COMPACT : WIDGET_PADDING_REGULAR}px`;
}

/**
 * 列表型小部件的行高参数（像素）。
 *
 * 与 CSS 对应：`.activity-widget-item` 的行高 + 上下内边距约 21px，
 * 行间距 3px；标题栏（含与列表之间的间距）约 26px。
 * 改动 CSS 时需同步这几个值，否则行数会算多导致最后一行被裁。
 */
export const WIDGET_LIST_ROW_HEIGHT = 21;
export const WIDGET_LIST_ROW_GAP = 3;
export const WIDGET_LIST_HEADER_HEIGHT = 26;
/** 列表最多展示的行数上限（再多就该展开弹窗看完整日程）。 */
export const WIDGET_LIST_MAX_ROWS = 5;

/**
 * 在给定磁贴高度下，列表最多能完整容纳几行。
 *
 * 行数是磁贴高度的函数而非另写一个高度阈值：磁贴高度一旦调整，
 * 行数自动跟着变，不会出现"行数按旧高度算、最后一行被裁掉"。
 *
 * @param height 磁贴高度（像素）。
 * @param mode 尺寸模式，决定内边距。
 */
export function widgetListCapacity(height: number, mode: WidgetSizeMode): number {
  const padding = mode === "compact" ? WIDGET_PADDING_COMPACT : WIDGET_PADDING_REGULAR;
  const available = height - padding * 2 - WIDGET_LIST_HEADER_HEIGHT;
  if (available <= 0) return 0;
  const rows = Math.floor(
    (available + WIDGET_LIST_ROW_GAP) / (WIDGET_LIST_ROW_HEIGHT + WIDGET_LIST_ROW_GAP),
  );
  return Math.max(0, Math.min(WIDGET_LIST_MAX_ROWS, rows));
}
