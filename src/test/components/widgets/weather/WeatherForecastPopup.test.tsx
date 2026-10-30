import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WeatherForecastPopup } from "@/components/widgets/weather/WeatherForecastPopup";
import { forecastCacheKey } from "@/components/widgets/weather/weather";
import { useFetchStub } from "@/test/support/fetch";

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
  ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    headers: new Headers(),
  }) as unknown as Response;

/** 构造失败响应；`uapiFetch` 会按状态码决定是否退避重试。 */
const fail = (status: number, payload: unknown = {}): Response =>
  ({
    ok: false,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    headers: new Headers(),
  }) as unknown as Response;

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

/** 缓存键，测试里反复用到同一城市。 */
function cacheKeyFor(city: string): string {
  return `newtab:cache:${forecastCacheKey({ city, lang: "zh" })}`;
}

describe("WeatherForecastPopup", () => {
  const { fetchMock } = useFetchStub();

  /** 渲染弹窗并等待首个预报渲染完成。 */
  async function renderPopup(city = "北京") {
    const result = render(<WeatherForecastPopup data={{ city }} />);
    await waitFor(() => {
      expect(screen.queryByText("17:00")).not.toBeNull();
    });
    return result;
  }

  it("fetches the forecast on mount (i.e. only after expanding)", async () => {
    fetchMock.mockResolvedValue(ok(FORECAST));
    await renderPopup();

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

    await renderPopup();

    // 必须有实际图标，不能是问号占位
    expect(screen.queryByText("⛅")).not.toBeNull();
    expect(screen.queryByText("🌧️")).not.toBeNull();
    expect(screen.queryByText("☀️")).not.toBeNull();
    expect(screen.queryByText("🌨️")).not.toBeNull();
    expect(screen.queryByText("❓")).toBeNull();
  });

  it("keeps the hourly and daily sections in separate scroll containers", async () => {
    fetchMock.mockResolvedValue(ok(FORECAST));
    const { container } = await renderPopup();

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
    await renderPopup();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not reuse another city's cache", async () => {
    seedCache("上海");
    fetchMock.mockResolvedValue(ok(FORECAST));
    await renderPopup();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]![0])).toContain(encodeURIComponent("北京"));
  });

  it("writes the fetched forecast into the 24h cache", async () => {
    fetchMock.mockResolvedValue(ok(FORECAST));
    await renderPopup();

    const stored = localStorage.getItem(cacheKeyFor("北京"));
    expect(stored).not.toBeNull();
    const record = JSON.parse(stored!) as { ttl: number; value: typeof NORMALIZED_FORECAST };
    expect(record.ttl).toBe(24 * 60 * 60 * 1000);
    expect(record.value.daily).toHaveLength(1);
  });

  it("shows an error state instead of crashing when the request fails", async () => {
    // 503 可重试：会退避重试到次数上限后才报错
    fetchMock.mockResolvedValue(fail(503));
    render(<WeatherForecastPopup data={{ city: "北京" }} />);

    await waitFor(
      () => {
        expect(screen.queryByText("预报获取失败")).not.toBeNull();
      },
      { timeout: 5000 },
    );
  });

  it("recovers from a corrupted cached value instead of rendering undefined", async () => {
    // 结构不合法的缓存：旧版本写入或外部损坏
    localStorage.setItem(
      cacheKeyFor("北京"),
      JSON.stringify({ savedAt: Date.now(), ttl: 24 * 60 * 60 * 1000, value: { nope: true } }),
    );
    fetchMock.mockResolvedValue(ok(FORECAST));

    // 坏缓存被丢弃并重新请求，最终正常渲染
    await renderPopup();
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
