import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WeatherWidget } from "@/components/widgets/weather/WeatherWidget";

/**
 * 天气小部件的行为测试。
 *
 * 重点覆盖：无已存城市时由天气接口自身按 IP 定位（不再单独调用 myip），
 * 已存/用户设置城市的优先级，以及接口失败时的错误提示。
 */

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

/** `uapiFetch` 通过 status / text() / headers 读取响应。 */
function mockFetchOnce(payload: unknown, ok = true, status = ok ? 200 : 404) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
    headers: new Headers(),
  } as unknown as Response;
}

describe("WeatherWidget", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    // 天气请求现在会写入 localStorage 缓存，必须在用例间清理，否则会互相干扰
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the API to geolocate by IP, then shows the returned city", async () => {
    // 不再单独调用 /network/myip：天气接口自身会在无 city 时按 IP 定位
    fetchMock.mockResolvedValueOnce(mockFetchOnce(WEATHER_RESPONSE));

    render(<WeatherWidget />);

    await waitFor(() => {
      expect(screen.queryByText("30°")).not.toBeNull();
    });

    // 只发一次请求，且不带 city（由服务端定位）
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const weatherUrl = String(fetchMock.mock.calls[0]![0]);
    expect(weatherUrl).toContain("/misc/weather");
    expect(weatherUrl).not.toContain("city=");
    expect(weatherUrl).not.toContain("myip");

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

  it("keeps the existing snapshot when the refresh fails", async () => {
    // 需求：远端未返回时保持当前（可能已过期的）数据，不把界面清空
    fetchMock.mockResolvedValueOnce(mockFetchOnce(WEATHER_RESPONSE));
    const { rerender } = render(<WeatherWidget data={{ city: "北京" }} />);
    await waitFor(() => expect(screen.queryByText("30°")).not.toBeNull());

    // 刷新失败：接口直接报错
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    rerender(<WeatherWidget data={{ city: "北京", cityIsUserSet: true }} />);

    await waitFor(() => {
      // 旧数据仍在，没有被清空
      expect(screen.queryByText("30°")).not.toBeNull();
    });
  });

  it("shows the configured city rather than the API's coarser echo", async () => {
    // 用户设置「某某」，接口按城市名查询只回上层名「重庆城区」
    fetchMock.mockResolvedValueOnce(
      mockFetchOnce({
        province: "重庆市",
        city: "重庆城区",
        weather: "阴",
        weather_icon: "104",
        temperature: 21,
      }),
    );

    render(<WeatherWidget data={{ city: "某某" }} />);

    await waitFor(() => {
      expect(screen.queryByText("21°")).not.toBeNull();
    });
    // 磁贴显示用户设置的名字，与展开弹窗保持一致
    expect(screen.queryByText("某某")).not.toBeNull();
    expect(screen.queryByText("重庆城区")).toBeNull();
  });

  it("falls back to the finest API name when no city is configured", async () => {
    // 无已存城市：接口按 IP 定位，返回 district 时应展示最细粒度地名
    fetchMock.mockResolvedValue(
      mockFetchOnce({
        province: "重庆市",
        city: "重庆城区",
        district: "某某区",
        weather: "阴",
        weather_icon: "104",
        temperature: 21,
      }),
    );

    render(<WeatherWidget />);

    await waitFor(() => {
      expect(screen.queryByText("某某区")).not.toBeNull();
    });
  });

  it("shows a friendly message when the city is not found", async () => {
    // 404 不可重试，直接落到「未找到该城市」
    fetchMock.mockResolvedValueOnce(
      mockFetchOnce({ code: "NOT_FOUND", message: "未找到该城市的天气数据" }, false, 404),
    );

    render(<WeatherWidget />);

    await waitFor(() => {
      expect(screen.queryByText("未找到该城市")).not.toBeNull();
    });
    // 不可重试：只尝试一次
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders the alert icon and name for an alert code", async () => {
    // 预警代码不在常规天气图标表里，需要按预警代码表映射
    fetchMock.mockResolvedValueOnce(
      mockFetchOnce({
        province: "Florida",
        city: "迈阿密",
        weather: "极端火灾危险",
        weather_icon: "2414",
        temperature: 34,
      }),
    );

    render(<WeatherWidget data={{ city: "迈阿密" }} />);

    await waitFor(() => {
      expect(screen.queryByText("34°")).not.toBeNull();
    });
    expect(screen.queryByText("🔥")).not.toBeNull();
    expect(screen.queryByText("极端火灾危险(美)")).not.toBeNull();
  });
});
