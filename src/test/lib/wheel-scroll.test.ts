import { describe, it, expect } from "vitest";
import {
  DELTA_MODE_LINE,
  DELTA_MODE_PAGE,
  DELTA_MODE_PIXEL,
  LINE_HEIGHT_PX,
  normalizeWheelDelta,
  shouldConvertWheelToHorizontal,
} from "@/lib/wheel-scroll";

describe("normalizeWheelDelta", () => {
  it("passes pixel deltas through unchanged", () => {
    expect(normalizeWheelDelta(120, DELTA_MODE_PIXEL)).toBe(120);
    expect(normalizeWheelDelta(-120, DELTA_MODE_PIXEL)).toBe(-120);
  });

  it("converts line deltas to pixels", () => {
    // Firefox/触控板会给"行"，例如 deltaY=3；直接加到 scrollLeft 几乎不动
    expect(normalizeWheelDelta(3, DELTA_MODE_LINE)).toBe(3 * LINE_HEIGHT_PX);
    expect(normalizeWheelDelta(-3, DELTA_MODE_LINE)).toBe(-3 * LINE_HEIGHT_PX);
  });

  it("honours a custom line height", () => {
    expect(normalizeWheelDelta(2, DELTA_MODE_LINE, 0, 20)).toBe(40);
  });

  it("converts page deltas using the page size", () => {
    expect(normalizeWheelDelta(1, DELTA_MODE_PAGE, 500)).toBe(500);
    expect(normalizeWheelDelta(-1, DELTA_MODE_PAGE, 500)).toBe(-500);
  });

  it("falls back to the line height when page size is unknown", () => {
    expect(normalizeWheelDelta(1, DELTA_MODE_PAGE, 0)).toBe(LINE_HEIGHT_PX);
  });

  it("returns 0 for non-finite deltas", () => {
    expect(normalizeWheelDelta(Number.NaN, DELTA_MODE_PIXEL)).toBe(0);
    expect(normalizeWheelDelta(Number.POSITIVE_INFINITY, DELTA_MODE_PIXEL)).toBe(0);
  });

  it("keeps a line-mode delta comparable in magnitude to a pixel one", () => {
    // 同样的物理滚动量，行模式换算后不应远小于像素模式
    expect(normalizeWheelDelta(3, DELTA_MODE_LINE)).toBeGreaterThan(0);
    expect(normalizeWheelDelta(3, DELTA_MODE_LINE)).toBeGreaterThanOrEqual(3);
  });
});

describe("shouldConvertWheelToHorizontal", () => {
  const base = { deltaX: 0, deltaY: 120, scrollWidth: 1200, clientWidth: 400 };

  it("converts a vertical wheel when the container can scroll horizontally", () => {
    expect(shouldConvertWheelToHorizontal(base)).toBe(true);
  });

  it("does nothing when the content already fits", () => {
    // 没有可滚动空间时不能拦截，否则会吃掉页面/逐天的竖向滚动
    expect(shouldConvertWheelToHorizontal({ ...base, scrollWidth: 400 })).toBe(false);
    expect(shouldConvertWheelToHorizontal({ ...base, scrollWidth: 300 })).toBe(false);
  });

  it("does nothing without a vertical delta", () => {
    expect(shouldConvertWheelToHorizontal({ ...base, deltaY: 0 })).toBe(false);
  });

  it("leaves a deliberate horizontal gesture alone", () => {
    // 触控板横滑：|deltaX| > |deltaY| 时不干预，交给浏览器原生横滚
    expect(shouldConvertWheelToHorizontal({ ...base, deltaX: 120, deltaY: 10 })).toBe(false);
  });

  it("still converts when horizontal and vertical are equal", () => {
    expect(shouldConvertWheelToHorizontal({ ...base, deltaX: 120, deltaY: 120 })).toBe(true);
  });

  it("converts upward scrolling too", () => {
    expect(shouldConvertWheelToHorizontal({ ...base, deltaY: -120 })).toBe(true);
  });
});
