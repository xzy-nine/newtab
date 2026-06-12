import { useState, useEffect, useCallback, useRef } from "react";

export type ItemType = "shortcut" | "widget";

export interface BaseItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
}

export interface ShortcutItem extends BaseItem {
  type: "shortcut";
  name: string;
  url: string;
  icon?: string;
  color?: string;
}

export interface WidgetItemData extends BaseItem {
  type: "widget";
  widgetType: string;
  title?: string;
  data?: Record<string, unknown>;
}

export type DesktopItem = ShortcutItem | WidgetItemData;

export interface GridConfig {
  cols: number;
  rows: number;
  gap: number;
  cellSize: number;
}

export function checkCollision(a: DesktopItem, b: DesktopItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function isWithinBounds(item: DesktopItem, grid: GridConfig): boolean {
  return item.x >= 0 && item.y >= 0 && item.x + item.w <= grid.cols && item.y + item.h <= grid.rows;
}

export function calculateGridConfig(width: number, height: number): GridConfig {
  const gap = width < 768 ? 12 : 16;
  const minCell = width < 768 ? 52 : 76;
  const maxCell = width < 768 ? 88 : 140;
  const aspect = width / height;
  let cols: number, rows: number;
  if (aspect > 1.5) {
    cols = 12;
    rows = 4;
  } else if (aspect < 0.75) {
    cols = 4;
    rows = 12;
  } else {
    cols = 8;
    rows = 8;
  }
  const cellSize = Math.max(
    minCell,
    Math.min(
      maxCell,
      Math.floor((width - (cols - 1) * gap) / cols),
      Math.floor((height - (rows - 1) * gap) / rows),
    ),
  );
  return { cols, rows, gap, cellSize };
}

export function findNearestFreePosition(
  item: DesktopItem,
  items: DesktopItem[],
  grid: GridConfig,
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let y = 0; y <= grid.rows - item.h; y++) {
    for (let x = 0; x <= grid.cols - item.w; x++) {
      const candidate = { ...item, x, y };
      const others = items.filter((i) => i.id !== item.id);
      if (others.some((o) => checkCollision(candidate, o))) continue;
      const dist = Math.abs(item.x - x) + Math.abs(item.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x, y };
      }
    }
  }
  return best;
}

export function useDesktopGrid(folderId?: string) {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const [grid, setGrid] = useState<GridConfig>({ cols: 12, rows: 4, gap: 14, cellSize: 88 });
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const saveLayout = useCallback(
    async (currentItems: DesktopItem[], currentGrid: GridConfig) => {
      if (!folderId) return;
      try {
        const result = await chrome.storage.local.get("desktopLayouts");
        const layouts = (result.desktopLayouts || {}) as Record<string, unknown>;
        layouts[folderId] = {
          grid: { cols: currentGrid.cols, rows: currentGrid.rows },
          items: currentItems.map((it) => {
            const base = {
              id: it.id,
              type: it.type,
              x: it.x,
              y: it.y,
              page: it.page,
            };
            if (it.type === "shortcut") {
              return {
                ...base,
                w: 1,
                h: 1,
                name: it.name,
                url: it.url,
                color: it.color,
                icon: it.icon,
              };
            }
            return {
              ...base,
              w: it.w,
              h: it.h,
              widgetType: it.widgetType,
              title: it.title,
              data: it.data,
            };
          }),
        };
        await chrome.storage.local.set({ desktopLayouts: layouts });
      } catch (e) {
        console.error("保存布局失败:", e);
      }
    },
    [folderId],
  );

  const scheduleSave = useCallback(
    (currentItems: DesktopItem[], currentGrid: GridConfig) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveLayout(currentItems, currentGrid), 250);
    },
    [saveLayout],
  );

  const loadLayout = useCallback(async () => {
    if (!folderId) return;
    try {
      const result = await chrome.storage.local.get("desktopLayouts");
      const layouts = (result.desktopLayouts || {}) as Record<
        string,
        { grid: { cols: number; rows: number }; items: DesktopItem[] }
      >;
      return layouts[folderId] || null;
    } catch {
      return null;
    }
  }, [folderId]);

  const recalcGrid = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = Math.max(rect.width, 100);
    const h = Math.max(rect.height, 100);
    setGrid(calculateGridConfig(w, h));
  }, []);

  useEffect(() => {
    recalcGrid();
    const ro = new ResizeObserver(recalcGrid);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalcGrid]);

  const moveItem = useCallback(
    (id: string, x: number, y: number) => {
      setItems((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, x, y } : it));
        scheduleSave(next, grid);
        return next;
      });
    },
    [grid, scheduleSave],
  );

  const resizeItem = useCallback(
    (id: string, w: number, h: number) => {
      setItems((prev) => {
        const next = prev.map((it) => (it.id === id ? { ...it, w, h } : it));
        scheduleSave(next, grid);
        return next;
      });
    },
    [grid, scheduleSave],
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((it) => it.id !== id);
        scheduleSave(next, grid);
        return next;
      });
    },
    [grid, scheduleSave],
  );

  const updateItemData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setItems((prev) => {
        const next = prev.map((it) =>
          it.type === "widget" && it.id === id ? { ...it, data: { ...it.data, ...data } } : it,
        );
        scheduleSave(next, grid);
        return next;
      });
    },
    [grid, scheduleSave],
  );

  const addItem = useCallback(
    (item: DesktopItem) => {
      setItems((prev) => {
        const next = [...prev, item];
        scheduleSave(next, grid);
        return next;
      });
    },
    [grid, scheduleSave],
  );

  const setItemsFromBookmarks = useCallback(
    (bookmarks: { id: string; title: string; url: string }[]) => {
      const shortcuts: ShortcutItem[] = bookmarks.map((bm, i) => ({
        id: bm.id,
        type: "shortcut" as const,
        name: bm.title || "未命名",
        url: bm.url,
        color: "rgba(59, 130, 246, 0.2)",
        x: i % grid.cols,
        y: Math.floor(i / grid.cols),
        w: 1,
        h: 1,
        page: 0,
      }));
      setItems(shortcuts);
      scheduleSave(shortcuts, grid);
    },
    [grid, scheduleSave],
  );

  const itemPositionStyle = useCallback(
    (item: DesktopItem) => {
      const left = item.x * (grid.cellSize + grid.gap);
      const top = item.y * (grid.cellSize + grid.gap);
      const width =
        item.type === "shortcut" ? grid.cellSize : item.w * grid.cellSize + (item.w - 1) * grid.gap;
      const height =
        item.type === "shortcut" ? grid.cellSize : item.h * grid.cellSize + (item.h - 1) * grid.gap;
      return { left, top, width, height };
    },
    [grid],
  );

  return {
    items,
    setItems,
    grid,
    containerRef,
    moveItem,
    resizeItem,
    removeItem,
    addItem,
    updateItemData,
    setItemsFromBookmarks,
    loadLayout,
    recalcGrid,
    scheduleSave,
    itemPositionStyle,
  };
}
