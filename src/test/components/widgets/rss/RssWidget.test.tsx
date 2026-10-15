import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RssWidget } from "@/components/widgets/rss/RssWidget";
import { RssFeedPopup } from "@/components/widgets/rss/RssFeedPopup";
import { DEFAULT_FEED_URL } from "@/components/widgets/rss/rss";

/**
 * RSS 小部件的渲染测试。
 *
 * 覆盖：默认订阅地址生效、磁贴摘要渲染、弹窗完整列表渲染，
 * 以及接口失败时的错误提示。
 */

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>DeepSeek</title>
    <link>https://status.deepseek.com</link>
    <description>Status updates for DeepSeek</description>
    <item>
      <title>DeepSeek 网页/API 部分中断</title>
      <link>https://status.deepseek.com/incidents/1</link>
      <description>&lt;p&gt;已定位原因，正在实施修复。&lt;/p&gt;</description>
      <guid>urn:flashduty:change:1</guid>
      <pubDate>Thu, 15 Oct 2026 08:11:35 +0800</pubDate>
    </item>
    <item>
      <title>DeepSeek API 性能下降</title>
      <link>https://status.deepseek.com/incidents/2</link>
      <description>&lt;p&gt;本次问题已解决。&lt;/p&gt;</description>
      <guid>urn:flashduty:change:2</guid>
      <pubDate>Mon, 12 Oct 2026 14:42:23 +0800</pubDate>
    </item>
  </channel>
</rss>`;

function textResponse(body: string, ok = true, status = ok ? 200 : 500) {
  return { ok, status, text: async () => body } as unknown as Response;
}

describe("RssWidget", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("subscribes to the DeepSeek status feed by default", async () => {
    fetchMock.mockResolvedValue(textResponse(FEED_XML));

    render(<RssWidget />);

    expect(String(fetchMock.mock.calls[0]![0])).toBe(DEFAULT_FEED_URL);
    await waitFor(() => {
      expect(screen.queryByText("DeepSeek 网页/API 部分中断")).not.toBeNull();
    });
    expect(screen.queryByText("DeepSeek")).not.toBeNull();
  });

  it("uses the configured URL from the widget data", async () => {
    fetchMock.mockResolvedValue(textResponse(FEED_XML));

    render(<RssWidget data={{ url: "https://example.com/feed" }} />);

    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://example.com/feed");
  });

  it("requests the network on every mount instead of trusting a fresh window", async () => {
    fetchMock.mockResolvedValue(textResponse(FEED_XML));
    render(<RssWidget />);
    await waitFor(() => {
      expect(screen.queryByText("DeepSeek")).not.toBeNull();
    });

    fetchMock.mockClear();
    render(<RssWidget />);

    // 上一次成功的内容已在本地，但挂载仍必须联网，避免展示上一轮的"当前状态"
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(DEFAULT_FEED_URL);
  });

  it("shows the fallback snapshot with a stale marker when the refresh fails", async () => {
    // 缓存存在的唯一意义：远程故障时降级为"内容可能不新"，而不是空磁贴
    fetchMock.mockResolvedValue(textResponse(FEED_XML));
    render(<RssWidget />);
    await waitFor(() => {
      expect(screen.queryByText("DeepSeek")).not.toBeNull();
    });

    fetchMock.mockRejectedValue(new Error("network down"));
    const { container } = render(<RssWidget />);

    // 旧条目仍在展示，而不是被清空成错误态
    await waitFor(() => {
      expect(screen.queryAllByText("DeepSeek API 性能下降").length).toBeGreaterThan(0);
    });
    // 同时给出"可能不新"的标记，避免用户误当成当前状态
    await waitFor(() => {
      expect(container.querySelector(".rss-widget-stale")).not.toBeNull();
    });
    // 不再展示"订阅获取失败"（有内容可降级时不该挡在错误态上）
    expect(screen.queryAllByText("订阅获取失败").length).toBe(0);
  });

  it("marks the popup entries as possibly out of date", async () => {
    fetchMock.mockResolvedValue(textResponse(FEED_XML));
    const first = render(<RssFeedPopup data={{ url: DEFAULT_FEED_URL }} />);
    await waitFor(() => {
      expect(screen.queryByText("DeepSeek API 性能下降")).not.toBeNull();
    });
    first.unmount();

    fetchMock.mockRejectedValue(new Error("network down"));
    render(<RssFeedPopup data={{ url: DEFAULT_FEED_URL }} />);

    await waitFor(() => {
      expect(screen.queryByText("刷新失败，内容可能不是最新")).not.toBeNull();
    });
    // 条目仍在
    expect(screen.queryByText("DeepSeek API 性能下降")).not.toBeNull();
  });

  it("shows an error state when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    render(<RssWidget />);

    await waitFor(() => {
      expect(screen.queryByText("订阅获取失败")).not.toBeNull();
    });
  });

  it("shows the empty state for a feed without entries", async () => {
    fetchMock.mockResolvedValue(
      textResponse(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>空</title><link>https://e.com</link><description>d</description></channel></rss>`,
      ),
    );

    render(<RssWidget />);

    await waitFor(() => {
      expect(screen.queryByText("暂无更新")).not.toBeNull();
    });
  });
});

describe("RssFeedPopup", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists every entry with its summary", async () => {
    fetchMock.mockResolvedValue(textResponse(FEED_XML));

    render(<RssFeedPopup data={{ url: DEFAULT_FEED_URL }} />);

    await waitFor(() => {
      expect(screen.queryByText("DeepSeek API 性能下降")).not.toBeNull();
    });
    expect(screen.queryByText("已定位原因，正在实施修复。")).not.toBeNull();
    expect(screen.queryByText("共 2 条")).not.toBeNull();
    // 订阅地址回填到输入框
    expect((screen.getByDisplayValue(DEFAULT_FEED_URL) as HTMLInputElement).value).toBe(
      DEFAULT_FEED_URL,
    );
  });

  it("persists a new subscription URL", async () => {
    fetchMock.mockResolvedValue(textResponse(FEED_XML));
    const onDataChange = vi.fn();

    render(<RssFeedPopup data={{ url: DEFAULT_FEED_URL }} onDataChange={onDataChange} />);

    await waitFor(() => {
      expect(screen.queryByText("DeepSeek API 性能下降")).not.toBeNull();
    });

    const input = screen.getByDisplayValue(DEFAULT_FEED_URL) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "https://example.com/feed" } });
    fireEvent.click(screen.getByText("订阅"));

    await waitFor(() => {
      expect(onDataChange).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://example.com/feed" }),
      );
    });
  });
});
