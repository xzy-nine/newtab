import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActivityWidget } from "@/components/widgets/activity/ActivityWidget";

/**
 * 活动小部件（磁贴）的行为测试。
 *
 * 重点覆盖：没有筛选配置时不筛、固定项常驻且不受到期排序影响、
 * 以及该游戏不支持日程（capabilities 404）时的空态。
 */

/** 构造一个 ISO 时间：相对当前时间偏移若干天。 */
function isoInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function calendarItem(overrides: Record<string, unknown>) {
  return {
    id: "e1",
    kind: "游戏内活动",
    title: "活动 A",
    start: isoInDays(-1),
    end: isoInDays(3),
    all_day: false,
    version: "7.0",
    labels: [],
    url: "https://example.com/a",
    ...overrides,
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("ActivityWidget", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the soonest-expiring activity after loading", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [calendarItem({ title: "七圣召唤·热斗模式", end: isoInDays(3) })],
      }),
    );

    render(<ActivityWidget />);

    await waitFor(() => {
      expect(screen.queryByText("七圣召唤·热斗模式")).not.toBeNull();
    });
    // 3 天后结束 → 显示剩余天数
    expect(screen.queryByText(/剩\s*3\s*天/)).not.toBeNull();
  });

  it("sorts by end time so the most urgent comes first", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 2,
        items: [
          calendarItem({ id: "far", title: "较晚结束", end: isoInDays(9) }),
          calendarItem({ id: "near", title: "最先结束", end: isoInDays(2) }),
        ],
      }),
    );

    render(<ActivityWidget />);

    await waitFor(() => {
      expect(screen.queryByText("最先结束")).not.toBeNull();
    });
    const titles = screen.getAllByText(/最先结束|较晚结束/).map((el) => el.textContent);
    expect(titles).toEqual(["最先结束", "较晚结束"]);
  });

  it("keeps pinned activities visible even when they end far later", async () => {
    // 固定项结束很晚（排序上会垫底），但必须仍然展示
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 3,
        items: [
          calendarItem({ id: "near", title: "最先结束", end: isoInDays(1) }),
          calendarItem({ id: "mid", title: "中间结束", end: isoInDays(2) }),
          calendarItem({ id: "pinned", title: "被固定的活动", end: isoInDays(40) }),
        ],
      }),
    );

    render(<ActivityWidget data={{ pinned: ["pinned"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("被固定的活动")).not.toBeNull();
    });
    // 固定项排在最前，不受常规到期排序影响
    const titles = screen
      .getAllByText(/最先结束|中间结束|被固定的活动/)
      .map((el) => el.textContent);
    expect(titles[0]).toBe("被固定的活动");
  });

  it("shows an empty state when the calendar returns nothing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    render(<ActivityWidget />);

    await waitFor(() => {
      expect(screen.queryByText("暂无活动")).not.toBeNull();
    });
  });

  it("falls back to the error state when every bucket fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, 500));

    render(<ActivityWidget />);

    await waitFor(() => {
      expect(screen.queryByText("活动获取失败")).not.toBeNull();
    });
  });

  it("does not show 角色生日 when a stored selection excludes it", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 2,
        items: [
          calendarItem({ id: "a", title: "正常活动", end: isoInDays(5) }),
          calendarItem({
            id: "b",
            kind: "角色生日",
            title: "重云生日",
            all_day: true,
            start: "2026-09-07",
            end: "2026-09-08",
          }),
        ],
      }),
    );

    render(<ActivityWidget data={{ selected: ["游戏内活动"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("正常活动")).not.toBeNull();
    });
    expect(screen.queryByText("重云生日")).toBeNull();
  });

  it("hides 前瞻特别节目 by default", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 2,
        items: [
          calendarItem({ id: "a", title: "普通活动", end: isoInDays(4) }),
          calendarItem({
            id: "p",
            title: "3.1版本前瞻特别节目",
            labels: ["前瞻特别节目"],
            start: isoInDays(0),
            end: isoInDays(1),
          }),
        ],
      }),
    );

    render(<ActivityWidget data={{ selected: ["游戏内活动"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("普通活动")).not.toBeNull();
    });
    expect(screen.queryByText("3.1版本前瞻特别节目")).toBeNull();
  });

  it("keeps a pinned activity even when its category is filtered out", async () => {
    // 固定是比筛选更具体的意图：取消「游戏内活动」不应把已固定的活动藏掉
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 2,
        items: [
          calendarItem({ id: "pinned", title: "已固定的活动", end: isoInDays(30) }),
          calendarItem({ id: "other", title: "被筛掉的活动", end: isoInDays(2) }),
        ],
      }),
    );

    render(<ActivityWidget data={{ selected: ["卡池"], pinned: ["pinned"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("已固定的活动")).not.toBeNull();
    });
    expect(screen.queryByText("被筛掉的活动")).toBeNull();
  });

  it("requests 星铁 when the widget is configured for sr", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    render(<ActivityWidget data={{ gameId: "sr" }} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.every((url) => url.includes("/api/v1/games/sr/calendar"))).toBe(true);
  });

  it("refetches and swaps the displayed game when gameId changes", async () => {
    // 弹窗里切换游戏后，磁贴必须跟着换数据，而不是继续显示上一个游戏
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [calendarItem({ id: "ys-1", title: "原神活动", end: isoInDays(3) })],
      }),
    );

    const { rerender } = render(<ActivityWidget data={{ gameId: "ys" }} />);
    await waitFor(() => {
      expect(screen.queryByText("原神活动")).not.toBeNull();
    });

    // 切到星铁：重新挂载不同数据
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [calendarItem({ id: "sr-1", kind: "卡池", title: "星铁卡池", end: isoInDays(4) })],
      }),
    );
    rerender(<ActivityWidget data={{ gameId: "sr" }} />);

    await waitFor(() => {
      expect(screen.queryByText("星铁卡池")).not.toBeNull();
    });
    // 旧游戏的数据不能残留
    expect(screen.queryByText("原神活动")).toBeNull();
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/api/v1/games/sr/calendar"))).toBe(true);
  });
});
