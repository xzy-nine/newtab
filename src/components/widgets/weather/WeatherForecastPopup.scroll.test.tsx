import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WeatherForecastPopup } from "@/components/widgets/weather/WeatherForecastPopup";

/**
 * 逐小时横滚的行为回归测试。
 *
 * 之前"滚不动"的原因有两个，这里都钉住：
 * 1. 容器没有可滚动空间（宽度被内容撑开）时不应拦截；
 * 2. 行模式的 deltaY 必须换算成像素，否则 scrollLeft 几乎不动。
 */

const ok = (payload: unknown): Response =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  time: `2026-02-19T${String(i).padStart(2, "0")}:00:00+0800`,
  temperature: 20 + (i % 5),
  weather: "多云",
}));

/** 造一个可横滚的容器：jsdom 不做布局，需要手动定义尺寸。 */
function makeScrollable(el: HTMLElement, clientWidth: number, scrollWidth: number) {
  Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
  let scrollLeft = 0;
  Object.defineProperty(el, "scrollLeft", {
    get: () => scrollLeft,
    set: (v: number) => {
      scrollLeft = v;
    },
    configurable: true,
  });
  return {
    get value() {
      return scrollLeft;
    },
  };
}

describe("WeatherForecastPopup 逐小时横滚", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderHourly() {
    fetchMock.mockResolvedValue(ok({ hourly_forecast: HOURS, forecast: [] }));
    const { container } = render(<WeatherForecastPopup data={{ city: "北京" }} />);
    await waitFor(() => expect(screen.queryByText("00:00")).not.toBeNull());
    const hourly = container.querySelector<HTMLElement>(".weather-hourly")!;
    return hourly;
  }

  it("scrolls horizontally on a vertical wheel (pixel mode)", async () => {
    const hourly = await renderHourly();
    const state = makeScrollable(hourly, 400, 1400);

    fireEvent.wheel(hourly, { deltaY: 120, deltaX: 0, deltaMode: 0 });

    expect(state.value).toBe(120);
  });

  it("converts line-mode deltas so the list actually moves", async () => {
    const hourly = await renderHourly();
    const state = makeScrollable(hourly, 400, 1400);

    // Firefox/触控板常见：deltaMode=1（行），deltaY=3
    fireEvent.wheel(hourly, { deltaY: 3, deltaX: 0, deltaMode: 1 });

    // 未经换算只有 3px，等于没动；换算后应为 3*16=48
    expect(state.value).toBe(48);
  });

  it("scrolls back up on a negative wheel", async () => {
    const hourly = await renderHourly();
    const state = makeScrollable(hourly, 400, 1400);

    fireEvent.wheel(hourly, { deltaY: 200, deltaX: 0, deltaMode: 0 });
    fireEvent.wheel(hourly, { deltaY: -120, deltaX: 0, deltaMode: 0 });

    expect(state.value).toBe(80);
  });

  it("does not swallow the wheel when the content already fits", async () => {
    const hourly = await renderHourly();
    const state = makeScrollable(hourly, 1400, 1400);

    const event = new WheelEvent("wheel", {
      deltaY: 120,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
    });
    hourly.dispatchEvent(event);

    // 不该被拦截，也不该滚动（好让页面/逐天正常竖滚）
    expect(event.defaultPrevented).toBe(false);
    expect(state.value).toBe(0);
  });

  it("leaves a trackpad horizontal gesture to native scrolling", async () => {
    const hourly = await renderHourly();
    const state = makeScrollable(hourly, 400, 1400);

    const event = new WheelEvent("wheel", {
      deltaX: 120,
      deltaY: 8,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
    });
    hourly.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(state.value).toBe(0);
  });

  it("prevents the default when it does convert", async () => {
    const hourly = await renderHourly();
    makeScrollable(hourly, 400, 1400);

    const event = new WheelEvent("wheel", {
      deltaY: 120,
      deltaMode: 0,
      bubbles: true,
      cancelable: true,
    });
    hourly.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
