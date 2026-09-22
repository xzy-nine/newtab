/**
 * 主桌面的持久化。
 *
 * 主桌面独立存储于 `newtab:home-desktop`，完全独立于书签文件夹。
 *
 * 首次读取时会做一次性迁移：
 * 1. 收集所有文件夹布局与旧版 `widgets` 键中的小部件，搬到主桌面；
 * 2. 从文件夹布局中移除小部件（文件夹桌面不再绑定小部件）；
 * 3. 用当前固定文件夹列表为主桌面播种文件夹图标。
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
  stripWidgetsFromLayouts,
  type BookmarkFolderLike,
  type DesktopItem,
} from "./desktop-items";

interface HomeDesktopRecord {
  items: DesktopItem[];
}

type LayoutRecord = { items: DesktopItem[] };

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
export async function loadHomeDesktop(folders: BookmarkFolderLike[] = []): Promise<DesktopItem[]> {
  const titles = folderTitlesFrom(folders);
  let stored: unknown;
  let exists = false;
  try {
    const result = await chrome.storage.local.get(HOME_DESKTOP_STORAGE_KEY);
    stored = result[HOME_DESKTOP_STORAGE_KEY];
    exists = stored !== undefined;
  } catch {
    return [];
  }

  if (!exists) {
    return migrateHomeDesktop(titles);
  }

  const record = stored as Partial<HomeDesktopRecord> | null;
  const items = normalizeDesktopItems(record?.items);
  const pinnedIds = await readPinnedFolderIds();
  // 已存在时仍需让文件夹图标跟随固定列表变化。
  return reconcileFolderItems(items, pinnedIds, titles);
}

/**
 * 一次性迁移：把散落在文件夹布局与旧版 widgets 键中的小部件搬到主桌面，
 * 同时清除文件夹布局中的小部件。
 */
async function migrateHomeDesktop(titles: Record<string, string>): Promise<DesktopItem[]> {
  const { layouts, legacyContainers } = await readLegacySources();
  const widgets = collectWidgetItems({ layouts, legacyContainers });
  const pinnedIds = await readPinnedFolderIds();
  const items: DesktopItem[] = [...seedFolderItems(pinnedIds, titles), ...widgets];

  await saveHomeDesktop(items);
  await dropWidgetsFromLayouts(layouts);
  return items;
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
