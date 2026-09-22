import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Folder, Maximize2 } from "lucide-react";
import { fetchIconFromSources, generateInitialBasedIcon, getDomain } from "@/lib/icon-manager";
import { getWidget } from "@/lib/widget-registry";
import { WIDGET_TILE_HEIGHT } from "@/lib/widget-layout";
import { getMessage } from "@/lib/i18n";
import { useFolderBookmarks } from "@/hooks/useFolderBookmarks";
import {
  folderGridLayout,
  type FolderItem,
  type ShortcutItem,
  type WidgetItemData,
} from "@/lib/desktop-items";

/**
 * 桌面图标与文件夹面板的展示单元。
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

/** 网格单元格尺寸从 CSS 自定义属性读取，读取失败时的兜底值。 */
const FALLBACK_CELL_MIN = 40;
const FALLBACK_CELL_H = 48;
const FALLBACK_CELL_GAP = 4;
/**
 * 尚未测到尺寸时按 1x1 的格数先渲染。
 * 若直接按 0 槽位渲染，界面上会只剩一个 "+N"，没有图标。
 */
const FALLBACK_SLOTS = 4;

/**
 * 由实际宽高推算网格槽位数（列 × 行）。
 *
 * 列宽与行高分开：格子是"图标 + 文字"的高度，比列宽矮不了多少，
 * 若统一按列宽算行数会高估，最后一行会被面板裁掉。
 */
function gridSlots(
  width: number,
  height: number,
  colWidth: number,
  rowHeight: number,
  gap: number,
): number {
  if (width <= 0 || height <= 0) return 0;
  const cols = Math.max(0, Math.floor((width + gap) / (colWidth + gap)));
  const rows = Math.max(0, Math.floor((height + gap) / (rowHeight + gap)));
  return cols * rows;
}

/**
 * 测量文件夹面板内网格的真实可用槽位数。
 *
 * 直接观察网格元素自身尺寸，并从 CSS 自定义属性读取单元格尺寸——
 * 尺寸的唯一来源是 CSS，改样式不会让这里的计算漂移。
 *
 * 元素用 state 保存并在 layout effect 中测量：网格只在书签加载完成后
 * 才渲染，若只依赖首次挂载就会被测成 0 槽位（表现为只显示 "+N"）。
 */
function useFolderGridSlots() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState(0);

  useLayoutEffect(() => {
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const read = (name: string, fallback: number) =>
        parseFloat(cs.getPropertyValue(name)) || fallback;
      const next = gridSlots(
        el.clientWidth,
        el.clientHeight,
        read("--folder-cell-min", FALLBACK_CELL_MIN),
        read("--folder-cell-h", FALLBACK_CELL_H),
        read("--folder-cell-gap", FALLBACK_CELL_GAP),
      );
      setSlots((prev) => (prev === next ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  return { setGridEl: setEl, slots };
}

/**
 * 文件夹普通图标形态（1x1 且未开启预览）。
 *
 * 只有一个 Folder 图标 + 名称；开启预览或拉宽后改用 FolderPanelTile。
 */
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
 * 文件夹内容面板：1x1 预览态与 1xN 展开态共用同一套 UI。
 *
 * 两种形态渲染完全一致——同样的面板底、同样的标题栏、同样带书签名字的格子；
 * 区别只在于磁贴宽度，因而可用槽位数不同。1x1 宽度下网格自然是 2 列 × 2 行
 * （共 4 格，超出时第 4 格显示 "+N"），拉宽后列数增多、可继续换行。
 *
 * 槽位由实测尺寸得出，所以 "+N" 始终位于真正的末尾（放得下就不出现）。
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
  const { setGridEl, slots } = useFolderGridSlots();
  // 尺寸未知时用兜底格数，避免只显示 "+N" 而没有图标。
  const { visibleCount, overflow } = folderGridLayout(
    slots > 0 ? slots : FALLBACK_SLOTS,
    bookmarks.length,
  );
  const visible = bookmarks.slice(0, visibleCount);

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
        <div className="desktop-folder-panel-grid" ref={setGridEl}>
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
    /*
     * 磁贴高度取统一基准，并把同一个值作为 containerHeight 传给组件：
     * 组件内部的紧凑判定与真实外显高度因此始终一致。
     * 包裹层必须有确定高度，组件根节点的 h-full 才能撑满。
     */
    <div
      className="widget-tile w-full overflow-hidden rounded-xl bg-white/75 dark:bg-[rgba(33,33,33,0.75)] border border-white/20 dark:border-white/5 shadow-md"
      style={{ pointerEvents: "auto", height: WIDGET_TILE_HEIGHT }}
    >
      <WidgetComponent
        data={item.data}
        onDataChange={(data) => onDataChange(item.id, data)}
        containerWidth={cellW}
        containerHeight={WIDGET_TILE_HEIGHT}
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
