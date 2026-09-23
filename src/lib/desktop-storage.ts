/**
 * 主桌面的持久化。
 *
 * 主桌面独立存储于 `newtab:home-desktop`，完全独立于书签文件夹。
 *
 * 首次读取时会做一次性迁移（从旧版"固定文件夹"模型迁到独立主桌面）：
 * 1. 收集所有文件夹布局与旧版 `widgets` 键中的小部件，搬到主桌面；
 * 2. 从文件夹布局中移除小部件（文件夹桌面不再绑定小部件）；
 * 3. 按旧版固定文件夹数量决定如何处置书签：
 *    - 0 个：把收藏夹栏（根目录）本身的书签释放为主桌面快捷方式；
 *    - 1 个：直接解除固定，把该文件夹的书签释放为主桌面快捷方式；
 *    - 多个：先播种文件夹图标，并返回待决选择，由 UI 弹窗让用户挑一个
 *      释放到主桌面（其余仍固定）。
 */

import {
  DESKTOP_LAYOUTS_STORAGE_KEY,
  HOME_DESKTOP_STORAGE_KEY,
  LEGACY_WIDGETS_STORAGE_KEY,
  PINNED_FOLDERS_STORAGE_KEY,
  collectWidgetItems,
  normalizeDesktopItems,
  reconcileFolderItems,
  seedFolderItems,
  shortcutsFromBookmarks,
  stripWidgetsFromLayouts,
  type BookmarkFolderLike,
  type BookmarkLike,
  type DesktopItem,
} from "./desktop-items";

interface HomeDesktopRecord {
  items: DesktopItem[];
}

type LayoutRecord = { items: DesktopItem[] };

/**
 * 一次性迁移待决：旧版有多个固定文件夹时，需用户选择释放哪一个到主桌面。
 * 其余文件夹仍以图标形式固定。
 */
export interface PendingFolderChoice {
  candidateFolderIds: string[];
}

/** `loadHomeDesktop` 的返回：主桌面项目 + 可能的待决迁移选择。 */
export interface HomeDesktopLoadResult {
  items: DesktopItem[];
  pendingFolderChoice?: PendingFolderChoice;
}

/** 从书签文件夹列表构造 id → 标题 映射。 */
function folderTitlesFrom(folders: BookmarkFolderLike[]): Record<string, string> {
  const titles: Record<string, string> = {};
  for (const folder of folders) {
    if (folder.id) titles[folder.id] = folder.title;
  }
  return titles;
}

async function readLayouts(): Promise<Record<string, LayoutRecord>> {
  try {
    const result = await chrome.storage.local.get(DESKTOP_LAYOUTS_STORAGE_KEY);
    const raw = result[DESKTOP_LAYOUTS_STORAGE_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const layouts: Record<string, LayoutRecord> = {};
    for (const [folderId, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      layouts[folderId] = { items: normalizeDesktopItems((value as { items?: unknown }).items) };
    }
    return layouts;
  } catch {
    return {};
  }
}

async function readPinnedFolderIds(): Promise<string[]> {
  try {
    const result = await chrome.storage.local.get(PINNED_FOLDERS_STORAGE_KEY);
    const raw = result[PINNED_FOLDERS_STORAGE_KEY];
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** 写入固定文件夹列表（迁移解除固定时调用）。 */
async function writePinnedFolderIds(ids: string[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [PINNED_FOLDERS_STORAGE_KEY]: ids });
  } catch {
    /* 写入失败不阻塞迁移 */
  }
}

/** 读取某个书签文件夹内的直接书签（仅一层，不含子文件夹）。 */
export async function fetchFolderBookmarks(folderId: string): Promise<BookmarkLike[]> {
  try {
    const [folder] = await chrome.bookmarks.getSubTree(folderId);
    if (folder?.children) {
      return folder.children
        .filter((c): c is chrome.bookmarks.BookmarkTreeNode & { url: string } => !!c.url)
        .map((c) => ({ id: c.id, title: c.title || c.url, url: c.url }));
    }
  } catch (e) {
    console.error("读取文件夹书签失败:", e);
  }
  return [];
}

/**
 * 读取收藏夹栏（书签栏根目录）本身的直接书签。
 *
 * Chrome 的书签树根节点 `tree[0]` 的第一个子节点即"书签栏"，
 * 其直接书签子节点就是用户放在栏上的网址。
 */
export async function fetchBookmarksBarBookmarks(): Promise<BookmarkLike[]> {
  try {
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0]?.children?.[0];
    if (bar?.children) {
      return bar.children
        .filter((c): c is chrome.bookmarks.BookmarkTreeNode & { url: string } => !!c.url)
        .map((c) => ({ id: c.id, title: c.title || c.url, url: c.url }));
    }
  } catch (e) {
    console.error("读取收藏夹栏失败:", e);
  }
  return [];
}

/** 写入主桌面项目。 */
export async function saveHomeDesktop(items: DesktopItem[]): Promise<void> {
  try {
    const record: HomeDesktopRecord = { items };
    await chrome.storage.local.set({ [HOME_DESKTOP_STORAGE_KEY]: record });
  } catch (e) {
    console.error("保存主桌面失败:", e);
  }
}

/**
 * 读取主桌面项目；存储中不存在时执行一次性迁移。
 * @param folders 当前书签文件夹列表，用于命名播种的文件夹图标。
 */
export async function loadHomeDesktop(
  folders: BookmarkFolderLike[] = [],
): Promise<HomeDesktopLoadResult> {
  const titles = folderTitlesFrom(folders);
  let stored: unknown;
  let exists = false;
  try {
    const result = await chrome.storage.local.get(HOME_DESKTOP_STORAGE_KEY);
    stored = result[HOME_DESKTOP_STORAGE_KEY];
    exists = stored !== undefined;
  } catch {
    return { items: [] };
  }

  if (!exists) {
    return migrateHomeDesktop(titles);
  }

  const record = stored as Partial<HomeDesktopRecord> | null;
  const items = normalizeDesktopItems(record?.items);
  const pinnedIds = await readPinnedFolderIds();
  // 已存在时仍需让文件夹图标跟随固定列表变化。
  return { items: reconcileFolderItems(items, pinnedIds, titles) };
}

/**
 * 一次性迁移：把散落在文件夹布局与旧版 widgets 键中的小部件搬到主桌面，
 * 同时清除文件夹布局中的小部件，并按旧版固定文件夹数量处置书签。
 */
async function migrateHomeDesktop(titles: Record<string, string>): Promise<HomeDesktopLoadResult> {
  const { layouts, legacyContainers } = await readLegacySources();
  const widgets = collectWidgetItems({ layouts, legacyContainers });
  const pinnedIds = await readPinnedFolderIds();

  let items: DesktopItem[];
  let pendingFolderChoice: PendingFolderChoice | undefined;

  if (pinnedIds.length === 0) {
    // 无固定文件夹：把收藏夹栏本身的书签释放到主桌面。
    const barBookmarks = await fetchBookmarksBarBookmarks();
    items = [...shortcutsFromBookmarks(barBookmarks), ...widgets];
  } else if (pinnedIds.length === 1) {
    // 只有一个固定文件夹：直接解除固定并释放其书签。
    const folderId = pinnedIds[0]!;
    const folderBookmarks = await fetchFolderBookmarks(folderId);
    items = [...shortcutsFromBookmarks(folderBookmarks), ...widgets];
    await writePinnedFolderIds([]);
  } else {
    // 多个固定文件夹：先播种图标，再让用户选择释放哪一个。
    items = [...seedFolderItems(pinnedIds, titles), ...widgets];
    pendingFolderChoice = { candidateFolderIds: pinnedIds };
  }

  await saveHomeDesktop(items);
  await dropWidgetsFromLayouts(layouts);
  return { items, pendingFolderChoice };
}

/** 读取文件夹布局与旧版 widgets 容器。 */
async function readLegacySources(): Promise<{
  layouts: Record<string, LayoutRecord>;
  legacyContainers: unknown;
}> {
  try {
    const layouts = await readLayouts();
    const legacy = await chrome.storage.local.get(LEGACY_WIDGETS_STORAGE_KEY);
    return { layouts, legacyContainers: legacy[LEGACY_WIDGETS_STORAGE_KEY] };
  } catch {
    return { layouts: {}, legacyContainers: undefined };
  }
}

/** 把文件夹布局中的小部件清掉（迁移后调用，避免重复搬移）。 */
async function dropWidgetsFromLayouts(layouts: Record<string, LayoutRecord>): Promise<void> {
  try {
    await chrome.storage.local.set({
      [DESKTOP_LAYOUTS_STORAGE_KEY]: stripWidgetsFromLayouts(layouts),
    });
  } catch {
    /* 清理失败不阻塞主桌面 */
  }
}
