import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { format } from "date-fns";
import {
  DEFAULT_FEED_URL,
  MAX_ENTRIES,
  RssError,
  extractStatus,
  feedTimeLabel,
  fetchFeed,
  htmlToParagraphs,
  normalizeFeedUrl,
  parseFeedDocument,
  readCachedSnapshot,
  readFeedKind,
  readFeedUrl,
  stripHtmlToText,
  tileEntryLimit,
} from "@/components/widgets/rss/rss";

/**
 * RSS 小部件的解析与取数测试。
 *
 * 覆盖：feedsmith 解析后的归一化（RSS / Atom / JSON Feed）、HTML 转纯文本、
 * 默认订阅地址、按地址缓存与 TTL 取数、以及错误分类。
 */

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>DeepSeek</title>
    <link>https://status.deepseek.com</link>
    <description>Status updates for DeepSeek</description>
    <item>
      <title>DeepSeek 网页/API 部分中断</title>
      <link>https://status.deepseek.com/incidents/7116348214287</link>
      <description>&lt;p&gt;&lt;strong&gt;Status:&lt;/strong&gt; identified&lt;/p&gt;&lt;p&gt;已定位原因，正在实施修复。&#xA;&#xA;The cause has been identified and a fix is being implemented.&lt;/p&gt;</description>
      <guid>urn:flashduty:change:7116348214287</guid>
      <pubDate>Thu, 15 Oct 2026 08:11:35 +0800</pubDate>
    </item>
    <item>
      <title>DeepSeek API 性能下降</title>
      <link>https://status.deepseek.com/incidents/7104277696287</link>
      <description>&lt;p&gt;&lt;strong&gt;Status:&lt;/strong&gt; resolved&lt;/p&gt;&lt;p&gt;本次问题已解决，服务已恢复。&lt;/p&gt;</description>
      <guid>urn:flashduty:change:7104277696287</guid>
      <pubDate>Mon, 12 Oct 2026 14:42:23 +0800</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom 示例</title>
  <link href="https://example.com/"/>
  <subtitle>示例订阅</subtitle>
  <updated>2026-10-15T01:00:00Z</updated>
  <entry>
    <title>第一条</title>
    <link href="https://example.com/1"/>
    <id>tag:example.com,2026:1</id>
    <updated>2026-10-15T00:00:00Z</updated>
    <summary>正文 &lt;b&gt;加粗&lt;/b&gt;</summary>
  </entry>
</feed>`;

const JSON_FEED = JSON.stringify({
  version: "https://jsonfeed.org/version/1.1",
  title: "JSON 示例",
  home_page_url: "https://example.com/",
  items: [
    {
      id: "1",
      url: "https://example.com/j1",
      title: "JSON 第一条",
      content_text: "正文内容",
      date_published: "2026-10-14T00:00:00Z",
    },
  ],
});

function textResponse(body: string, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    text: async () => body,
  } as unknown as Response;
}

describe("normalizeFeedUrl", () => {
  it("accepts http(s) URLs and trims whitespace", () => {
    expect(normalizeFeedUrl("  https://status.deepseek.com/feed.rss ")).toBe(
      "https://status.deepseek.com/feed.rss",
    );
    expect(normalizeFeedUrl("http://example.com/feed")).toBe("http://example.com/feed");
  });

  it("rejects non-http protocols and non-strings", () => {
    expect(normalizeFeedUrl("ftp://example.com/feed")).toBeNull();
    expect(normalizeFeedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeFeedUrl("not a url")).toBeNull();
    expect(normalizeFeedUrl("")).toBeNull();
    expect(normalizeFeedUrl(undefined)).toBeNull();
    expect(normalizeFeedUrl(42)).toBeNull();
  });
});

describe("readFeedUrl", () => {
  it("falls back to the DeepSeek status feed", () => {
    expect(readFeedUrl(undefined)).toBe(DEFAULT_FEED_URL);
    expect(readFeedUrl({})).toBe(DEFAULT_FEED_URL);
    expect(readFeedUrl({ url: "" })).toBe(DEFAULT_FEED_URL);
    expect(readFeedUrl({ url: "javascript:x" })).toBe(DEFAULT_FEED_URL);
  });

  it("returns a configured URL", () => {
    expect(readFeedUrl({ url: "https://example.com/feed" })).toBe("https://example.com/feed");
  });
});

describe("stripHtmlToText", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtmlToText("<p><strong>Status:</strong> identified</p>")).toBe(
      "Status: identified",
    );
    expect(stripHtmlToText("第一行\n\n第二行")).toBe("第一行 第二行");
  });

  it("keeps block boundaries so adjacent paragraphs do not merge", () => {
    // 不插入分隔时 textContent 会把两段粘成 "resolved本次问题已解决"
    expect(stripHtmlToText("<p>Status: resolved</p><p>本次问题已解决</p>")).toBe(
      "Status: resolved 本次问题已解决",
    );
  });

  it("returns an empty string for non-strings and empty markup", () => {
    expect(stripHtmlToText(undefined)).toBe("");
    expect(stripHtmlToText(null)).toBe("");
    expect(stripHtmlToText("   ")).toBe("");
    expect(stripHtmlToText(123)).toBe("");
  });
});

describe("htmlToParagraphs", () => {
  it("splits on block boundaries and on blank lines inside a block", () => {
    expect(htmlToParagraphs("<p>甲</p><p>乙</p>")).toEqual(["甲", "乙"]);
    // 双语源的常见写法：同一 <p> 内用空行分隔中英
    expect(htmlToParagraphs("<p>中文一段\n\nEnglish paragraph</p>")).toEqual([
      "中文一段",
      "English paragraph",
    ]);
  });

  it("treats <br> as a line break, not a paragraph break", () => {
    expect(htmlToParagraphs("<p>第一行<br>第二行</p>")).toEqual(["第一行 第二行"]);
  });
});

describe("readFeedKind", () => {
  it("defaults to the status kind", () => {
    // 内置的 DeepSeek 订阅是状态页，未设置时按状态类处理
    expect(readFeedKind(undefined)).toBe("status");
    expect(readFeedKind({})).toBe("status");
    expect(readFeedKind({ kind: "status" })).toBe("status");
  });

  it("accepts the list kind and ignores unknown values", () => {
    expect(readFeedKind({ kind: "list" })).toBe("list");
    expect(readFeedKind({ kind: "whatever" })).toBe("status");
  });
});

describe("tileEntryLimit", () => {
  it("shows a single entry for the status kind", () => {
    // 状态类的最新一条即当前状况，历史进展没有外显价值
    expect(tileEntryLimit("status")).toBe(1);
  });

  it("shows several entries for the list kind", () => {
    expect(tileEntryLimit("list")).toBeGreaterThan(1);
  });
});

describe("extractStatus", () => {
  it("pulls the status out of the body and strips the marker", () => {
    expect(extractStatus("Status: resolved 本次问题已解决")).toEqual({
      status: "resolved",
      summary: "本次问题已解决",
    });
  });

  it("keeps the remote value as-is instead of translating it", () => {
    // 状态值是远端机器值，且源本身已是双语；不替它另造文案
    expect(extractStatus("Status: investigating 正在排查").status).toBe("investigating");
    expect(extractStatus("Status: IDENTIFIED 已定位").status).toBe("IDENTIFIED");
  });

  it("tolerates trailing punctuation on the status value", () => {
    expect(extractStatus("Status: resolved.").status).toBe("resolved");
    expect(extractStatus("Status: resolved,").status).toBe("resolved");
  });

  it("leaves text without a leading status marker untouched", () => {
    expect(extractStatus("本次问题已解决")).toEqual({ summary: "本次问题已解决" });
    // 中段的 status: 不是状态字段，不能误判
    expect(extractStatus("说明 status: resolved 的含义")).toEqual({
      summary: "说明 status: resolved 的含义",
    });
  });
});

describe("parseFeedDocument", () => {
  it("normalizes an RSS 2.0 feed", async () => {
    const snapshot = await parseFeedDocument(RSS_XML);
    expect(snapshot.title).toBe("DeepSeek");
    expect(snapshot.link).toBe("https://status.deepseek.com");
    expect(snapshot.description).toBe("Status updates for DeepSeek");
    expect(snapshot.entries).toHaveLength(2);
    // 状态标记被摘出为 status，正文不再重复它；正文完整保留（不再按语言取段）
    expect(snapshot.entries[0]).toMatchObject({
      id: "urn:flashduty:change:7116348214287",
      title: "DeepSeek 网页/API 部分中断",
      link: "https://status.deepseek.com/incidents/7116348214287",
      status: "identified",
      summary:
        "已定位原因，正在实施修复。 The cause has been identified and a fix is being implemented.",
    });
    // 第二条的状态与正文各自独立提取
    expect(snapshot.entries[1]).toMatchObject({
      status: "resolved",
      summary: "本次问题已解决，服务已恢复。",
    });
    // pubDate 换算成毫秒时间戳
    expect(snapshot.entries[0]!.publishedAt).toBe(Date.parse("Thu, 15 Oct 2026 08:11:35 +0800"));
  });

  it("normalizes an Atom feed", async () => {
    const snapshot = await parseFeedDocument(ATOM_XML);
    expect(snapshot.title).toBe("Atom 示例");
    expect(snapshot.link).toBe("https://example.com/");
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      id: "tag:example.com,2026:1",
      title: "第一条",
      link: "https://example.com/1",
      summary: "正文 加粗",
    });
    expect(snapshot.entries[0]!.publishedAt).toBe(Date.parse("2026-10-15T00:00:00Z"));
  });

  it("normalizes a JSON feed", async () => {
    const snapshot = await parseFeedDocument(JSON_FEED);
    expect(snapshot.title).toBe("JSON 示例");
    expect(snapshot.entries).toHaveLength(1);
    expect(snapshot.entries[0]).toMatchObject({
      id: "1",
      title: "JSON 第一条",
      link: "https://example.com/j1",
      summary: "正文内容",
    });
  });

  it("keeps the status badge and the whole body", async () => {
    // 不再按语言取段：状态与正文都完整保留（双语源会中英各一段）
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://e.com</link><description>d</description><item><title>网页中断</title><description>&lt;p&gt;&lt;strong&gt;Status:&lt;/strong&gt; resolved&lt;/p&gt;&lt;p&gt;本次问题已解决。&#xA;&#xA;The incident has been resolved.&lt;/p&gt;</description></item></channel></rss>`;
    const snapshot = await parseFeedDocument(xml);
    expect(snapshot.entries[0]!.status).toBe("resolved");
    expect(snapshot.entries[0]!.summary).toBe("本次问题已解决。 The incident has been resolved.");
    expect(snapshot.entries[0]!.title).toBe("网页中断");
  });

  it("falls back to a link or index when a title is missing", async () => {
    const snapshot = await parseFeedDocument(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://e.com</link><description>d</description><item><link>https://e.com/1</link></item></channel></rss>`,
    );
    expect(snapshot.entries[0]!.title).toBe("https://e.com/1");
  });

  it("drops unparsable dates instead of failing", async () => {
    const snapshot = await parseFeedDocument(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://e.com</link><description>d</description><item><title>X</title><pubDate>not a date</pubDate></item></channel></rss>`,
    );
    expect(snapshot.entries[0]!.publishedAt).toBeNull();
  });

  it("caps the number of entries", async () => {
    const items = Array.from(
      { length: MAX_ENTRIES + 10 },
      (_, i) => `<item><title>#${i}</title><guid>g${i}</guid></item>`,
    ).join("");
    const snapshot = await parseFeedDocument(
      `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://e.com</link><description>d</description>${items}</channel></rss>`,
    );
    expect(snapshot.entries).toHaveLength(MAX_ENTRIES);
  });

  it("rejects content that is not a feed", async () => {
    await expect(parseFeedDocument("<html><body>nope</body></html>")).rejects.toBeInstanceOf(
      RssError,
    );
  });
});

describe("fetchFeed", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests the network on every call instead of reusing a fresh window", async () => {
    // 订阅是轻量纯文本，不设新鲜窗口：连续两次取数必须各发一次请求，
    // 否则状态页会展示上一轮的内容。
    fetchMock.mockResolvedValue(textResponse(RSS_XML));

    const first = await fetchFeed(DEFAULT_FEED_URL);
    const second = await fetchFeed(DEFAULT_FEED_URL);

    expect(first.snapshot.title).toBe("DeepSeek");
    expect(first.fresh).toBe(true);
    expect(second.fresh).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(DEFAULT_FEED_URL);
    // 上次成功的内容仍留在本地，作为失败兜底
    expect(readCachedSnapshot(DEFAULT_FEED_URL)?.title).toBe("DeepSeek");
  });

  it("collapses concurrent requests for the same URL", async () => {
    fetchMock.mockResolvedValue(textResponse(RSS_XML));

    const [a, b] = await Promise.all([fetchFeed(DEFAULT_FEED_URL), fetchFeed(DEFAULT_FEED_URL)]);

    expect(a.fresh).toBe(true);
    expect(b.fresh).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("separates the fallback snapshot by URL", async () => {
    fetchMock.mockResolvedValue(textResponse(ATOM_XML));
    await fetchFeed("https://a.com/feed");
    await fetchFeed("https://b.com/feed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readCachedSnapshot("https://a.com/feed")?.title).toBe("Atom 示例");
    expect(readCachedSnapshot("https://b.com/feed")?.title).toBe("Atom 示例");
  });

  it("falls back to the last successful snapshot and reports it as not fresh", async () => {
    // 缓存存在的唯一意义：远程故障时降级为"内容可能不新"，而不是空磁贴
    fetchMock.mockResolvedValueOnce(textResponse(RSS_XML));
    await fetchFeed(DEFAULT_FEED_URL);

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchFeed(DEFAULT_FEED_URL)).resolves.toMatchObject({
      snapshot: { title: "DeepSeek" },
      fresh: false,
    });

    // 503 同样回落到旧内容
    fetchMock.mockResolvedValueOnce(textResponse("", false, 503));
    await expect(fetchFeed(DEFAULT_FEED_URL)).resolves.toMatchObject({ fresh: false });
  });

  it("keeps serving the old snapshot even long after it was written", async () => {
    // 兜底刻意不设年龄上限：过期的状态页内容仍比空磁贴有用。
    // 直接把缓存记录的时间戳改到很久以前来模拟。
    fetchMock.mockResolvedValueOnce(textResponse(RSS_XML));
    await fetchFeed(DEFAULT_FEED_URL);

    const key = Object.keys(localStorage).find((k) => k.includes("rss:"))!;
    const record = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...record, savedAt: Date.now() - 30 * 86400_000 }));

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchFeed(DEFAULT_FEED_URL)).resolves.toMatchObject({
      snapshot: { title: "DeepSeek" },
      fresh: false,
    });
  });

  it("rejects malformed content with no cached fallback", async () => {
    fetchMock.mockResolvedValue(textResponse("not xml at all"));
    await expect(fetchFeed("https://bad.example/feed")).rejects.toBeInstanceOf(RssError);
  });

  it("rejects invalid URLs without any request", async () => {
    await expect(fetchFeed("javascript:alert(1)")).rejects.toMatchObject({ kind: "invalid-url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    fetchMock.mockResolvedValue(textResponse("   "));
    await expect(fetchFeed("https://empty.example/feed")).rejects.toMatchObject({
      kind: "empty-body",
    });
  });

  it("falls back when the body is empty but a snapshot exists", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(RSS_XML));
    await fetchFeed(DEFAULT_FEED_URL);

    fetchMock.mockResolvedValueOnce(textResponse(""));
    await expect(fetchFeed(DEFAULT_FEED_URL)).resolves.toMatchObject({ fresh: false });
  });
});

describe("feedTimeLabel", () => {
  it("shows 刚刚 within a minute", () => {
    const now = Date.parse("2026-10-15T12:00:00+08:00");
    expect(feedTimeLabel(now - 30 * 1000, now)).toBe("刚刚");
  });

  it("shows a localized relative time within 30 days", () => {
    const now = Date.parse("2026-10-15T12:00:00+08:00");
    expect(feedTimeLabel(now - 3 * 60 * 60 * 1000, now)).toContain("前");
  });

  it("shows an absolute date beyond 30 days", () => {
    /*
     * 绝对日期按**浏览器本地时区**渲染（用户熟悉的口径），因此断言不能写死
     * "某个带时区的时间戳 → 某个固定日期串"：CI 跑在 UTC、开发机常在 UTC+8，
     * 同一时间戳会落在不同日期上（2026-01-02T00:00+08:00 在 UTC 下是 01-01）。
     * 这里改为用同一套本地时区自行算出期望值，从而与运行环境无关。
     */
    const publishedAt = Date.parse("2026-01-02T00:00:00+08:00");
    const now = Date.parse("2026-10-15T12:00:00+08:00");
    expect(feedTimeLabel(publishedAt, now)).toBe(format(new Date(publishedAt), "yyyy-MM-dd"));
  });

  it("returns an empty string when the date is unknown", () => {
    expect(feedTimeLabel(null)).toBe("");
  });
});
