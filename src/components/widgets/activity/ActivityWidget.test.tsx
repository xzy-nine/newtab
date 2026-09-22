import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActivityWidget } from "@/components/widgets/activity/ActivityWidget";

/**
 * 活动小部件（磁贴）的行为测试。
 *
 * 磁贴的核心契约（对应外显优化需求 1~4）：
 * 1. `displayGames` 决定外显哪些游戏 —— 可以"一个都不勾选"，也可以只勾一个；
 * 2. 在允许外显的游戏里，优先显示即将截止的，并把距结束 ≤ 3 天的标红；
 * 3. 固定项始终显示，**不受外显勾选影响**（哪怕它所属游戏没被勾选）；
 * 4. 外显与弹窗里"当前查看的游戏"（`gameId`）**无关**。
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

/** 只外显指定游戏的配置（测试里用它把多游戏请求收窄成单游戏）。 */
function only(...games: string[]) {
  return { displayGames: { mode: "custom" as const, games } };
}

/** 该 URL 属于哪个游戏。 */
function gameOf(url: string): string {
  const match = /\/api\/v1\/games\/([^/]+)\/calendar/.exec(url);
  return match?.[1] ?? "";
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

    render(<ActivityWidget data={only("ys")} />);

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

    render(<ActivityWidget data={only("ys")} />);

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

    render(<ActivityWidget data={{ ...only("ys"), pinned: ["pinned"] }} />);

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

    render(<ActivityWidget data={only("ys")} />);

    await waitFor(() => {
      expect(screen.queryByText("暂无活动")).not.toBeNull();
    });
  });

  it("falls back to the error state when every bucket fails", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "boom" }, 500));

    render(<ActivityWidget data={only("ys")} />);

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

    render(<ActivityWidget data={{ ...only("ys"), selected: ["游戏内活动"] }} />);

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

    render(<ActivityWidget data={{ ...only("ys"), selected: ["游戏内活动"] }} />);

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

    render(<ActivityWidget data={{ ...only("ys"), selected: ["卡池"], pinned: ["pinned"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("已固定的活动")).not.toBeNull();
    });
    expect(screen.queryByText("被筛掉的活动")).toBeNull();
  });

  // ───────────── 需求 1 / 4：外显是一份固定列表，可收窄甚至为空 ─────────────

  it("fetches every supported game by default (displayGames 未配置 = 全部外显)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    render(<ActivityWidget />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const games = new Set(
      fetchMock.mock.calls.map((call) => gameOf(String(call[0]))).filter((id) => id !== ""),
    );
    expect(games).toEqual(new Set(["ys", "sr", "zzz"]));
  });

  it("only fetches the selected games and never the others", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    render(<ActivityWidget data={only("sr")} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const games = new Set(
      fetchMock.mock.calls.map((call) => gameOf(String(call[0]))).filter((id) => id !== ""),
    );
    // 只勾选星铁 → 绝不能请求原神/绝区零（这是"不显示某个游戏"的实现基础）
    expect(games).toEqual(new Set(["sr"]));
  });

  it("does not fetch or render any game when nothing is selected", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ total: 0, items: [] }));

    render(<ActivityWidget data={only()} />);

    await waitFor(() => {
      expect(screen.queryByText("未勾选外显游戏")).not.toBeNull();
    });
    const calendarCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes("/calendar"),
    );
    expect(calendarCalls).toHaveLength(0);
  });

  it("ignores the popup's current game and keeps showing only the display games", async () => {
    // 需求 4：弹窗里切到星铁，磁贴不应跟着换；它只认 displayGames
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const game = gameOf(String(input));
      return jsonResponse({
        total: 1,
        items: [calendarItem({ id: `${game}-1`, title: `${game} 的活动`, end: isoInDays(3) })],
      });
    });

    const { rerender } = render(<ActivityWidget data={{ ...only("ys"), gameId: "ys" }} />);
    await waitFor(() => {
      expect(screen.queryByText("ys 的活动")).not.toBeNull();
    });

    // 只改弹窗查看的游戏，displayGames 不变
    rerender(<ActivityWidget data={{ ...only("ys"), gameId: "sr" }} />);

    // 磁贴仍只显示原神的活动
    await waitFor(() => {
      expect(screen.queryByText("sr 的活动")).toBeNull();
    });
    expect(screen.queryByText("ys 的活动")).not.toBeNull();
  });

  it("follows displayGames changes and drops the previous game's data", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const game = gameOf(String(input));
      return jsonResponse({
        total: 1,
        items: [calendarItem({ id: `${game}-1`, title: `${game} 的活动`, end: isoInDays(3) })],
      });
    });

    const { rerender } = render(<ActivityWidget data={only("ys")} />);
    await waitFor(() => {
      expect(screen.queryByText("ys 的活动")).not.toBeNull();
    });

    rerender(<ActivityWidget data={only("sr")} />);

    await waitFor(() => {
      expect(screen.queryByText("sr 的活动")).not.toBeNull();
    });
    // 旧游戏的数据不能残留
    expect(screen.queryByText("ys 的活动")).toBeNull();
  });

  // ───────────── 需求 2：优先显示即将截止的并标红 ─────────────

  it("marks activities ending within 3 days as urgent", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 2,
        items: [
          calendarItem({ id: "soon", title: "马上截止", end: isoInDays(2) }),
          calendarItem({ id: "later", title: "还早", end: isoInDays(20) }),
        ],
      }),
    );

    const { container } = render(<ActivityWidget data={only("ys")} />);

    await waitFor(() => {
      expect(screen.queryByText("马上截止")).not.toBeNull();
    });
    const urgentRows = Array.from(container.querySelectorAll(".activity-widget-item.is-urgent"));
    expect(urgentRows).toHaveLength(1);
    expect(urgentRows[0]!.textContent).toContain("马上截止");
    // 表头徽标给出紧急条数
    expect(container.querySelector(".activity-widget-urgent-count")!.textContent).toBe("1");
  });

  it("does not mark an ended pinned activity as urgent", async () => {
    // 固定项可能早已结束；标红会把"已结束"误读成"还要到期"
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [
          calendarItem({ id: "old", title: "早已结束", start: isoInDays(-30), end: isoInDays(-2) }),
        ],
      }),
    );

    const { container } = render(<ActivityWidget data={{ ...only("ys"), pinned: ["old"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("早已结束")).not.toBeNull();
    });
    expect(container.querySelector(".activity-widget-item.is-urgent")).toBeNull();
  });

  // ───────────── 需求 3：固定的始终显示 ─────────────

  it("still shows pinned activities whose game is not selected for display", async () => {
    // 需求 3 的关键场景：取消勾选星铁，但星铁里已固定的活动必须继续显示
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const game = gameOf(String(input));
      return jsonResponse({
        total: 1,
        items: [calendarItem({ id: `${game}-pinned`, title: `${game} 固定项`, end: isoInDays(9) })],
      });
    });

    render(<ActivityWidget data={{ ...only("ys"), pinned: { sr: ["sr-pinned"] } }} />);

    await waitFor(() => {
      expect(screen.queryByText("sr 固定项")).not.toBeNull();
    });
    // 该游戏未被勾选，因此仍要单独为它取数，否则固定项取不到
    const games = new Set(
      fetchMock.mock.calls.map((call) => gameOf(String(call[0]))).filter((id) => id !== ""),
    );
    expect(games).toEqual(new Set(["ys", "sr"]));
  });

  it("shows pinned activities only when no game is selected", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [calendarItem({ id: "keep", title: "常驻固定项", end: isoInDays(50) })],
      }),
    );

    render(<ActivityWidget data={{ ...only(), pinned: { ys: ["keep"] } }} />);

    await waitFor(() => {
      expect(screen.queryByText("常驻固定项")).not.toBeNull();
    });
    // 表头明确提示当前是"仅固定"
    expect(screen.queryByText("仅固定")).not.toBeNull();
  });

  it("migrates a legacy flat pinned array to the default game", async () => {
    // 旧版本 data.pinned 是一维数组：升级后固定项不能丢
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [calendarItem({ id: "legacy", title: "旧版固定项", end: isoInDays(30) })],
      }),
    );

    render(<ActivityWidget data={{ ...only("ys"), pinned: ["legacy"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("旧版固定项")).not.toBeNull();
    });
  });

  it("keeps a pinned activity urgent when it is also expiring soon", async () => {
    // 固定 + 即将截止同时成立：两个 class 都要在，
    // 样式层靠 `.is-pinned-row:not(.is-urgent)` 保证红底不被灰底覆盖
    fetchMock.mockResolvedValue(
      jsonResponse({
        total: 1,
        items: [calendarItem({ id: "both", title: "固定且紧急", end: isoInDays(1) })],
      }),
    );

    const { container } = render(<ActivityWidget data={{ ...only("ys"), pinned: ["both"] }} />);

    await waitFor(() => {
      expect(screen.queryByText("固定且紧急")).not.toBeNull();
    });
    const row = container.querySelector(".activity-widget-item")!;
    expect(row.classList.contains("is-pinned-row")).toBe(true);
    expect(row.classList.contains("is-urgent")).toBe(true);
  });

  it("labels each row with its game so aggregated rows stay readable", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const game = gameOf(String(input));
      return jsonResponse({
        total: 1,
        items: [calendarItem({ id: `${game}-1`, title: `${game} 活动`, end: isoInDays(6) })],
      });
    });

    const { container } = render(<ActivityWidget data={only("ys", "zzz")} />);

    await waitFor(() => {
      expect(screen.queryByText("ys 活动")).not.toBeNull();
    });
    // 简称标签（星铁/绝区零），而不是占宽的全名
    const tags = Array.from(container.querySelectorAll(".activity-widget-game-tag")).map(
      (el) => el.textContent,
    );
    expect(tags).toEqual(["原神", "绝区零"]);
  });
});
