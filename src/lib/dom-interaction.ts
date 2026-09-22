/**
 * 桌面磁贴内的交互控件判定。
 *
 * 磁贴本身是 HTML5 可拖拽元素（用于排序）。若拖拽判定不排除内部的输入框、
 * 按钮等控件，浏览器会把在控件上的按下当成拖拽起点，导致：
 * - 输入框无法获得焦点或被立刻夺走焦点，无法输入；
 * - 按钮点击被拖拽流程吞掉。
 *
 * 这里集中判定"这次拖动是否源自交互控件"，供拖拽与按下处理共用。
 */

/** 交互控件的选择器。 */
const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[data-no-drag]",
].join(",");

/** 判断事件目标是否为交互控件；null/undefined/非元素一律返回 false。 */
export function isInteractiveTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as Partial<Element>;
  if (typeof element.closest !== "function") return false;
  try {
    return element.closest(INTERACTIVE_SELECTOR) !== null;
  } catch {
    return false;
  }
}
