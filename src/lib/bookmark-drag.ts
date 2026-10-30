/**
 * 书签拖拽负载的读写。
 *
 * 文件夹视图把选中的书签序列化成 JSON 放进 `dataTransfer`，主桌面与浮层落点
 * 再把它们固定为快捷方式。`dataTransfer` 只能存字符串，因此解析失败是常态：
 * 越界数据、其他应用拖来的内容都会走到这里，一律按"非本应用负载"处理。
 *
 * @module lib/bookmark-drag
 */

import type { BookmarkLike } from "@/lib/desktop-items";

/** 拖拽固定到主桌面时使用的 `dataTransfer` 类型。 */
export const BOOKMARK_DRAG_TYPE = "application/x-newtab-bookmark";

/** 判断拖拽负载是否为本应用的书签。 */
export function hasBookmarkDragType(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(BOOKMARK_DRAG_TYPE);
}

/**
 * 读取拖拽负载中的书签。
 * @param dataTransfer 拖拽事件的数据载体。
 * @returns 书签列表；非本应用负载或 JSON 非法时为空数组。
 */
export function readBookmarkDragPayload(dataTransfer: DataTransfer): BookmarkLike[] {
  const raw = dataTransfer.getData(BOOKMARK_DRAG_TYPE);
  if (!raw) return [];
  try {
    const payload: unknown = JSON.parse(raw);
    return Array.isArray(payload) ? (payload as BookmarkLike[]) : [];
  } catch {
    return [];
  }
}
