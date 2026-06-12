import { useState, useEffect, useCallback, useRef } from "react";

export type ItemType = "shortcut" | "widget";

export interface BaseItem {
  id: string;
  type: ItemType;
  w: number;
  h: number;
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

export function useDesktopGrid(folderId?: string) {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const saveLayout = useCallback(
    async (currentItems: DesktopItem[]) => {
      if (!folderId) return;
      try {
        const result = await chrome.storage.local.get("desktopLayouts");
        const layouts = (result.desktopLayouts || {}) as Record<string, unknown>;
        layouts[folderId] = {
          items: currentItems.map((it) => {
            const base = { id: it.id, type: it.type, w: it.w, h: it.h };
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
            return { ...base, widgetType: it.widgetType, title: it.title, data: it.data };
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
    (currentItems: DesktopItem[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveLayout(currentItems), 250);
    },
    [saveLayout],
  );

  const loadLayout = useCallback(async () => {
    if (!folderId) return null;
    try {
      const result = await chrome.storage.local.get("desktopLayouts");
      const layouts = (result.desktopLayouts || {}) as Record<string, { items: DesktopItem[] }>;
      return layouts[folderId] || null;
    } catch {
      return null;
    }
  }, [folderId]);

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => {
        const next = prev.filter((it) => it.id !== id);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const updateItemData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setItems((prev) => {
        const next = prev.map((it) =>
          it.type === "widget" && it.id === id ? { ...it, data: { ...it.data, ...data } } : it,
        );
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const addItem = useCallback(
    (item: DesktopItem) => {
      setItems((prev) => {
        const next = [...prev, item];
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const setItemsFromBookmarks = useCallback(
    (bookmarks: { id: string; title: string; url: string }[]) => {
      const shortcuts: ShortcutItem[] = bookmarks.map((bm) => ({
        id: bm.id,
        type: "shortcut" as const,
        name: bm.title || "未命名",
        url: bm.url,
        color: "rgba(59, 130, 246, 0.2)",
        w: 1,
        h: 1,
      }));
      setItems(shortcuts);
      scheduleSave(shortcuts);
    },
    [scheduleSave],
  );

  const moveItemIndex = useCallback(
    (fromIndex: number, toIndex: number) => {
      setItems((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  return {
    items,
    setItems,
    removeItem,
    addItem,
    updateItemData,
    setItemsFromBookmarks,
    loadLayout,
    scheduleSave,
    moveItemIndex,
  };
}
