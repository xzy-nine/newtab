import { describe, it, expect } from "vitest";
import {
  FOLDER_PANEL_MIN_W,
  collectWidgetItems,
  folderItemId,
  folderPanelCapacity,
  hasSameItemIdentity,
  isExpandedFolderItem,
  normalizeDesktopItem,
  normalizeDesktopItems,
  reconcileFolderItems,
  seedFolderItems,
  stripWidgetsFromLayouts,
  type DesktopItem,
} from "./desktop-items";

describe("normalizeDesktopItem", () => {
  it("keeps folder items with their folderId", () => {
    const item = normalizeDesktopItem({
      id: "folder:1",
      type: "folder",
      folderId: "1",
      name: "工作",
      w: 1,
      h: 1,
    });
    expect(item).toEqual({
      id: "folder:1",
      type: "folder",
      folderId: "1",
      name: "工作",
      w: 1,
      h: 1,
    });
  });

  it("rejects folder items without a folderId", () => {
    expect(normalizeDesktopItem({ id: "x", type: "folder", name: "无" })).toBeNull();
  });

  it("rejects unknown types and missing ids", () => {
    expect(normalizeDesktopItem({ id: "x", type: "mystery" })).toBeNull();
    expect(normalizeDesktopItem({ type: "shortcut", url: "https://a.com" })).toBeNull();
    expect(normalizeDesktopItem(null)).toBeNull();
  });

  it("normalizes shortcut items and falls back to the url as name", () => {
    expect(normalizeDesktopItem({ id: "s", type: "shortcut", url: "https://a.com" })).toEqual({
      id: "s",
      type: "shortcut",
      name: "https://a.com",
      url: "https://a.com",
      icon: undefined,
      color: undefined,
      w: 1,
      h: 1,
    });
  });

  it("coerces invalid sizes to 1", () => {
    const item = normalizeDesktopItem({
      id: "w",
      type: "widget",
      widgetType: "note",
      w: 0,
      h: -3,
    });
    expect(item).toMatchObject({ w: 1, h: 1 });
  });
});

describe("normalizeDesktopItems", () => {
  it("drops entries that cannot be recognized", () => {
    const items = normalizeDesktopItems([
      { id: "a", type: "shortcut", url: "https://a.com" },
      { id: "b", type: "nope" },
      null,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("a");
  });

  it("returns an empty array for non-arrays", () => {
    expect(normalizeDesktopItems({})).toEqual([]);
    expect(normalizeDesktopItems(undefined)).toEqual([]);
  });
});

describe("seedFolderItems", () => {
  it("maps pinned folder ids to folder icons in order", () => {
    const items = seedFolderItems(["a", "b"], { a: "收藏", b: "工作" });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ id: folderItemId("a"), folderId: "a", name: "收藏" });
    expect(items[1]).toMatchObject({ folderId: "b", name: "工作" });
  });

  it("uses a placeholder name for unknown folders", () => {
    expect(seedFolderItems(["x"])[0]!.name).toBe("未命名");
  });
});

describe("reconcileFolderItems", () => {
  const widget: DesktopItem = { id: "w", type: "widget", widgetType: "note", w: 2, h: 2 };

  it("removes icons for unpinned folders and preserves other item positions", () => {
    const items: DesktopItem[] = [
      { id: folderItemId("a"), type: "folder", folderId: "a", name: "A", w: 1, h: 1 },
      widget,
      { id: folderItemId("b"), type: "folder", folderId: "b", name: "B", w: 1, h: 1 },
    ];
    const next = reconcileFolderItems(items, ["a"], { a: "A" });
    expect(next.map((i) => i.id)).toEqual([folderItemId("a"), "w"]);
  });

  it("appends icons for newly pinned folders without reordering existing items", () => {
    const items: DesktopItem[] = [
      widget,
      { id: folderItemId("a"), type: "folder", folderId: "a", name: "A", w: 1, h: 1 },
    ];
    const next = reconcileFolderItems(items, ["a", "b"], { a: "A", b: "B" });
    // 已有的文件夹图标保持原位，新固定的追加到末尾。
    expect(next.map((i) => i.id)).toEqual(["w", folderItemId("a"), folderItemId("b")]);
  });

  it("refreshes folder titles when a bookark folder is renamed", () => {
    const items: DesktopItem[] = [
      { id: folderItemId("a"), type: "folder", folderId: "a", name: "旧名", w: 1, h: 1 },
    ];
    expect(reconcileFolderItems(items, ["a"], { a: "新名" })[0]).toMatchObject({ name: "新名" });
  });

  it("is idempotent", () => {
    const items = seedFolderItems(["a", "b"], { a: "A", b: "B" });
    const once = reconcileFolderItems(items, ["a", "b"], { a: "A", b: "B" });
    const twice = reconcileFolderItems(once, ["a", "b"], { a: "A", b: "B" });
    expect(twice).toEqual(once);
  });
});

describe("hasSameItemIdentity", () => {
  const folder: DesktopItem = {
    id: folderItemId("a"),
    type: "folder",
    folderId: "a",
    name: "A",
    w: 1,
    h: 1,
  };

  it("is true for equal identity including folder titles", () => {
    expect(hasSameItemIdentity([folder], [{ ...folder }])).toBe(true);
  });

  it("is false when a folder title changes so callers can re-render", () => {
    expect(hasSameItemIdentity([folder], [{ ...folder, name: "B" }])).toBe(false);
  });

  it("is false for a different order", () => {
    const widget: DesktopItem = { id: "w", type: "widget", widgetType: "note", w: 2, h: 2 };
    expect(hasSameItemIdentity([folder, widget], [widget, folder])).toBe(false);
  });
});

describe("folder stretch state", () => {
  const icon: DesktopItem = {
    id: folderItemId("a"),
    type: "folder",
    folderId: "a",
    name: "A",
    w: 1,
    h: 1,
  };

  it("treats a 1-column folder as an icon, not an expanded panel", () => {
    expect(isExpandedFolderItem(icon)).toBe(false);
  });

  it("treats a folder stretched to the minimum width as expanded", () => {
    expect(isExpandedFolderItem({ ...icon, w: FOLDER_PANEL_MIN_W })).toBe(true);
    expect(isExpandedFolderItem({ ...icon, w: 4 })).toBe(true);
  });

  it("never treats shortcuts or widgets as expanded folders", () => {
    expect(
      isExpandedFolderItem({
        id: "s",
        type: "shortcut",
        name: "S",
        url: "https://a.com",
        w: 3,
        h: 1,
      }),
    ).toBe(false);
    expect(isExpandedFolderItem({ id: "w", type: "widget", widgetType: "note", w: 3, h: 1 })).toBe(
      false,
    );
  });

  it("grows the bookmark capacity with width, with a sensible floor", () => {
    expect(folderPanelCapacity(2)).toBeGreaterThanOrEqual(4);
    expect(folderPanelCapacity(4)).toBeGreaterThan(folderPanelCapacity(2));
  });
});

describe("reconcileFolderItems keeps stretched state", () => {
  it("preserves a stretched folder width when the folder stays pinned", () => {
    const items: DesktopItem[] = [
      { id: folderItemId("a"), type: "folder", folderId: "a", name: "A", w: 3, h: 1 },
    ];
    const next = reconcileFolderItems(items, ["a"], { a: "A" });
    expect(next[0]).toMatchObject({ folderId: "a", w: 3 });
  });
});

describe("collectWidgetItems", () => {
  it("collects widgets from folder layouts and legacy widget containers", () => {
    const items = collectWidgetItems({
      layouts: {
        "1": {
          items: [
            { id: "w1", type: "widget", widgetType: "note", w: 2, h: 2 },
            { id: "s1", type: "shortcut", name: "A", url: "https://a.com", w: 1, h: 1 },
          ],
        },
      },
      legacyContainers: [
        { id: "c1", folderId: "1", items: [{ id: "w2", type: "counter", data: { count: 3 } }] },
      ],
    });

    expect(items.map((i) => i.id)).toEqual(["w1", "c1-w2"]);
    expect(items[1]).toMatchObject({ widgetType: "counter", data: { count: 3 } });
  });

  it("deduplicates by id, keeping the first occurrence", () => {
    const items = collectWidgetItems({
      layouts: {
        "1": { items: [{ id: "w1", type: "widget", widgetType: "note", w: 2, h: 2 }] },
        "2": { items: [{ id: "w1", type: "widget", widgetType: "timer", w: 2, h: 2 }] },
      },
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.widgetType).toBe("note");
  });

  it("ignores malformed legacy containers", () => {
    expect(collectWidgetItems({ legacyContainers: [null, {}, { id: "c" }, []] })).toEqual([]);
  });
});

describe("stripWidgetsFromLayouts", () => {
  it("removes widgets but keeps shortcuts and folders", () => {
    const stripped = stripWidgetsFromLayouts({
      "1": {
        items: [
          { id: "w1", type: "widget", widgetType: "note", w: 2, h: 2 },
          { id: "s1", type: "shortcut", name: "A", url: "https://a.com", w: 1, h: 1 },
        ],
      },
    });
    expect(stripped["1"]!.items.map((i) => i.id)).toEqual(["s1"]);
  });

  it("drops layouts that become empty", () => {
    const stripped = stripWidgetsFromLayouts({
      "1": { items: [{ id: "w1", type: "widget", widgetType: "note", w: 2, h: 2 }] },
    });
    expect(stripped).toEqual({});
  });
});
