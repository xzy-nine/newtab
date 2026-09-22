import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WeatherWidget } from "@/components/widgets/weather/WeatherWidget";

/**
 * 天气小部件的行为测试。
 *
 * 重点覆盖"IP 定位预填城市"这条链路：没有已存城市时先调用 myip 接口，
 * 再用解析出的大行政区去查天气；以及接口失败时的错误提示。
 */

const MYIP_RESPONSE = {
  ip: "125.82.121.12",
  region: "中国 广东 深圳",
  isp: "Chinanet",
};

const WEATHER_RESPONSE = {
  province: "广东省",
  city: "深圳市",
  weather: "多云",
  weather_icon: "101",
  temperature: 30,
  wind_direction: "北风",
  wind_power: "2级",
  humidity: 70,
  report_time: "10 分钟前发布",
  temp_max: 33,
  temp_min: 26,
};

function mockFetchOnce(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => payload,
  } as Response;
}

describe("WeatherWidget", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefills the city from the IP API, then loads that city's weather", async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchOnce(MYIP_RESPONSE))
      .mockResolvedValueOnce(mockFetchOnce(WEATHER_RESPONSE));

    render(<WeatherWidget />);

    await waitFor(() => {
      expect(screen.queryByText("30°")).not.toBeNull();
    });

    // 第一次是 IP 定位，第二次天气请求必须带上定位出的城市
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/network/myip");
    const weatherUrl = String(fetchMock.mock.calls[1]![0]);
    expect(weatherUrl).toContain("/misc/weather");
    expect(weatherUrl).toContain(encodeURIComponent("深圳"));

    // 展示地点与天气
    expect(screen.queryByText("深圳市")).not.toBeNull();
    expect(screen.queryByText("多云")).not.toBeNull();
  });

  it("skips the IP lookup when a city is already stored", async () => {
    fetchMock.mockResolvedValueOnce(mockFetchOnce(WEATHER_RESPONSE));

    render(<WeatherWidget data={{ city: "北京" }} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url).toContain(encodeURIComponent("北京"));
    expect(url).not.toContain("myip");
  });

  it("reuses a fresh cached snapshot without any request", async () => {
    render(
      <WeatherWidget
        data={{
          city: "北京",
          updatedAt: Date.now(),
          snapshot: {
            province: "北京市",
            city: "北京",
            weather: "晴",
            weatherIcon: "100",
            temperature: 27,
          },
        }}
      />,
    );

    expect(screen.queryByText("27°")).not.toBeNull();
    expect(screen.queryByText("晴")).not.toBeNull();
    // 缓存新鲜 → 不发请求
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it("still loads weather when IP geolocation fails", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(mockFetchOnce(WEATHER_RESPONSE));

    render(<WeatherWidget />);

    // 定位失败后回落到不带 city 的查询（由接口按 IP 定位）
    await waitFor(() => {
      expect(screen.queryByText("30°")).not.toBeNull();
    });
    const weatherUrl = String(fetchMock.mock.calls[1]![0]);
    expect(weatherUrl).toContain("/misc/weather");
    expect(weatherUrl).not.toContain("city=");
  });

  it("shows a friendly message when the city is not found", async () => {
    fetchMock
      .mockResolvedValueOnce(mockFetchOnce(MYIP_RESPONSE))
      .mockResolvedValueOnce(mockFetchOnce({ code: "NOT_FOUND" }, false));

    render(<WeatherWidget />);

    await waitFor(() => {
      expect(screen.queryByText("未找到该城市")).not.toBeNull();
    });
  });
});
