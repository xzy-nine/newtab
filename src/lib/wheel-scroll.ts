/**
 * 滚轮增量归一化。
 *
 * `WheelEvent.deltaY` 的单位取决于 `deltaMode`：
 * - 0（DOM_DELTA_PIXEL）：像素，直接用；
 * - 1（DOM_DELTA_LINE）：行数，各浏览器约 3 行/格，必须换算成像素，
 *   否则 `scrollLeft += 3` 几乎不动（表现为"滚不动"）；
 * - 2（DOM_DELTA_PAGE）：页数，按容器可视宽度换算。
 */

/** WheelEvent.deltaMode 的取值。 */
export const DELTA_MODE_PIXEL = 0;
export const DELTA_MODE_LINE = 1;
export const DELTA_MODE_PAGE = 2;

/** 一行的估算像素高度（与浏览器默认行高接近）。 */
export const LINE_HEIGHT_PX = 16;

/**
 * 把滚轮增量换算为像素。
 *
 * @param delta 原始 `deltaY` / `deltaX`。
 * @param deltaMode 事件的 `deltaMode`。
 * @param pageSize 一页的像素长度（通常为容器可视宽度）；`deltaMode` 为 2 时使用。
 * @param lineHeight 一行像素高度，缺省 16。
 */
export function normalizeWheelDelta(
  delta: number,
  deltaMode: number,
  pageSize = 0,
  lineHeight = LINE_HEIGHT_PX,
): number {
  if (!Number.isFinite(delta)) return 0;
  if (deltaMode === DELTA_MODE_LINE) return delta * lineHeight;
  if (deltaMode === DELTA_MODE_PAGE) return delta * (pageSize > 0 ? pageSize : lineHeight);
  return delta;
}

/**
 * 是否应该把竖向滚轮转为横向滚动。
 *
 * - 竖向增量必须非零，否则无事可做；
 * - 容器必须确实可横向滚动，否则会把竖向滚动一并吞掉；
 * - 事件本身已带更明显的横向意图（触控板横滑）时不干预。
 */
export function shouldConvertWheelToHorizontal(params: {
  deltaX: number;
  deltaY: number;
  scrollWidth: number;
  clientWidth: number;
}): boolean {
  const { deltaX, deltaY, scrollWidth, clientWidth } = params;
  if (deltaY === 0) return false;
  if (scrollWidth <= clientWidth) return false;
  return Math.abs(deltaX) <= Math.abs(deltaY);
}
