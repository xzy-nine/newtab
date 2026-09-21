import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Folder, Maximize2 } from "lucide-react";
import { fetchIconFromSources, generateInitialBasedIcon, getDomain } from "@/lib/icon-manager";
import { getWidget } from "@/lib/widget-registry";
import { getMessage } from "@/lib/i18n";
import { useFolderBookmarks } from "@/hooks/useFolderBookmarks";
import {
  FOLDER_PREVIEW_COLS,
  FOLDER_PREVIEW_ROWS,
  folderGridLayout,
  type FolderItem,
  type ShortcutItem,
  type WidgetItemData,
} from "@/lib/desktop-items";

/**
 * 桌面图标与文件夹展开块的展示单元。
 */

/** 网址快捷方式图标：优先取真实 favicon，失败时用首字母底色图标。 */
export function ShortcutIcon({ url, name, color }: { url: string; name: string; color?: string }) {
  const [iconSrc, setIconSrc] = useState<string | null>(null);

  const handleImgError = useCallback(() => {
    setIconSrc(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!url) {
        if (!cancelled) setIconSrc(null);
        return;
      }
      try {
        const realIcon = await fetchIconFromSources(url, getDomain(url));
        if (!cancelled && realIcon) {
          setIconSrc(realIcon);
          return;
        }
      } catch {
        /* 忽略 */
      }
      if (!cancelled) {
        const fallback = generateInitialBasedIcon(getDomain(url));
        setIconSrc(fallback || null);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="desktop-shortcut-icon" style={{ backgroundColor: color || "#3b82f6" }}>
      {iconSrc ? (
        <img src={iconSrc} alt={name} className="desktop-shortcut-img" onError={handleImgError} />
      ) : (
        <span className="desktop-shortcut-letter">{name?.[0] || "?"}</span>
      )}
    </div>
  );
}

/** 快捷方式图标块（图标 + 名称）。 */
export function ShortcutTile({ item }: { item: ShortcutItem }) {
  return (
    <div className="desktop-shortcut-inner">
      <ShortcutIcon url={item.url} name={item.name} color={item.color} />
      <span className="desktop-shortcut-name">{item.name}</span>
    </div>
  );
}

/**
 * 用 ResizeObserver 跟踪元素的内部可用尺寸。
 *
 * 首次测量放在 layout effect 中（绘制前完成），避免先按 0 槽位渲染一帧，
 * 造成列表闪烁。
 */
function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setSize((prev) => {
        const next = { width: el.clientWidth, height: el.clientHeight };
        return prev.width === next.width && prev.height === next.height ? prev : next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

/**
 * 与 CSS 中 `.desktop-folder-panel` / `.desktop-shortcut-inner.is-preview`
 * 保持一致的尺寸常量，用于由实测像素反推内部网格槽位。
 * HEADER 含标题自身与其下方的 gap，避免高估行数而把 +N 挤出可视区。
 */
const FOLDER_CELL_MIN = 46;
const FOLDER_CELL_GAP = 4;
const FOLDER_HEADER_H = 22 + 6;
const FOLDER_PANEL_PADDING = 16;

/** 由实际宽高推算网格槽位数（列 × 行）。 */
function gridSlots(width: number, height: number, minCell: number, gap: number): number {
  if (width <= 0 || height <= 0) return 0;
  const cols = Math.max(0, Math.floor((width + gap) / (minCell + gap)));
  const rows = Math.max(0, Math.floor((height + gap) / (minCell + gap)));
  return cols * rows;
}

/**
 * 文件夹磁贴（1x1）。
 *
 * 两种形态（对应平板桌面）：
 * - icon：普通 Folder 图标 + 名称（默认）；
 * - preview：内部直接铺 2x2 迷你图标，超出 4 个时第 4 格显示 "+N"。
 *
 * 迷你图标可单独点开；"+N" 打开文件夹弹窗；点其他区域由外层打开弹窗。
 */
export function FolderTile({
  item,
  preview,
  onOpenBookmark,
  onOpenPopup,
}: {
  item: FolderItem;
  /** 是否显示 2x2 预览（由磁贴形态决定，避免与 item 重复判断）。 */
  preview: boolean;
  onOpenBookmark?: (url: string) => void;
  onOpenPopup?: (folderId: string) => void;
}) {
  const { bookmarks, loading } = useFolderBookmarks(preview ? item.folderId : null);
  const slots = FOLDER_PREVIEW_COLS * FOLDER_PREVIEW_ROWS;
  const { visibleCount, overflow } = folderGridLayout(slots, bookmarks.length);
  const visible = bookmarks.slice(0, visibleCount);

  return (
    <div className={`desktop-shortcut-inner ${preview ? "is-preview" : ""}`}>
      <div className="desktop-folder-icon">
        {!preview || loading || bookmarks.length === 0 ? (
          <Folder className="desktop-folder-glyph" />
        ) : (
          <div className="desktop-folder-preview">
            {visible.map((bookmark) => (
              <button
                key={bookmark.id}
                className="desktop-folder-preview-cell"
                title={bookmark.title}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBookmark?.(bookmark.url);
                }}
              >
                <ShortcutIcon url={bookmark.url} name={bookmark.title} />
              </button>
            ))}
            {overflow > 0 && (
              <button
                className="desktop-folder-preview-more"
                title={getMessage("showAllBookmarks", "查看全部书签")}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPopup?.(item.folderId);
                }}
              >
                +{overflow}
              </button>
            )}
          </div>
        )}
      </div>
      <span className="desktop-shortcut-name">{item.name}</span>
    </div>
  );
}

/**
 * 文件夹展开块：图标拉开后，像其他小部件一样在内部显示该文件夹的书签。
 *
 * 网格占位高度固定为 1 行（h=1，与其他小部件一致），但**内部**是可换行的网格：
 * 槽位按实际测量到的宽高反推（列 × 行），因此拉宽会增多列、面板高度足够时
 * 自然换行成多行。书签放得下就全部显示，放不下时最后一格放 "+N"
 * （点击打开弹窗），所以 +N 始终位于真正的末尾。
 */
export function FolderPanelTile({
  item,
  onOpenBookmark,
  onOpenPopup,
}: {
  item: FolderItem;
  onOpenBookmark?: (url: string) => void;
  onOpenPopup?: (folderId: string) => void;
}) {
  const { bookmarks, loading } = useFolderBookmarks(item.folderId);
  const { ref, size } = useMeasuredSize<HTMLDivElement>();

  // 用真实渲染尺寸反推槽位：宽度算列、高度（去掉标题与内边距）算行。
  // 行数 > 1 时内部即换行，+N 落在最后一行末尾。
  const slots = gridSlots(
    size.width - FOLDER_PANEL_PADDING,
    size.height - FOLDER_HEADER_H - FOLDER_PANEL_PADDING,
    FOLDER_CELL_MIN,
    FOLDER_CELL_GAP,
  );
  const { visibleCount, overflow } = folderGridLayout(slots, bookmarks.length);
  const visible = bookmarks.slice(0, visibleCount);

  return (
    <div className="desktop-folder-panel" ref={ref}>
      <div className="desktop-folder-panel-header">
        <Folder className="desktop-folder-panel-glyph" />
        <span className="desktop-folder-panel-title">{item.name}</span>
      </div>

      {loading ? (
        <p className="desktop-folder-panel-hint">{getMessage("loading", "加载中...")}</p>
      ) : bookmarks.length === 0 ? (
        <p className="desktop-folder-panel-hint">
          {getMessage("emptyFolder", "该文件夹内没有书签")}
        </p>
      ) : (
        <div className="desktop-folder-panel-grid">
          {visible.map((bookmark) => (
            <button
              key={bookmark.id}
              className="desktop-folder-panel-item"
              title={bookmark.title}
              onClick={(e) => {
                // 避免触发外层的图标点击（弹窗）。
                e.stopPropagation();
                onOpenBookmark?.(bookmark.url);
              }}
            >
              <ShortcutIcon url={bookmark.url} name={bookmark.title} />
              <span className="desktop-folder-panel-item-name">{bookmark.title}</span>
            </button>
          ))}
          {overflow > 0 && (
            <button
              className="desktop-folder-panel-more"
              title={getMessage("showAllBookmarks", "查看全部书签")}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPopup?.(item.folderId);
              }}
            >
              +{overflow}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface WidgetGridItemProps {
  item: WidgetItemData;
  onDataChange: (itemId: string, data: Record<string, unknown>) => void;
  containerWidth: number;
  gap: number;
  cols: number;
}

/** 小部件渲染容器（含尺寸换算）。 */
export function WidgetGridItem({
  item,
  onDataChange,
  containerWidth,
  gap,
  cols,
}: WidgetGridItemProps) {
  const definition = getWidget(item.widgetType);
  const WidgetComponent = definition?.component;

  if (!WidgetComponent) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-xs">
        {item.title || item.widgetType}
      </div>
    );
  }

  const unitWidth = (containerWidth - gap * (cols - 1)) / cols;
  const cellW = item.w * unitWidth + (item.w - 1) * gap - 8;

  return (
    <div
      className="w-full overflow-hidden rounded-xl bg-white/75 dark:bg-[rgba(33,33,33,0.75)] border border-white/20 dark:border-white/5 shadow-md"
      style={{ pointerEvents: "auto" }}
    >
      <WidgetComponent
        data={item.data}
        onDataChange={(data) => onDataChange(item.id, data)}
        containerWidth={cellW}
        containerHeight={300}
      />
    </div>
  );
}

/** 小部件右下角缩放手柄。 */
export function WidgetResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div className="desktop-resize-handle" onPointerDown={onPointerDown}>
      <Maximize2 className="w-3 h-3" />
    </div>
  );
}
