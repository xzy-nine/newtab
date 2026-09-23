import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 主桌面 store 的固定/取消固定行为。
 *
 * 存储层被 mock：这里只验证"固定书签 = 往主桌面加/删快捷方式"的纯逻辑，
 * 不触碰 chrome.storage。
 */

const saveHomeDesktop = vi.fn(async () => {});
const loadHomeDesktop = vi.fn(async () => []);

vi.mock("@/lib/desktop-storage", () => ({
  saveHomeDesktop: () => saveHomeDesktop(),
  loadHomeDesktop: () => loadHomeDesktop(),
}));

const { useHomeDesktop, shortcutFromBookmark } = await import("./home-desktop-store");

const bookmark = (id: string, url: string, title = id) => ({ id, url, title });

describe("home-desktop-store pinning", () => {
  beforeEach(() => {
    useHomeDesktop.setState({ items: [] });
    saveHomeDesktop.mockClear();
  });

  it("pins bookmarks as shortcuts", () => {
    useHomeDesktop.getState().pinBookmarks([bookmark("a", "https://a.com", "A")]);
    const items = useHomeDesktop.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: "shortcut",
      url: "https://a.com",
      name: "A",
      w: 1,
      h: 1,
    });
  });

  it("does not pin the same URL twice", () => {
    const { pinBookmarks } = useHomeDesktop.getState();
    pinBookmarks([bookmark("a", "https://a.com")]);
    pinBookmarks([bookmark("b", "https://a.com")]);
    expect(useHomeDesktop.getState().items).toHaveLength(1);
  });

  it("deduplicates within a single request", () => {
    useHomeDesktop
      .getState()
      .pinBookmarks([bookmark("a", "https://a.com"), bookmark("b", "https://a.com")]);
    expect(useHomeDesktop.getState().items).toHaveLength(1);
  });

  it("pins a batch in one action", () => {
    useHomeDesktop
      .getState()
      .pinBookmarks([bookmark("a", "https://a.com"), bookmark("b", "https://b.com")]);
    expect(useHomeDesktop.getState().items.map((i) => i.type)).toEqual(["shortcut", "shortcut"]);
  });

  it("skips bookmarks without a URL", () => {
    useHomeDesktop.getState().pinBookmarks([bookmark("a", "")]);
    expect(useHomeDesktop.getState().items).toHaveLength(0);
  });

  it("unpins by URL without touching widgets or folder icons", () => {
    useHomeDesktop.setState({
      items: [
        { id: "s1", type: "shortcut", name: "A", url: "https://a.com", w: 1, h: 1 },
        { id: "w1", type: "widget", widgetType: "note", w: 2, h: 2 },
        { id: "folder:x", type: "folder", folderId: "x", name: "X", w: 1, h: 1 },
      ],
    });
    useHomeDesktop.getState().unpinBookmarks(["https://a.com"]);
    expect(useHomeDesktop.getState().items.map((i) => i.id)).toEqual(["w1", "folder:x"]);
  });

  it("unpins a batch at once", () => {
    useHomeDesktop.setState({
      items: [
        { id: "s1", type: "shortcut", name: "A", url: "https://a.com", w: 1, h: 1 },
        { id: "s2", type: "shortcut", name: "B", url: "https://b.com", w: 1, h: 1 },
        { id: "s3", type: "shortcut", name: "C", url: "https://c.com", w: 1, h: 1 },
      ],
    });
    useHomeDesktop.getState().unpinBookmarks(["https://a.com", "https://b.com"]);
    expect(useHomeDesktop.getState().items.map((i) => i.id)).toEqual(["s3"]);
  });

  it("leaves state untouched when unpinning nothing that is pinned", () => {
    const before = [
      { id: "s1", type: "shortcut" as const, name: "A", url: "https://a.com", w: 1, h: 1 },
    ];
    useHomeDesktop.setState({ items: before });
    useHomeDesktop.getState().unpinBookmarks(["https://zzz.com"]);
    expect(useHomeDesktop.getState().items).toBe(before);
  });

  it("builds a stable shortcut id from the bookmark id", () => {
    expect(shortcutFromBookmark(bookmark("bm-1", "https://a.com"))).toMatchObject({
      id: "shortcut:bm-1",
      type: "shortcut",
    });
  });

  it("falls back to the URL as the shortcut name", () => {
    expect(shortcutFromBookmark({ id: "a", url: "https://a.com", title: "" })).toMatchObject({
      name: "https://a.com",
    });
  });
});

describe("home-desktop-store folder sync", () => {
  beforeEach(() => {
    useHomeDesktop.setState({ items: [] });
  });

  it("adds folder icons for pinned folders and keeps bookmarks", () => {
    useHomeDesktop.setState({
      items: [{ id: "s1", type: "shortcut", name: "A", url: "https://a.com", w: 1, h: 1 }],
    });
    useHomeDesktop.getState().syncFolderItems(["f1"], { f1: "工作" });
    expect(useHomeDesktop.getState().items.map((i) => i.type)).toEqual(["shortcut", "folder"]);
    expect(useHomeDesktop.getState().items[1]).toMatchObject({ folderId: "f1", name: "工作" });
  });

  it("keeps the same array reference when nothing changes", () => {
    useHomeDesktop.getState().syncFolderItems(["f1"], { f1: "工作" });
    const once = useHomeDesktop.getState().items;
    useHomeDesktop.getState().syncFolderItems(["f1"], { f1: "工作" });
    expect(useHomeDesktop.getState().items).toBe(once);
  });
});
