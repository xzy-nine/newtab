/**
 * 桌面项目的类型、校验与纯函数工具。
 *
 * 页面里只有主桌面一个桌面：独立存储，可放文件夹图标、快捷方式与小部件，
 * 与"当前书签文件夹"无关。文件夹内容按需读取（弹窗或 Dock 浮层），不落盘。
 *
 * 本模块只放不依赖浏览器 API 的纯逻辑，便于单元测试；读写存储见
 * `desktop-storage.ts`。
 */

/** 桌面项目类型。 */
type ItemType = "shortcut" | "widget" | "folder";

/** 桌面项目的公共字段。 */
interface BaseItem {
  id: string;
  type: ItemType;
  /** 占用的列数。 */
  w: number;
  /** 占用的行数。 */
  h: number;
}

/** 网址快捷方式。 */
export interface ShortcutItem extends BaseItem {
  type: "shortcut";
  name: string;
  url: string;
  icon?: string;
  color?: string;
}

/** 小部件实例。 */
export interface WidgetItemData extends BaseItem {
  type: "widget";
  widgetType: string;
  title?: string;
  data?: Record<string, unknown>;
}

/** 主桌面上的文件夹图标（指向一个书签文件夹）。 */
export interface FolderItem extends BaseItem {
  type: "folder";
  /** 书签文件夹 id。 */
  folderId: string;
  name: string;
  /**
   * 1x1 时是否显示 2x2 迷你预览。
   * 默认 false（普通图标）；向右轻拉缩放手柄切换为 true，向左拖回变回图标。
   * w ≥ 2 时该字段无意义（走展开块形态）。
   */
  preview?: boolean;
}

/** 桌面项目联合类型。 */
export type DesktopItem = ShortcutItem | WidgetItemData | FolderItem;

/** 主桌面独立存储键。 */
export const HOME_DESKTOP_STORAGE_KEY = "newtab:home-desktop";
/** 旧版文件夹布局存储键（仅用于迁移旧小部件）。 */
export const DESKTOP_LAYOUTS_STORAGE_KEY = "desktopLayouts";
/** 旧版小部件容器存储键（迁移来源）。 */
export const LEGACY_WIDGETS_STORAGE_KEY = "widgets";
/** 固定文件夹列表存储键（与主桌面同步）。 */
export const PINNED_FOLDERS_STORAGE_KEY = "pinnedFolders";

export const DEFAULT_ITEM_NAME = "未命名";
export const DEFAULT_SHORTCUT_COLOR = "rgba(59, 130, 246, 0.2)";

/** 书签文件夹信息（用于文件夹图标标题）。 */
export interface BookmarkFolderLike {
  id: string;
  title: string;
}

/** 书签条目信息。 */
export interface BookmarkLike {
  id: string;
  title: string;
  url: string;
}

/** 文件夹图标的固定 id 规则。 */
export function folderItemId(folderId: string): string {
  return `folder:${folderId}`;
}

export function isShortcutItem(item: DesktopItem): item is ShortcutItem {
  return item.type === "shortcut";
}

export function isWidgetItem(item: DesktopItem): item is WidgetItemData {
  return item.type === "widget";
}

export function isFolderItem(item: DesktopItem): item is FolderItem {
  return item.type === "folder";
}

/**
 * 文件夹图标拉开成"展开块"所需的最小列数。
 * 1x1（1 列）是普通图标；拉开到 2 列及以上即展开成显示书签的小部件形态。
 */
export const FOLDER_PANEL_MIN_W = 2;

/**
 * 文件夹磁贴的三种形态：
 * - "icon"：1x1 普通图标（默认）；
 * - "preview"：1x1 但内部显示 2x2 迷你预览；
 * - "expanded"：w ≥ 2，展开成大图标网格。
 */
export type FolderTileForm = "icon" | "preview" | "expanded";

/** 判断文件夹磁贴当前形态。 */
export function folderTileForm(item: FolderItem): FolderTileForm {
  if (item.w >= FOLDER_PANEL_MIN_W) return "expanded";
  return item.preview ? "preview" : "icon";
}

/** 文件夹是否已展开（w ≥ 2）。 */
export function isExpandedFolderItem(item: DesktopItem): boolean {
  return isFolderItem(item) && item.w >= FOLDER_PANEL_MIN_W;
}

/** 拖动多少（相对一格的像素宽度）才算"轻拉一下"。 */
const FOLDER_PREVIEW_DRAG_RATIO = 0.3;

/** 文件夹缩放的输入与结果。 */
export interface FolderResizeInput {
  /** 拖动前的宽度。 */
  origW: number;
  /** 拖动前是否处于 1x1 预览态。 */
  origPreview: boolean;
  /** 由横向位移换算出、已四舍五入的列数。 */
  rawW: number;
  /** 横向位移（像素，右为正）。 */
  dx: number;
  /** 一格的像素宽度（用于换算轻拉阈值）。 */
  unitWidth: number;
  /** 最大列数。 */
  maxCols: number;
}

/**
 * 计算文件夹磁贴缩放后的宽度与预览态。
 *
 * 规则（对应"1x1 默认图标，轻轻向右拉开变 1x1 预览"）：
 * - 拉宽到 ≥ 2 列 → 展开块（不看 preview）；
 * - 已展开时缩回 1 列 → 回到普通图标（不保留预览）；
 * - 停在 1 列时，向右轻拉超过阈值开启预览，向左轻拉超过阈值关闭预览，
 *   位移不足则维持原状。
 */
export function resolveFolderResize(input: FolderResizeInput): {
  w: number;
  preview: boolean;
} {
  const maxCols = Math.max(1, Math.floor(input.maxCols));
  const w = Math.max(1, Math.min(maxCols, Math.round(input.rawW)));

  if (w >= FOLDER_PANEL_MIN_W) return { w, preview: false };
  // 从展开态缩回 1 列 → 普通图标。
  if (input.origW >= FOLDER_PANEL_MIN_W) return { w: 1, preview: false };

  const threshold = Math.max(6, input.unitWidth * FOLDER_PREVIEW_DRAG_RATIO);
  if (input.dx > threshold) return { w: 1, preview: true };
  if (input.dx < -threshold) return { w: 1, preview: false };
  return { w: 1, preview: input.origPreview };
}

/** 展开块内部网格的排布结果。 */
export interface FolderGridLayout {
  /** 实际渲染的书签数量。 */
  visibleCount: number;
  /** 收纳为 "+N" 的数量；0 表示不显示 +N。 */
  overflow: number;
}

/**
 * 按"实际可用的网格槽位"决定文件夹内部显示哪些书签。
 *
 * 与旧的固定上限不同，这里依据真实渲染出的槽位数：
 * - 书签放得下就全部显示，不出现 +N；
 * - 放不下时留出最后一格放 "+N"，因此 +N 始终位于真正的末尾。
 *
 * @param availableSlots 实际可渲染的槽位数（列 × 行）。
 * @param total 该文件夹内的书签总数。
 */
export function folderGridLayout(availableSlots: number, total: number): FolderGridLayout {
  const slots = Math.max(0, Math.floor(availableSlots));
  const count = Math.max(0, Math.floor(total));
  if (slots <= 0) return { visibleCount: 0, overflow: count };
  if (count <= slots) return { visibleCount: count, overflow: 0 };
  // 需要 +N，占掉最后一格。
  return { visibleCount: slots - 1, overflow: count - (slots - 1) };
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * 把存储中的未知结构规范化为桌面项目；无法识别时返回 null。
 */
export function normalizeDesktopItem(raw: unknown): DesktopItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" && r.id ? r.id : null;
  if (!id) return null;

  const w = positiveNumber(r.w, 1);
  const h = positiveNumber(r.h, 1);

  if (r.type === "folder") {
    if (typeof r.folderId !== "string" || !r.folderId) return null;
    return {
      id,
      type: "folder",
      folderId: r.folderId,
      name: typeof r.name === "string" ? r.name : "",
      preview: r.preview === true,
      w,
      h,
    };
  }

  if (r.type === "widget") {
    if (typeof r.widgetType !== "string" || !r.widgetType) return null;
    const data =
      r.data && typeof r.data === "object" && !Array.isArray(r.data)
        ? (r.data as Record<string, unknown>)
        : undefined;
    return {
      id,
      type: "widget",
      widgetType: r.widgetType,
      title: optionalString(r.title),
      data,
      w,
      h,
    };
  }

  if (r.type === "shortcut") {
    if (typeof r.url !== "string" || !r.url) return null;
    return {
      id,
      type: "shortcut",
      name: typeof r.name === "string" && r.name ? r.name : r.url,
      url: r.url,
      icon: optionalString(r.icon),
      color: optionalString(r.color),
      w,
      h,
    };
  }

  return null;
}

/** 规范化一组桌面项目，丢弃无法识别的条目。 */
export function normalizeDesktopItems(raw: unknown): DesktopItem[] {
  if (!Array.isArray(raw)) return [];
  const items: DesktopItem[] = [];
  for (const entry of raw) {
    const item = normalizeDesktopItem(entry);
    if (item) items.push(item);
  }
  return items;
}

/**
 * 按固定文件夹列表生成文件夹图标（保持列表顺序）。
 */
export function seedFolderItems(
  pinnedFolderIds: string[],
  folderTitles: Record<string, string> = {},
): FolderItem[] {
  return pinnedFolderIds.map((folderId) => ({
    id: folderItemId(folderId),
    type: "folder" as const,
    folderId,
    name: folderTitles[folderId] || DEFAULT_ITEM_NAME,
    w: 1,
    h: 1,
  }));
}

/**
 * 让主桌面的文件夹图标与"固定文件夹"列表保持一致：
 * 保留仍固定的图标（在原位置、刷新标题），移除已取消固定的，
 * 新固定的追加到末尾；其余项目位置不变。
 */
export function reconcileFolderItems(
  items: DesktopItem[],
  pinnedFolderIds: string[],
  folderTitles: Record<string, string> = {},
): DesktopItem[] {
  const pinnedSet = new Set(pinnedFolderIds);
  const present = new Set<string>();

  const next: DesktopItem[] = [];
  for (const item of items) {
    if (!isFolderItem(item)) {
      next.push(item);
      continue;
    }
    if (!pinnedSet.has(item.folderId)) continue;
    present.add(item.folderId);
    next.push({ ...item, name: folderTitles[item.folderId] || item.name });
  }

  for (const folderId of pinnedFolderIds) {
    if (present.has(folderId)) continue;
    next.push({
      id: folderItemId(folderId),
      type: "folder",
      folderId,
      name: folderTitles[folderId] || DEFAULT_ITEM_NAME,
      w: 1,
      h: 1,
    });
  }

  return next;
}

/**
 * 判断两个项目列表在"渲染身份"上是否等价（id、顺序、类型、文件夹标题），
 * 用于避免同步副作用无谓地更新状态。
 */
export function hasSameItemIdentity(a: DesktopItem[], b: DesktopItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x.id !== y.id || x.type !== y.type) return false;
    if (isFolderItem(x) && isFolderItem(y) && x.name !== y.name) return false;
  }
  return true;
}

/** 旧版 `widgets` 键中的容器结构。 */
interface LegacyWidgetContainer {
  id?: unknown;
  items?: unknown;
}

/**
 * 从旧版 `widgets` 容器与文件夹布局中收集所有小部件，
 * 并规范化为桌面小部件项（按 id 去重，先出现的优先）。
 */
export function collectWidgetItems(sources: {
  layouts?: Record<string, { items?: unknown } | undefined>;
  legacyContainers?: unknown;
}): WidgetItemData[] {
  const result: WidgetItemData[] = [];
  const seen = new Set<string>();

  const push = (item: DesktopItem | null) => {
    if (!item || !isWidgetItem(item) || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  };

  const layouts = sources.layouts;
  if (layouts && typeof layouts === "object") {
    for (const layout of Object.values(layouts)) {
      for (const item of normalizeDesktopItems(layout?.items)) push(item);
    }
  }

  if (Array.isArray(sources.legacyContainers)) {
    for (const raw of sources.legacyContainers) {
      if (!raw || typeof raw !== "object") continue;
      const container = raw as LegacyWidgetContainer;
      const containerId = typeof container.id === "string" ? container.id : "";
      if (!containerId || !Array.isArray(container.items)) continue;
      for (const entry of container.items) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        push(
          normalizeDesktopItem({
            id: `${containerId}-${String(item.id ?? "")}`,
            type: "widget",
            widgetType: item.type,
            title: item.type,
            data: item.data,
            w: 2,
            h: 2,
          }),
        );
      }
    }
  }

  return result;
}

/**
 * 去掉文件夹布局中的小部件（文件夹桌面不再绑定小部件），
 * 返回新的布局映射；空布局会被丢弃。
 */
export function stripWidgetsFromLayouts(
  layouts: Record<string, { items?: unknown } | undefined>,
): Record<string, { items: DesktopItem[] }> {
  const next: Record<string, { items: DesktopItem[] }> = {};
  for (const [folderId, layout] of Object.entries(layouts)) {
    const items = normalizeDesktopItems(layout?.items).filter((item) => !isWidgetItem(item));
    if (items.length === 0) continue;
    next[folderId] = { items };
  }
  return next;
}
