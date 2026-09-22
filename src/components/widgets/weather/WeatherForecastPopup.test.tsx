import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WeatherForecastPopup } from "@/components/widgets/weather/WeatherForecastPopup";
import { forecastCacheKey } from "@/components/widgets/weather/weather";

/**
 * 展开弹窗的按需请求与缓存行为。
 *
 * 关键点：只有挂载（即展开）时才请求预报；命中 24h 缓存则不联网，
 * 以节省免费 API 配额。
 */

const FORECAST = {
  hourly_forecast: [{ time: "2026-02-19T17:00:00+0900", temperature: 8, weather: "晴" }],
  forecast: [{ date: "2026-02-19", week: "星期四", temp_max: 14, temp_min: -1, weather_day: "晴" }],
};

const ok = (payload: unknown): Response =>
  ({ ok: true, status: 200, json: async () => payload }) as Response;

/** 缓存里保存的是规范化后的结构（camelCase），而非接口原始结构。 */
const NORMALIZED_FORECAST = {
  hourly: [
    {
      time: "2026-02-19T17:00:00+0900",
      label: "17:00",
      temperature: 8,
      weather: "晴",
    },
  ],
  daily: [
    {
      date: "2026-02-19",
      week: "星期四",
      tempMax: 14,
      tempMin: -1,
      weatherDay: "晴",
    },
  ],
  fetchedAt: Date.now(),
};

/** 把预报写入缓存（模拟此前展开过、仍在 24h 有效期内）。 */
function seedCache(city: string) {
  localStorage.setItem(
    `newtab:cache:${forecastCacheKey({ city, lang: "zh" })}`,
    JSON.stringify({
      savedAt: Date.now(),
      ttl: 24 * 60 * 60 * 1000,
      value: NORMALIZED_FORECAST,
    }),
  );
}

describe("WeatherForecastPopup", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the forecast on mount (i.e. only after expanding)", async () => {
    fetchMock.mockResolvedValue(ok(FORECAST));
    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(() => expect(screen.queryByText("17:00")).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain("hourly=true");
    expect(url).toContain(encodeURIComponent("北京"));
    // 逐天预报也要渲染
    expect(screen.queryByText("星期四")).not.toBeNull();
  });

  it("renders real weather icons even though forecast rows omit weather_icon", async () => {
    // 逐小时/逐天的响应里只有天气文本，没有 weather_icon
    fetchMock.mockResolvedValue(
      ok({
        hourly_forecast: [
          { time: "2026-02-19T17:00:00+0900", temperature: 8, weather: "多云" },
          { time: "2026-02-19T18:00:00+0900", temperature: 7, weather: "小雨" },
        ],
        forecast: [
          { date: "2026-02-19", week: "星期四", temp_max: 14, temp_min: -1, weather_day: "晴" },
          { date: "2026-02-20", week: "星期五", temp_max: 12, temp_min: -2, weather_day: "小雪" },
        ],
      }),
    );

    render(<WeatherForecastPopup data={{ city: "北京" }} />);
    await waitFor(() => expect(screen.queryByText("17:00")).not.toBeNull());

    // 必须有实际图标，不能是问号占位
    expect(screen.queryByText("⛅")).not.toBeNull();
    expect(screen.queryByText("🌧️")).not.toBeNull();
    expect(screen.queryByText("☀️")).not.toBeNull();
    expect(screen.queryByText("🌨️")).not.toBeNull();
    expect(screen.queryByText("❓")).toBeNull();
  });

  it("keeps the hourly and daily sections in separate scroll containers", async () => {
    fetchMock.mockResolvedValue(ok(FORECAST));
    const { container } = render(<WeatherForecastPopup data={{ city: "北京" }} />);
    await waitFor(() => expect(screen.queryByText("17:00")).not.toBeNull());

    const hourly = container.querySelector(".weather-hourly");
    const daily = container.querySelector(".weather-daily");
    expect(hourly).not.toBeNull();
    expect(daily).not.toBeNull();
    // 两者是各自独立的容器，不互相嵌套
    expect(hourly!.contains(daily!)).toBe(false);
    expect(daily!.contains(hourly!)).toBe(false);
  });

  it("serves a cached forecast without any network request", async () => {
    seedCache("北京");

    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(() => expect(screen.queryByText("17:00")).not.toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reuse another city's cache", async () => {
    seedCache("上海");

    fetchMock.mockResolvedValue(ok(FORECAST));
    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]![0])).toContain(encodeURIComponent("北京"));
  });

  it("writes the fetched forecast into the 24h cache", async () => {
    fetchMock.mockResolvedValue(ok(FORECAST));
    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(() => expect(screen.queryByText("17:00")).not.toBeNull());
    const stored = localStorage.getItem(
      `newtab:cache:${forecastCacheKey({ city: "北京", lang: "zh" })}`,
    );
    expect(stored).not.toBeNull();
    const record = JSON.parse(stored!) as { ttl: number; value: typeof NORMALIZED_FORECAST };
    expect(record.ttl).toBe(24 * 60 * 60 * 1000);
    expect(record.value.daily).toHaveLength(1);
  });

  it("shows an error state instead of crashing when the request fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) } as Response);
    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(() => {
      expect(screen.queryByText("预报获取失败")).not.toBeNull();
    });
  });

  it("recovers from a corrupted cached value instead of rendering undefined", async () => {
    // 结构不合法的缓存：旧版本写入或外部损坏
    localStorage.setItem(
      `newtab:cache:${forecastCacheKey({ city: "北京", lang: "zh" })}`,
      JSON.stringify({ savedAt: Date.now(), ttl: 24 * 60 * 60 * 1000, value: { nope: true } }),
    );
    fetchMock.mockResolvedValue(ok(FORECAST));

    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    // 坏缓存被丢弃并重新请求，最终正常渲染
    await waitFor(() => expect(screen.queryByText("17:00")).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error rather than crashing when the API returns malformed payloads", async () => {
    fetchMock.mockResolvedValue(ok({ unexpected: "shape" }));
    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(() => {
      expect(screen.queryByText("预报获取失败")).not.toBeNull();
    });
  });
});
