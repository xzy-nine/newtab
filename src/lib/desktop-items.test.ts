import { describe, it, expect } from "vitest";
import {
  FOLDER_PANEL_MIN_W,
  collectWidgetItems,
  folderGridLayout,
  folderItemId,
  folderTileForm,
  hasSameItemIdentity,
  isExpandedFolderItem,
  normalizeDesktopItem,
  normalizeDesktopItems,
  reconcileFolderItems,
  resolveFolderResize,
  seedFolderItems,
  stripWidgetsFromLayouts,
  type DesktopItem,
  type FolderItem,
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
      preview: false,
      w: 1,
      h: 1,
    });
  });

  it("persists the 1x1 preview flag of folder items", () => {
    expect(
      normalizeDesktopItem({
        id: "folder:1",
        type: "folder",
        folderId: "1",
        name: "工作",
        preview: true,
        w: 1,
        h: 1,
      }),
    ).toMatchObject({ preview: true });
    // 非布尔值一律视为关闭
    expect(
      normalizeDesktopItem({
        id: "folder:1",
        type: "folder",
        folderId: "1",
        name: "工作",
        preview: "yes",
      }),
    ).toMatchObject({ preview: false });
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

  it("grows with available width rather than capping at a fixed count", () => {
    // 旧的固定上限会让 +N 出现在非末尾；现在由真实槽位决定。
    expect(folderGridLayout(4, 10).visibleCount).toBe(3);
    // 8 槽位仍放不下 10 个 → 7 个 + "+3"
    expect(folderGridLayout(8, 10)).toEqual({ visibleCount: 7, overflow: 3 });
    // 槽位足够时全部显示，+N 消失
    expect(folderGridLayout(12, 10)).toEqual({ visibleCount: 10, overflow: 0 });
  });
});

describe("folder tile forms", () => {
  const base: DesktopItem = {
    id: folderItemId("a"),
    type: "folder",
    folderId: "a",
    name: "A",
    w: 1,
    h: 1,
  };
  const asFolder = (extra: Partial<FolderItem> = {}) => ({ ...base, ...extra }) as FolderItem;

  it("is a plain icon by default at 1x1", () => {
    expect(folderTileForm(asFolder())).toBe("icon");
    expect(folderTileForm(asFolder({ preview: false }))).toBe("icon");
  });

  it("is a preview at 1x1 when preview is on", () => {
    expect(folderTileForm(asFolder({ preview: true }))).toBe("preview");
  });

  it("is expanded once the width reaches 2 columns, regardless of preview", () => {
    expect(folderTileForm(asFolder({ w: 2 }))).toBe("expanded");
    expect(folderTileForm(asFolder({ w: 2, preview: true }))).toBe("expanded");
    expect(folderTileForm(asFolder({ w: 4 }))).toBe("expanded");
  });
});

describe("resolveFolderResize", () => {
  const UNIT = 100;

  it("expands once the width reaches 2 columns", () => {
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: false,
        rawW: 2,
        dx: UNIT,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 2, preview: false });
  });

  it("turns on the 1x1 preview on a light rightward drag", () => {
    // 只拉了 40px：不足一格，但超过轻拉阈值 → 预览
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: false,
        rawW: 1.4,
        dx: 40,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 1, preview: true });
  });

  it("turns the preview back off on a light leftward drag", () => {
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: true,
        rawW: 1,
        dx: -40,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 1, preview: false });
  });

  it("keeps the current form while the drag is below the threshold", () => {
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: false,
        rawW: 1,
        dx: 5,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 1, preview: false });
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: true,
        rawW: 1,
        dx: -5,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 1, preview: true });
  });

  it("returns to a plain icon when shrinking from an expanded 2 columns", () => {
    expect(
      resolveFolderResize({
        origW: 2,
        origPreview: false,
        rawW: 1,
        dx: -UNIT,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 1, preview: false });
  });

  it("never goes below 1 column or above maxCols", () => {
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: false,
        rawW: -5,
        dx: -900,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 1, preview: false });
    expect(
      resolveFolderResize({
        origW: 3,
        origPreview: false,
        rawW: 99,
        dx: 9000,
        unitWidth: UNIT,
        maxCols: 6,
      }),
    ).toEqual({ w: 6, preview: false });
  });

  it("uses a floor for the threshold so tiny columns still need a real drag", () => {
    // unitWidth 极小（列很多）时，阈值退化为 6px 而不是 ~0
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: false,
        rawW: 1,
        dx: 5,
        unitWidth: 4,
        maxCols: 40,
      }),
    ).toEqual({ w: 1, preview: false });
    expect(
      resolveFolderResize({
        origW: 1,
        origPreview: false,
        rawW: 1,
        dx: 8,
        unitWidth: 4,
        maxCols: 40,
      }),
    ).toEqual({ w: 1, preview: true });
  });
});

describe("folderGridLayout", () => {
  it("shows every bookmark when they all fit (no +N)", () => {
    expect(folderGridLayout(4, 3)).toEqual({ visibleCount: 3, overflow: 0 });
    expect(folderGridLayout(4, 4)).toEqual({ visibleCount: 4, overflow: 0 });
  });

  it("reserves the last slot for +N only when there is overflow", () => {
    // 2x2=4 槽位、5 个书签 → 前 3 个 + "+2"，+N 位于末尾。
    expect(folderGridLayout(4, 5)).toEqual({ visibleCount: 3, overflow: 2 });
  });

  it("keeps the +N as the last rendered cell, so visible + overflow === total", () => {
    for (const slots of [1, 2, 3, 4, 5, 8, 12, 20]) {
      for (const total of [0, 1, 2, 3, 4, 5, 9, 13, 40]) {
        const { visibleCount, overflow } = folderGridLayout(slots, total);
        // 渲染出来的格子数 = 书签格 + (有无 +N)
        const rendered = visibleCount + (overflow > 0 ? 1 : 0);
        expect(visibleCount + overflow).toBe(total);
        expect(rendered).toBeLessThanOrEqual(slots);
        // 放得下就不该出现 +N
        if (total <= slots) expect(overflow).toBe(0);
        else expect(overflow).toBeGreaterThan(0);
      }
    }
  });

  it("degrades safely when no slot is measurable yet", () => {
    expect(folderGridLayout(0, 7)).toEqual({ visibleCount: 0, overflow: 7 });
  });

  it("treats negative or fractional inputs as integers", () => {
    expect(folderGridLayout(-3, 5)).toEqual({ visibleCount: 0, overflow: 5 });
    expect(folderGridLayout(4.9, 3.2)).toEqual({ visibleCount: 3, overflow: 0 });
  });

  it("models internal wrapping across multiple rows", () => {
    // 2 列 x 3 行 = 6 槽位：放得下 6 个就全显示、不换出 +N。
    expect(folderGridLayout(6, 6)).toEqual({ visibleCount: 6, overflow: 0 });
    // 7 个放不下 → 5 个 + "+2"，+N 落在最后一行末尾。
    expect(folderGridLayout(6, 7)).toEqual({ visibleCount: 5, overflow: 2 });
    // 拉宽到 12 槽位后能全放下，+N 消失。
    expect(folderGridLayout(12, 7)).toEqual({ visibleCount: 7, overflow: 0 });
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
