/**
 * 桌面磁贴内的交互控件判定。
 *
 * 磁贴本身是 HTML5 可拖拽元素（用于排序）。若拖拽判定不排除内部的输入框、
 * 按钮等控件，浏览器会把在控件上的按下当成拖拽起点，导致：
 * - 输入框无法获得焦点或被立刻夺走焦点，无法输入；
 * - 按钮点击被拖拽流程吞掉。
 *
 * 这里集中判定"这次按下/点击是否落在交互控件上"，供拖拽与点击处理共用。
 *
 * 两类判定必须分开，因为它们对点击的期望相反：
 * - **控件**（按钮 / 链接 / 输入框）：拖拽让位，且点击由控件自己处理，
 *   磁贴级点击（展开弹窗）不应触发；
 * - **`data-no-drag` 区域**（如磁贴内的可滚动列表）：拖拽同样让位，
 *   但**点击仍应冒泡给磁贴**——不然在列表空白处点一下无法展开弹窗。
 */

/**
 * 交互控件的选择器。
 *
 * 注意**不含** `[data-no-drag]`：那是"只禁拖拽、不禁点击"的标记，
 * 由 `isDragBlockedTarget` 单独识别。
 */
const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable='true']",
  "[contenteditable='']",
].join(",");

/** 显式声明"此处禁止发起磁贴拖拽"的标记（滚动区用）。 */
const NO_DRAG_SELECTOR = "[data-no-drag]";

function matches(target: EventTarget | null | undefined, selector: string): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as Partial<Element>;
  if (typeof element.closest !== "function") return false;
  try {
    return element.closest(selector) !== null;
  } catch {
    return false;
  }
}

/**
 * 事件目标是否为交互控件（含其内部的子节点）。
 *
 * 用于"点击是否该被控件消费"：按钮、链接、输入框及其后代返回 true。
 * `data-no-drag` 区域**不算**控件，点击会继续冒泡给磁贴。
 */
export function isInteractiveTarget(target: EventTarget | null | undefined): boolean {
  return matches(target, CONTROL_SELECTOR);
}

/**
 * 事件目标是否属于"禁止发起磁贴拖拽"的区域。
 *
 * 除控件外还包含显式的 `data-no-drag` 标记，用于可滚动列表：
 * 在其上按下时磁贴要临时关掉 `draggable`，否则浏览器会把手势当成拖拽起点，
 * 滚动条拖动与滚轮滚动都会失效。
 */
export function isDragBlockedTarget(target: EventTarget | null | undefined): boolean {
  if (isInteractiveTarget(target)) return true;
  return matches(target, NO_DRAG_SELECTOR);
}
