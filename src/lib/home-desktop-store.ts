import { create } from "zustand";
import {
  DEFAULT_ITEM_NAME,
  DEFAULT_SHORTCUT_COLOR,
  hasSameItemIdentity,
  isWidgetItem,
  reconcileFolderItems,
  type BookmarkFolderLike,
  type BookmarkLike,
  type DesktopItem,
  type ShortcutItem,
} from "@/lib/desktop-items";
import { loadHomeDesktop, saveHomeDesktop } from "@/lib/desktop-storage";

/**
 * 主桌面项目的共享状态。
 *
 * 主桌面本身与"文件夹视图右侧的书签列表"需要读写同一份数据
 * （固定/取消固定书签 = 增删桌面上的快捷方式），因此放在 store 里共享，
 * 而不是各自持有组件内状态。
 */

/** 保存防抖间隔（毫秒）。 */
const SAVE_DEBOUNCE_MS = 250;

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePersist(items: DesktopItem[]) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveHomeDesktop(items);
  }, SAVE_DEBOUNCE_MS);
}

function generateId(): string {
  return `desktop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 由书签构造桌面快捷方式。 */
export function shortcutFromBookmark(bookmark: BookmarkLike): ShortcutItem {
  return {
    id: `shortcut:${bookmark.id}`,
    type: "shortcut",
    name: bookmark.title || bookmark.url || DEFAULT_ITEM_NAME,
    url: bookmark.url,
    color: DEFAULT_SHORTCUT_COLOR,
    w: 1,
    h: 1,
  };
}

interface HomeDesktopState {
  items: DesktopItem[];
  /** 读取主桌面（首次会执行一次性迁移）；需在书签文件夹就绪后调用。 */
  hydrate: (folders: BookmarkFolderLike[]) => Promise<void>;
  /** 直接替换列表并保存。 */
  replaceItems: (items: DesktopItem[]) => void;
  addItem: (item: DesktopItem) => void;
  removeItem: (id: string) => void;
  updateItemData: (id: string, data: Record<string, unknown>) => void;
  moveItemIndex: (fromIndex: number, toIndex: number) => void;
  /** 让文件夹图标跟随固定文件夹列表（新增/移除/刷新标题）。 */
  syncFolderItems: (pinnedFolderIds: string[], folderTitles: Record<string, string>) => void;
  /** 把书签固定到主桌面（按 URL 去重，已存在的跳过）。 */
  pinBookmarks: (bookmarks: BookmarkLike[]) => void;
  /** 按 URL 取消固定（只移除快捷方式，不动文件夹图标与小部件）。 */
  unpinBookmarks: (urls: string[]) => void;
}

export const useHomeDesktop = create<HomeDesktopState>((set, get) => ({
  items: [],

  hydrate: async (folders) => {
    const items = await loadHomeDesktop(folders);
    set({ items });
  },

  replaceItems: (items) => {
    set({ items });
    schedulePersist(items);
  },

  addItem: (item) => {
    const items = [...get().items, item];
    set({ items });
    schedulePersist(items);
  },

  removeItem: (id) => {
    const items = get().items.filter((it) => it.id !== id);
    set({ items });
    schedulePersist(items);
  },

  updateItemData: (id, data) => {
    const items = get().items.map((it) =>
      isWidgetItem(it) && it.id === id ? { ...it, data: { ...it.data, ...data } } : it,
    );
    set({ items });
    schedulePersist(items);
  },

  moveItemIndex: (fromIndex, toIndex) => {
    const prev = get().items;
    if (fromIndex === toIndex) return;
    const items = [...prev];
    const [moved] = items.splice(fromIndex, 1);
    if (!moved) return;
    items.splice(Math.max(0, Math.min(toIndex, items.length)), 0, moved);
    set({ items });
    schedulePersist(items);
  },

  syncFolderItems: (pinnedFolderIds, folderTitles) => {
    const prev = get().items;
    const items = reconcileFolderItems(prev, pinnedFolderIds, folderTitles);
    // 无变化时保持引用不变，避免多余渲染与落盘。
    if (hasSameItemIdentity(prev, items)) return;
    set({ items });
    schedulePersist(items);
  },

  pinBookmarks: (bookmarks) => {
    const prev = get().items;
    const pinnedUrls = new Set(
      prev.filter((it): it is ShortcutItem => it.type === "shortcut").map((it) => it.url),
    );
    // 同一 URL 只固定一次；请求内也去重。
    const seen = new Set<string>();
    const additions: ShortcutItem[] = [];
    for (const bookmark of bookmarks) {
      if (!bookmark.url || pinnedUrls.has(bookmark.url) || seen.has(bookmark.url)) continue;
      seen.add(bookmark.url);
      additions.push(shortcutFromBookmark(bookmark));
    }
    if (additions.length === 0) return;
    const items = [...prev, ...additions];
    set({ items });
    schedulePersist(items);
  },

  unpinBookmarks: (urls) => {
    const targets = new Set(urls);
    if (targets.size === 0) return;
    const prev = get().items;
    const items = prev.filter((it) => !(it.type === "shortcut" && targets.has(it.url)));
    if (items.length === prev.length) return;
    set({ items });
    schedulePersist(items);
  },
}));

/** 生成一个桌面项目 id（供"添加小部件/快捷方式"使用）。 */
export function createDesktopItemId(): string {
  return generateId();
}
