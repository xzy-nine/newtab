import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { GripVertical, Maximize2 } from "lucide-react";
import { isInteractiveTarget } from "@/lib/dom-interaction";
import { getMessage } from "@/lib/i18n";
import { hasWidgetPopup } from "@/lib/widget-registry";
import {
  folderTileForm,
  isFolderItem,
  isShortcutItem,
  isWidgetItem,
  resolveFolderResize,
  type DesktopItem,
  type FolderItem,
  type WidgetItemData,
} from "@/lib/desktop-items";
import {
  FolderPanelTile,
  FolderTile,
  ShortcutTile,
  WidgetGridItem,
  WidgetResizeHandle,
} from "@/components/DesktopItemViews";

/** 桌面网格的行高基准与间距。 */
const GRID_GAP = 14;
const MIN_COLS = 2;
const MAX_COLS = 10;
const PX_PER_COL = 100;
const ROWS_PER_PAGE = 8;
const MIN_ITEMS_PER_PAGE = 48;

/**
 * 磁贴的形态类名：文件夹预览/展开态需要与展开块一致的高度。
 */
function itemClassName(item: DesktopItem): string {
  if (!isFolderItem(item)) return "";
  const form = folderTileForm(item);
  if (form === "expanded") return "is-folder-expanded";
  if (form === "preview") return "is-folder-preview";
  return "";
}

export interface DesktopGridViewProps {
  items: DesktopItem[];
  /** 拖拽排序回调（全局索引）。 */
  onMove: (fromIndex: number, toIndex: number) => void;
  /** 点击项目（快捷方式打开、文件夹进入）。 */
  onItemClick?: (item: DesktopItem) => void;
  /** 项目右键。 */
  onItemContextMenu?: (e: React.MouseEvent, item: DesktopItem) => void;
  /** 空白处右键。 */
  onEmptyContextMenu?: (e: React.MouseEvent) => void;
  /** 小部件数据变化。 */
  onWidgetDataChange?: (itemId: string, data: Record<string, unknown>) => void;
  /** 小部件/文件夹块的宽度变化（拖动过程中持续触发）。 */
  onItemResize?: (itemId: string, w: number) => void;
  /** 文件夹块缩放（同时给出预览态；拖动过程中持续触发）。 */
  onFolderResize?: (itemId: string, w: number, preview: boolean) => void;
  /** 缩放结束（用于落盘）。 */
  onItemResizeEnd?: () => void;
  /** 点击文件夹展开块内部的书签。 */
  onOpenBookmark?: (url: string) => void;
  /** 点击展开块里的 "+N"（查看该文件夹全部书签）。 */
  onOpenFolderPopup?: (folderId: string) => void;
  /** 展开支持弹窗的小部件（磁贴右上角按钮）。 */
  onExpandWidget?: (item: WidgetItemData) => void;
  /** 列表为空时展示的内容。 */
  emptyState?: ReactNode;
  /** 网格之外的浮层（如右键菜单、对话框）。 */
  children?: ReactNode;
  /** 额外类名（主桌面与文件夹桌面外观微调）。 */
  className?: string;
}

/**
 * 瀑布流桌面网格：分页、拖拽排序、小部件缩放。
 * 主桌面与文件夹桌面共用，通过回调决定点击与右键行为。
 */
export function DesktopGridView({
  items,
  onMove,
  onItemClick,
  onItemContextMenu,
  onEmptyContextMenu,
  onWidgetDataChange,
  onItemResize,
  onFolderResize,
  onItemResizeEnd,
  onOpenBookmark,
  onOpenFolderPopup,
  onExpandWidget,
  emptyState,
  children,
  className,
}: DesktopGridViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [cols, setCols] = useState(6);
  const [containerWidth, setContainerWidth] = useState(800);
  const dragIndexRef = useRef<number | null>(null);
  const resizeState = useRef<{ id: string; startX: number; origW: number } | null>(null);
  /** 正在交互控件的磁贴 id：期间关闭其 draggable。 */
  const [dragDisabledId, setDragDisabledId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth;
      setContainerWidth(w);
      setCols(Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor(w / PX_PER_COL))));
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const itemsPerPage = Math.max(cols * ROWS_PER_PAGE, MIN_ITEMS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
  // 项目变少时直接钳制当前页，避免用副作用同步状态。
  const safePage = Math.min(currentPage, totalPages - 1);

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.max(0, Math.min(totalPages - 1, page)));
    },
    [totalPages],
  );

  const pageItems = items.filter((_, idx) => Math.floor(idx / itemsPerPage) === safePage);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const from = dragIndexRef.current;
      if (from !== null && from !== toIndex) onMove(from, toIndex);
      dragIndexRef.current = null;
    },
    [onMove],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
  }, []);

  /**
   * 磁贴是可拖拽的（用于排序），但内部的输入框/按钮必须能正常交互。
   * 若在控件上按下时磁贴仍可拖拽，浏览器会把这次按下当成拖拽起点，
   * 导致输入框无法获得焦点、按钮点击被吞掉。
   * 因此按下控件时记下该磁贴，暂时关掉它的 draggable，指针抬起后恢复。
   */
  const handleTilePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (!isInteractiveTarget(e.target)) return;
    setDragDisabledId(id);
  }, []);

  useEffect(() => {
    if (dragDisabledId === null) return;
    const restore = () => setDragDisabledId(null);
    window.addEventListener("pointerup", restore);
    window.addEventListener("pointercancel", restore);
    return () => {
      window.removeEventListener("pointerup", restore);
      window.removeEventListener("pointercancel", restore);
    };
  }, [dragDisabledId]);

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, item: WidgetItemData | FolderItem) => {
      e.stopPropagation();
      e.preventDefault();
      const unitWidth = (containerWidth - GRID_GAP * (cols - 1)) / cols;
      if (unitWidth <= 0) return;
      const isFolder = isFolderItem(item);
      const origPreview = isFolder ? item.preview === true : false;
      resizeState.current = { id: item.id, startX: e.clientX, origW: item.w };
      const handleMove = (ev: PointerEvent) => {
        const rs = resizeState.current;
        if (!rs) return;
        const dx = ev.clientX - rs.startX;
        const rawW = rs.origW + dx / unitWidth;
        if (isFolder) {
          // 文件夹：宽 ≥ 2 列展开；停在 1 列时按轻拉方向切换 2x2 预览。
          const { w, preview } = resolveFolderResize({
            origW: rs.origW,
            origPreview,
            rawW,
            dx,
            unitWidth,
            maxCols: cols,
          });
          onFolderResize?.(rs.id, w, preview);
          return;
        }
        const nw = Math.max(1, Math.min(cols, Math.round(rawW)));
        onItemResize?.(rs.id, nw);
      };
      const handleUp = () => {
        if (resizeState.current) onItemResizeEnd?.();
        resizeState.current = null;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [containerWidth, cols, onItemResize, onItemResizeEnd, onFolderResize],
  );

  const baseItemWidth = `calc((100% - ${GRID_GAP * (cols - 1)}px) / ${cols})`;

  return (
    <div
      ref={containerRef}
      className={`desktop-box ${className ?? ""}`}
      onContextMenu={onEmptyContextMenu}
    >
      {items.length === 0 ? (
        emptyState
      ) : (
        <>
          <div className="desktop-waterfall" style={{ gap: `${GRID_GAP}px` }}>
            {pageItems.map((item, idx) => {
              const globalIdx = safePage * itemsPerPage + idx;
              const itemWidth =
                item.w === 1
                  ? baseItemWidth
                  : `calc(${baseItemWidth} * ${item.w} + ${GRID_GAP * (item.w - 1)}px)`;
              return (
                <div
                  key={item.id}
                  className={`desktop-item ${itemClassName(item)}`}
                  style={{ width: itemWidth }}
                  draggable={dragDisabledId !== item.id}
                  onPointerDown={(e) => handleTilePointerDown(e, item.id)}
                  onDragStart={(e) => handleDragStart(e, globalIdx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, globalIdx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => onItemClick?.(item)}
                  onContextMenu={(e) => onItemContextMenu?.(e, item)}
                >
                  {isShortcutItem(item) && <ShortcutTile item={item} />}
                  {isFolderItem(item) &&
                    (folderTileForm(item) === "icon" ? (
                      <FolderTile item={item} />
                    ) : (
                      // 1x1 预览态与 1xN 展开态共用同一个面板组件，UI 一致
                      <FolderPanelTile
                        item={item}
                        onOpenBookmark={onOpenBookmark}
                        onOpenPopup={onOpenFolderPopup}
                      />
                    ))}
                  {isWidgetItem(item) && (
                    <WidgetGridItem
                      item={item}
                      onDataChange={(id, data) => onWidgetDataChange?.(id, data)}
                      containerWidth={containerWidth}
                      gap={GRID_GAP}
                      cols={cols}
                    />
                  )}
                  {(isWidgetItem(item) || isFolderItem(item)) && (
                    <WidgetResizeHandle onPointerDown={(e) => handleResizeStart(e, item)} />
                  )}
                  {isWidgetItem(item) && hasWidgetPopup(item.widgetType) && (
                    <button
                      className="desktop-item-expand-handle"
                      title={getMessage("widgetExpand", "展开详情")}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExpandWidget?.(item);
                      }}
                    >
                      <Maximize2 className="w-3 h-3" />
                    </button>
                  )}
                  <div className="desktop-item-drag-handle">
                    <GripVertical className="w-3 h-3 opacity-40" />
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="desktop-pages">
              <button
                className="desktop-page-btn"
                onClick={() => goToPage(safePage - 1)}
                disabled={safePage === 0}
              >
                −
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`desktop-page-dot ${i === safePage ? "active" : ""}`}
                  onClick={() => goToPage(i)}
                />
              ))}
              <button
                className="desktop-page-btn"
                onClick={() => goToPage(safePage + 1)}
                disabled={safePage === totalPages - 1}
              >
                +
              </button>
            </div>
          )}
        </>
      )}

      {children}
    </div>
  );
}
