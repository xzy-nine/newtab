import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WeatherWidget } from "@/components/widgets/weather/WeatherWidget";

/** 手动修改地点这条链路的回归测试。 */

/** 按请求 URL 里的 city 返回对应天气，避免依赖调用次序。 */
const TEMPERATURES: Record<string, number> = { 北京: 27, 上海: 33, 广州: 31 };

function makeFetch() {
  return vi.fn(async (url: string) => {
    const parsed = new URL(String(url));
    const city = parsed.searchParams.get("city") ?? "北京";
    return {
      ok: true,
      status: 200,
      json: async () => ({
        province: city,
        city,
        weather: "晴",
        weather_icon: "100",
        temperature: TEMPERATURES[city] ?? 20,
      }),
    } as Response;
  });
}

const storedData = (city: string) => ({
  city,
  // 过期时间戳：让挂载时先拉一次，与真实使用一致
  updatedAt: 0,
  snapshot: {
    province: city,
    city,
    weather: "晴",
    weatherIcon: "100",
    temperature: TEMPERATURES[city] ?? 20,
  },
});

/** 点开地点编辑框并输入新城市。 */
function typeCity(city: string) {
  fireEvent.click(screen.getByTitle("点击修改城市"));
  const input = screen.getByPlaceholderText("城市，如 北京") as HTMLInputElement;
  fireEvent.change(input, { target: { value: city } });
  return input;
}

/** 取出发往天气接口的城市参数（忽略挂载时的首次请求）。 */
function requestedCities(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .map((c) => new URL(String(c[0])).searchParams.get("city"))
    .filter((c): c is string => Boolean(c));
}

describe("WeatherWidget 手动修改地点", () => {
  let fetchMock: ReturnType<typeof makeFetch>;

  beforeEach(() => {
    fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the weather for a city the user types and persists it", async () => {
    const changes: Record<string, unknown>[] = [];
    render(<WeatherWidget data={storedData("北京")} onDataChange={(d) => changes.push(d)} />);

    // 挂载时先按已存城市拉取
    await waitFor(() => expect(screen.queryByText("27°")).not.toBeNull());

    const input = typeCity("上海");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByText("33°")).not.toBeNull();
    });
    // 必须真的请求了新城市，且落库
    expect(requestedCities(fetchMock)).toContain("上海");
    expect(changes.at(-1)).toMatchObject({ city: "上海" });
  });

  it("commits the typed city on blur", async () => {
    render(<WeatherWidget data={storedData("北京")} />);
    await waitFor(() => expect(screen.queryByText("27°")).not.toBeNull());

    const input = typeCity("广州");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByText("31°")).not.toBeNull();
    });
    expect(requestedCities(fetchMock)).toContain("广州");
  });

  it("shows the new city name after a successful change", async () => {
    render(<WeatherWidget data={storedData("北京")} />);
    await waitFor(() => expect(screen.queryByText("27°")).not.toBeNull());

    const input = typeCity("上海");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByText("上海")).not.toBeNull();
    });
  });

  it("abandons the edit on Escape without firing a request", async () => {
    render(<WeatherWidget data={storedData("北京")} />);
    await waitFor(() => expect(screen.queryByText("27°")).not.toBeNull());
    const before = fetchMock.mock.calls.length;

    const input = typeCity("上海");
    fireEvent.keyDown(input, { key: "Escape" });

    expect(fetchMock.mock.calls.length).toBe(before);
    expect(screen.queryByText("北京")).not.toBeNull();
  });
});
