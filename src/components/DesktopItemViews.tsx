import { useCallback, useEffect, useState } from "react";
import { Folder, Maximize2 } from "lucide-react";
import { fetchIconFromSources, generateInitialBasedIcon, getDomain } from "@/lib/icon-manager";
import { getWidget } from "@/lib/widget-registry";
import { getMessage } from "@/lib/i18n";
import { useFolderBookmarks } from "@/hooks/useFolderBookmarks";
import {
  folderPanelCapacity,
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

/** 文件夹图标块（安卓桌面风格的文件夹图标）。 */
export function FolderTile({ item }: { item: FolderItem }) {
  return (
    <div className="desktop-shortcut-inner">
      <div className="desktop-folder-icon">
        <Folder className="desktop-folder-glyph" />
      </div>
      <span className="desktop-shortcut-name">{item.name}</span>
    </div>
  );
}

/**
 * 文件夹展开块：图标拉伸到 2 列及以上时，内联显示该文件夹的书签。
 *
 * 内部书签点击即打开；块本身仍可继续拉伸/缩回，缩回 1 列即恢复为图标。
 */
export function FolderPanelTile({
  item,
  onOpenBookmark,
}: {
  item: FolderItem;
  onOpenBookmark?: (url: string) => void;
}) {
  const { bookmarks, loading } = useFolderBookmarks(item.folderId);
  const capacity = folderPanelCapacity(item.w);
  const visible = bookmarks.slice(0, capacity);
  const rest = bookmarks.length - visible.length;

  return (
    <div className="desktop-folder-panel">
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
          {rest > 0 && <span className="desktop-folder-panel-more">+{rest}</span>}
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
