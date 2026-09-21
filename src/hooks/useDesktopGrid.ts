import { useCallback, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ITEM_NAME,
  DEFAULT_SHORTCUT_COLOR,
  hasSameItemIdentity,
  isWidgetItem,
  reconcileFolderItems,
  type BookmarkFolderLike,
  type DesktopItem,
  type ShortcutItem,
} from "@/lib/desktop-items";
import { loadHomeDesktop, saveHomeDesktop } from "@/lib/desktop-storage";

export type {
  BaseItem,
  DesktopItem,
  FolderItem,
  ItemType,
  ShortcutItem,
  WidgetItemData,
} from "@/lib/desktop-items";

/** 主桌面保存的防抖间隔（毫秒）。 */
const SAVE_DEBOUNCE_MS = 250;

function generateId(): string {
  return `desktop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 主桌面的状态与持久化。
 *
 * @param folders 书签文件夹列表，用于给文件夹图标命名。
 */
export function useDesktopGrid(folders: BookmarkFolderLike[] = []) {
  const [items, setItems] = useState<DesktopItem[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const folderTitles = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const folder of folders) {
      if (folder.id) titles[folder.id] = folder.title;
    }
    return titles;
  }, [folders]);

  const persist = useCallback(async (nextItems: DesktopItem[]) => {
    await saveHomeDesktop(nextItems);
  }, []);

  const scheduleSave = useCallback(
    (nextItems: DesktopItem[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => persist(nextItems), SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  /** 读取主桌面项目（首次读取会执行一次性迁移）。 */
  const load = useCallback(async (): Promise<DesktopItem[]> => loadHomeDesktop(folders), [folders]);

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
          isWidgetItem(it) && it.id === id ? { ...it, data: { ...it.data, ...data } } : it,
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

  const moveItemIndex = useCallback(
    (fromIndex: number, toIndex: number) => {
      setItems((prev) => {
        if (fromIndex === toIndex) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        if (!moved) return prev;
        next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, moved);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  /** 让文件夹图标跟随固定文件夹列表（新增/移除/刷新标题）。 */
  const syncFolderItems = useCallback(
    (pinnedFolderIds: string[]) => {
      setItems((prev) => {
        const next = reconcileFolderItems(prev, pinnedFolderIds, folderTitles);
        // 无变化时保持引用不变，避免多余渲染与落盘。
        if (hasSameItemIdentity(prev, next)) return prev;
        scheduleSave(next);
        return next;
      });
    },
    [folderTitles, scheduleSave],
  );

  /** 直接替换项目列表并保存（加载完成后使用）。 */
  const replaceItems = useCallback(
    (next: DesktopItem[], save = true) => {
      setItems(next);
      if (save) scheduleSave(next);
    },
    [scheduleSave],
  );

  const addShortcut = useCallback(
    (name: string, url: string) => {
      const item: ShortcutItem = {
        id: generateId(),
        type: "shortcut",
        name: name || DEFAULT_ITEM_NAME,
        url,
        color: DEFAULT_SHORTCUT_COLOR,
        w: 1,
        h: 1,
      };
      addItem(item);
    },
    [addItem],
  );

  const addWidget = useCallback(
    (widgetType: string) => {
      addItem({
        id: generateId(),
        type: "widget",
        widgetType,
        title: widgetType,
        data: {},
        w: 2,
        h: 2,
      });
    },
    [addItem],
  );

  return {
    items,
    setItems,
    replaceItems,
    load,
    scheduleSave,
    removeItem,
    addItem,
    addShortcut,
    addWidget,
    updateItemData,
    moveItemIndex,
    syncFolderItems,
  };
}
