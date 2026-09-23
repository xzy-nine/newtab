import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { HomeDesktopLoadResult } from "@/lib/desktop-storage";

/**
 * 主桌面 store 的固定/取消固定行为。
 *
 * 存储层被 mock：这里只验证"固定书签 = 往主桌面加/删快捷方式"的纯逻辑，
 * 不触碰 chrome.storage。
 */

const saveHomeDesktop = vi.fn(async () => {});
const loadHomeDesktop = vi.fn(async (): Promise<HomeDesktopLoadResult> => ({ items: [] }));

vi.mock("@/lib/desktop-storage", () => ({
  saveHomeDesktop: () => saveHomeDesktop(),
  loadHomeDesktop: () => loadHomeDesktop(),
}));

const { useHomeDesktop, shortcutFromBookmark } = await import("@/lib/home-desktop-store");

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

describe("home-desktop-store migration release", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useHomeDesktop.setState({ items: [], pendingFolderChoice: null });
    saveHomeDesktop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("releaseFolder turns bookmarks into shortcuts and removes the folder icon", () => {
    useHomeDesktop.setState({
      items: [
        { id: "folder:f1", type: "folder", folderId: "f1", name: "F1", w: 1, h: 1 },
        { id: "folder:f2", type: "folder", folderId: "f2", name: "F2", w: 1, h: 1 },
      ],
      pendingFolderChoice: { candidateFolderIds: ["f1", "f2"] },
    });
    useHomeDesktop
      .getState()
      .releaseFolder("f1", [
        bookmark("a", "https://a.com", "A"),
        bookmark("b", "https://b.com", "B"),
      ]);
    const state = useHomeDesktop.getState();
    expect(state.pendingFolderChoice).toBeNull();
    // f1 图标移除，f2 保留，两个书签变成快捷方式
    expect(state.items.map((i) => i.id)).toEqual(["folder:f2", "shortcut:a", "shortcut:b"]);
    // 释放会防抖落盘，推进计时器后触发一次保存。
    vi.advanceTimersByTime(250);
    expect(saveHomeDesktop).toHaveBeenCalledTimes(1);
  });

  it("releaseFolder dedupes bookmarks already on the desktop by URL", () => {
    useHomeDesktop.setState({
      items: [
        { id: "s-old", type: "shortcut", name: "A", url: "https://a.com", w: 1, h: 1 },
        { id: "folder:f1", type: "folder", folderId: "f1", name: "F1", w: 1, h: 1 },
      ],
      pendingFolderChoice: { candidateFolderIds: ["f1"] },
    });
    useHomeDesktop.getState().releaseFolder("f1", [bookmark("a", "https://a.com", "A 新")]);
    const state = useHomeDesktop.getState();
    // 已存在的 https://a.com 不重复添加
    expect(state.items.filter((i) => i.type === "shortcut")).toHaveLength(1);
    expect(state.items.find((i) => i.type === "folder")).toBeUndefined();
  });

  it("releaseFolder with an empty folder just removes the icon", () => {
    useHomeDesktop.setState({
      items: [{ id: "folder:f1", type: "folder", folderId: "f1", name: "F1", w: 1, h: 1 }],
      pendingFolderChoice: { candidateFolderIds: ["f1"] },
    });
    useHomeDesktop.getState().releaseFolder("f1", []);
    expect(useHomeDesktop.getState().items).toEqual([]);
    expect(useHomeDesktop.getState().pendingFolderChoice).toBeNull();
  });

  it("dismissFolderChoice clears the pending choice without touching items", () => {
    const items = [
      { id: "folder:f1", type: "folder" as const, folderId: "f1", name: "F1", w: 1, h: 1 },
    ];
    useHomeDesktop.setState({
      items,
      pendingFolderChoice: { candidateFolderIds: ["f1"] },
    });
    useHomeDesktop.getState().dismissFolderChoice();
    expect(useHomeDesktop.getState().pendingFolderChoice).toBeNull();
    expect(useHomeDesktop.getState().items).toBe(items);
  });

  it("hydrate surfaces a pending folder choice from the migration", async () => {
    loadHomeDesktop.mockResolvedValueOnce({
      items: [{ id: "folder:f1", type: "folder" as const, folderId: "f1", name: "F1", w: 1, h: 1 }],
      pendingFolderChoice: { candidateFolderIds: ["f1", "f2"] },
    });
    await useHomeDesktop.getState().hydrate([]);
    expect(useHomeDesktop.getState().pendingFolderChoice).toEqual({
      candidateFolderIds: ["f1", "f2"],
    });
    expect(useHomeDesktop.getState().items).toHaveLength(1);
  });
});
