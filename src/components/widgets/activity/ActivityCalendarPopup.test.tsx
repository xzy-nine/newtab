import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ActivityCalendarPopup } from "@/components/widgets/activity/ActivityCalendarPopup";

/**
 * 活动弹窗的行为测试。
 *
 * 重点覆盖三条与 API 语义强相关的路径：
 * 1. capabilities 404（如崩坏3）→ "该游戏暂无日程"空态，而不是报错；
 * 2. 前瞻只画起点（点标记）而非零宽条；
 * 3. 父子两级筛选：父级被选中时其子级显示为选中。
 *
 * 另外钉住两个已修复的交互缺陷：
 * 4. 切换游戏必须就地生效，且**不能卡在"加载中"**（曾因等待父级回灌 gameId 而卡死）；
 * 5. 迟到的旧请求结果不能覆盖新游戏的数据。
 */

const CAPABILITIES_YS = {
  json: "/api/v1/games/ys/calendar",
  ics: "/api/v1/games/ys/calendar.ics",
  selectors: [
    {
      value: "游戏内活动",
      label: "游戏内活动",
      children: [{ value: "游戏内活动:七圣召唤", label: "七圣召唤" }],
    },
    { value: "版本日程", label: "版本日程", children: [] },
  ],
};

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function calendarItem(overrides: Record<string, unknown>) {
  return {
    id: "e1",
    kind: "游戏内活动",
    title: "活动 A",
    start: isoInDays(-1),
    end: isoInDays(5),
    all_day: false,
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

/** 按 URL 分派响应：capabilities 与 calendar 走不同分支。 */
function routeFetch(handlers: { capabilities?: Response; calendar?: Response }) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/capabilities")) {
      return handlers.capabilities ?? jsonResponse(CAPABILITIES_YS);
    }
    return handlers.calendar ?? jsonResponse({ total: 0, items: [] });
  });
}

describe("ActivityCalendarPopup", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the unavailable state when capabilities 404s", async () => {
    // 崩坏3 / 未定事件簿等游戏实测返回 404 "calendar is not available"
    fetchMock.mockImplementation(
      routeFetch({ capabilities: jsonResponse({ message: "not available" }, 404) }),
    );

    render(<ActivityCalendarPopup data={{ gameId: "bh3" }} />);

    await waitFor(() => {
      expect(screen.queryByText("该游戏暂无日程")).not.toBeNull();
    });
    // 不应落到通用错误态
    expect(screen.queryByText("活动获取失败")).toBeNull();
  });

  it("renders the two-level filter tree and marks children selected with the parent", async () => {
    fetchMock.mockImplementation(routeFetch({}));

    const { container } = render(<ActivityCalendarPopup data={{}} />);

    await waitFor(() => {
      expect(screen.queryByText("游戏内活动")).not.toBeNull();
    });
    // 子级也被渲染出来（缩进一级）
    expect(screen.queryByText("七圣召唤")).not.toBeNull();
    expect(screen.queryByText("版本日程")).not.toBeNull();

    // 只看筛选树内的复选框：默认全选 → 父与子都应 checked。
    // （不能断言整个筛选区：其中还含"前瞻只显示起点"开关，它默认未选）
    const groups = container.querySelectorAll(".activity-calendar-filter-group");
    const checkboxes = Array.from(groups).flatMap((group) =>
      Array.from(group.querySelectorAll('[role="checkbox"]')),
    );
    expect(checkboxes.length).toBe(3);
    const states = checkboxes.map((box) => box.getAttribute("data-state"));
    expect(states).toEqual(["checked", "checked", "checked"]);
  });

  it("lists ongoing activities with a status badge", async () => {
    fetchMock.mockImplementation(
      routeFetch({
        calendar: jsonResponse({
          total: 1,
          items: [calendarItem({ title: "进行中的活动", end: isoInDays(5) })],
        }),
      }),
    );

    render(<ActivityCalendarPopup data={{ view: "list" }} />);

    await waitFor(() => {
      expect(screen.queryByText("进行中的活动")).not.toBeNull();
    });
    expect(screen.queryByText("进行中")).not.toBeNull();
  });

  it("draws 前瞻特别节目 as a point when point mode is enabled", async () => {
    fetchMock.mockImplementation(
      routeFetch({
        calendar: jsonResponse({
          total: 1,
          items: [
            calendarItem({
              id: "p",
              kind: "版本日程",
              title: "3.1版本前瞻特别节目",
              labels: ["前瞻特别节目"],
              start: isoInDays(1),
              end: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 1000).toISOString(),
            }),
          ],
        }),
      }),
    );

    const { container } = render(
      <ActivityCalendarPopup data={{ preview: "point", view: "gantt" }} />,
    );

    await waitFor(() => {
      expect(container.querySelector(".activity-gantt-bar.is-point")).not.toBeNull();
    });
    // 点标记而非实心条：宽度为 0 的条会完全不可见
    expect(container.querySelector(".activity-gantt-bar:not(.is-point)")).toBeNull();
  });

  it("hides 前瞻 by default in gantt view", async () => {
    fetchMock.mockImplementation(
      routeFetch({
        calendar: jsonResponse({
          total: 1,
          items: [
            calendarItem({
              id: "p",
              kind: "版本日程",
              title: "3.1版本前瞻特别节目",
              labels: ["前瞻特别节目"],
              start: isoInDays(1),
              end: isoInDays(1.1),
            }),
          ],
        }),
      }),
    );

    const { container } = render(<ActivityCalendarPopup data={{ view: "gantt" }} />);

    await waitFor(() => {
      expect(screen.queryByText("暂无活动")).not.toBeNull();
    });
    expect(container.querySelector(".activity-gantt-bar.is-point")).toBeNull();
  });

  it("renders a weekly axis, a today marker and time-spanning bars", async () => {
    // 关键区别：条的宽度是真实时间跨度，并且横轴按整周分块、有贯穿的今天线
    fetchMock.mockImplementation(
      routeFetch({
        calendar: jsonResponse({
          total: 2,
          items: [
            calendarItem({
              id: "overlap-1",
              title: "重叠活动甲",
              start: isoInDays(1),
              end: isoInDays(10),
            }),
            calendarItem({
              id: "overlap-2",
              title: "重叠活动乙",
              start: isoInDays(3),
              end: isoInDays(8),
            }),
          ],
        }),
      }),
    );

    const { container } = render(<ActivityCalendarPopup data={{ view: "gantt" }} />);

    await waitFor(() => {
      expect(container.querySelectorAll(".activity-gantt-bar:not(.is-point)").length).toBe(2);
    });

    // 周分块横轴 + 周序号/区间标签
    const weeks = container.querySelectorAll(".activity-gantt-week");
    expect(weeks.length).toBeGreaterThanOrEqual(1);
    expect(container.querySelector(".activity-gantt-week-index")!.textContent).toContain("第 1 周");
    expect(container.querySelector(".activity-gantt-week-range")!.textContent).toMatch(
      /^\d{2}\/\d{2}-\d{2}\/\d{2}$/,
    );

    // 贯穿全高的今天线 + 标签
    expect(container.querySelector(".activity-gantt-today")).not.toBeNull();
    expect(screen.getByText(/今天/)).not.toBeNull();

    // 两个活动时间上重叠 → 必须分到不同泳道（纵向错开），否则会互相压住
    const bars = Array.from(
      container.querySelectorAll<HTMLElement>(".activity-gantt-bar:not(.is-point)"),
    );
    const tops = bars.map((bar) => bar.style.top);
    expect(new Set(tops).size).toBe(2);

    // 条宽是真实跨度：更长的活动应更宽
    const widths = bars.map((bar) => Number.parseFloat(bar.style.width));
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
  });

  it("shares one lane when activities do not overlap", async () => {
    fetchMock.mockImplementation(
      routeFetch({
        calendar: jsonResponse({
          total: 2,
          items: [
            calendarItem({
              id: "seq-1",
              title: "先发生的",
              start: isoInDays(1),
              end: isoInDays(3),
            }),
            calendarItem({
              id: "seq-2",
              title: "后发生的",
              start: isoInDays(5),
              end: isoInDays(7),
            }),
          ],
        }),
      }),
    );

    const { container } = render(<ActivityCalendarPopup data={{ view: "gantt" }} />);

    await waitFor(() => {
      expect(container.querySelectorAll(".activity-gantt-bar:not(.is-point)").length).toBe(2);
    });
    // 互不重叠 → 共用同一泳道（top 相同），行数不浪费
    const tops = Array.from(
      container.querySelectorAll<HTMLElement>(".activity-gantt-bar:not(.is-point)"),
    ).map((bar) => bar.style.top);
    expect(new Set(tops).size).toBe(1);
  });

  it("uses a monthly axis for a half-year span and a weekly one for short spans", async () => {
    fetchMock.mockImplementation(routeFetch({}));

    const { container, unmount } = render(
      <ActivityCalendarPopup data={{ view: "gantt", days: 180 }} />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll(".activity-gantt-week").length).toBeGreaterThan(0);
    });
    const labels = Array.from(container.querySelectorAll(".activity-gantt-week-index")).map(
      (el) => el.textContent,
    );
    // 月粒度：标签形如「9月」，而不是「第 N 周」
    expect(labels.some((text) => /^\d{1,2}月$/.test(text ?? ""))).toBe(true);
    expect(labels.some((text) => (text ?? "").startsWith("第 "))).toBe(false);
    // 半年若用周块会有 26 块；月块应远少于此
    expect(labels.length).toBeLessThanOrEqual(10);
    unmount();

    // 短跨度仍是周粒度
    const { container: shortContainer } = render(
      <ActivityCalendarPopup data={{ view: "gantt", days: 14 }} />,
    );
    await waitFor(() => {
      expect(shortContainer.querySelectorAll(".activity-gantt-week").length).toBeGreaterThan(0);
    });
    const shortLabels = Array.from(
      shortContainer.querySelectorAll(".activity-gantt-week-index"),
    ).map((el) => el.textContent);
    expect(shortLabels.some((text) => (text ?? "").startsWith("第 "))).toBe(true);
  });

  it("clips the first month block to the window edge", async () => {
    fetchMock.mockImplementation(routeFetch({}));

    const { container } = render(<ActivityCalendarPopup data={{ view: "gantt", days: 180 }} />);

    await waitFor(() => {
      expect(container.querySelectorAll(".activity-gantt-week").length).toBeGreaterThan(0);
    });
    const weeks = Array.from(container.querySelectorAll<HTMLElement>(".activity-gantt-week"));
    const widths = weeks.map((el) => Number.parseFloat(el.style.width));
    // 首块从月中开始，必然比后续整月窄
    expect(widths[0]!).toBeLessThan(widths[1]!);
    // 首块紧贴窗口左边界
    expect(Number.parseFloat(weeks[0]!.style.left)).toBe(0);
  });

  it("switches game data in place without waiting for the parent to feed gameId back", async () => {
    // 回归：曾经这里会卡在"加载中"——弹窗清空了自己的状态，
    // 却只依赖父级回灌新 gameId 来触发重新加载；父级没回灌就永久卡住。
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const game = url.includes("/sr/") ? "sr" : "ys";
      if (url.includes("/capabilities")) {
        return jsonResponse({
          json: `/api/v1/games/${game}/calendar`,
          ics: `/api/v1/games/${game}/calendar.ics`,
          selectors: [{ value: "游戏内活动", label: "游戏内活动", children: [] }],
        });
      }
      return jsonResponse({
        total: 1,
        items: [calendarItem({ id: `${game}-1`, title: `${game} 的活动` })],
      });
    });

    // onDataChange 刻意留空：模拟父级未能回灌
    render(<ActivityCalendarPopup data={{ gameId: "ys" }} onDataChange={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("ys 的活动")).not.toBeNull();
    });

    fireEvent.click(screen.getByText("崩坏：星穹铁道"));

    // 必须就地切到新游戏
    await waitFor(
      () => {
        expect(screen.queryByText("sr 的活动")).not.toBeNull();
      },
      { timeout: 3000 },
    );
    // 且绝不能停在"加载中"
    expect(screen.queryByText("加载中...")).toBeNull();
  });

  it("discards a late response from the previously selected game", async () => {
    // 回归：切游戏时旧游戏的慢响应若后到，不能覆盖新游戏的数据。
    let resolveYs!: (value: Response) => void;
    const ysCalendar = new Promise<Response>((resolve) => {
      resolveYs = resolve;
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/capabilities")) {
        const game = url.includes("/sr/") ? "sr" : "ys";
        return jsonResponse({
          json: `/api/v1/games/${game}/calendar`,
          ics: `/api/v1/games/${game}/calendar.ics`,
          selectors: [{ value: "游戏内活动", label: "游戏内活动", children: [] }],
        });
      }
      // 原神日程延迟返回，模拟慢响应
      if (url.includes("/ys/")) return ysCalendar;
      return jsonResponse({
        total: 1,
        items: [calendarItem({ id: "sr-1", title: "sr 的活动" })],
      });
    });

    render(<ActivityCalendarPopup data={{ gameId: "ys" }} onDataChange={() => {}} />);

    // 趁原神日程还没回来就切到星铁
    await waitFor(() => {
      expect(screen.queryByText("崩坏：星穹铁道")).not.toBeNull();
    });
    fireEvent.click(screen.getByText("崩坏：星穹铁道"));

    await waitFor(
      () => {
        expect(screen.queryByText("sr 的活动")).not.toBeNull();
      },
      { timeout: 3000 },
    );

    // 此时原神的旧响应才到达，必须被丢弃
    resolveYs(
      jsonResponse({
        total: 1,
        items: [calendarItem({ id: "ys-1", title: "ys 的活动（迟到）" })],
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("ys 的活动（迟到）")).toBeNull();
    expect(screen.queryByText("sr 的活动")).not.toBeNull();
  });
});
