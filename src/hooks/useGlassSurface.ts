import { useEffect } from "react";

/**
 * 把玻璃透明与模糊设置同步到 `documentElement` 的 CSS 变量与 `data-glass` 属性。
 *
 * `data-glass` 只在玻璃效果实际生效（模糊大于 0 或透明度低于 100）时存在，
 * 供样式据此切换背面材质；变量始终写入，未生效时其值本身即不改变外观。
 *
 * @param glassOpacity 玻璃透明度百分比。
 * @param glassBlur 玻璃模糊半径（像素）。
 */
export function useGlassSurface(glassOpacity: number, glassBlur: number): void {
  useEffect(() => {
    const el = document.documentElement;
    if (glassBlur > 0 || glassOpacity < 100) {
      el.setAttribute("data-glass", "");
    } else {
      el.removeAttribute("data-glass");
    }
    el.style.setProperty("--xb-glass-opacity", `${glassOpacity / 100}`);
    el.style.setProperty("--xb-glass-blur", `${glassBlur}px`);
  }, [glassOpacity, glassBlur]);
}
