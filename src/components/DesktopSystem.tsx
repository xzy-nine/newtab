import { useCallback, useRef, useState, forwardRef, useImperativeHandle, useEffect } from "react";
import {
  useDesktopGrid,
  checkCollision,
  findNearestFreePosition,
  type DesktopItem,
  type ShortcutItem,
  type WidgetItemData,
} from "@/hooks/useDesktopGrid";
import { getWidget } from "@/lib/widget-registry";
import { getMessage } from "@/lib/i18n";
import { useContextMenu, type ContextMenuItem } from "@/hooks/useContextMenu";
import { WidgetAddDialog } from "@/components/WidgetSystem";
import { Plus, GripVertical, Maximize2 } from "lucide-react";
import { fetchIconFromSources, getDomain, generateInitialBasedIcon } from "@/lib/icon-manager";

interface DesktopSystemProps {
  folderId: string;
}

export interface DesktopSystemHandle {
  openAddWidget: () => void;
}

type BNode = chrome.bookmarks.BookmarkTreeNode;

async function getFolderBookmarks(
  folderId: string,
): Promise<{ id: string; title: string; url: string }[]> {
  try {
    const [folder] = await browser.bookmarks.getSubTree(folderId);
    if (folder?.children) {
      return folder.children
        .filter((c): c is BNode & { url: string } => !!c.url)
        .map((c) => ({ id: c.id, title: c.title || c.url, url: c.url }));
    }
  } catch (e) {
    console.error("获取书签失败:", e);
  }
  return [];
}

function generateId(): string {
  return `desktop-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isShortcutItem(item: DesktopItem): item is ShortcutItem {
  return item.type === "shortcut";
}

function isWidgetItem(item: DesktopItem): item is WidgetItemData {
  return item.type === "widget";
}

function ShortcutIcon({ url, name, color }: { url: string; name: string; color?: string }) {
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

export const DesktopSystem = forwardRef<DesktopSystemHandle, DesktopSystemProps>(
  function DesktopSystem({ folderId }, ref) {
    const {
      items,
      setItems,
      grid,
      containerRef,
      itemPositionStyle,
      addItem,
      updateItemData,
      loadLayout,
      setItemsFromBookmarks,
      removeItem,
      scheduleSave,
    } = useDesktopGrid(folderId);
    const [currentPage, setCurrentPage] = useState(0);
    const [showAddWidget, setShowAddWidget] = useState(false);
    const dragState = useRef<{
      id: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      dragged: boolean;
    } | null>(null);
    const resizeState = useRef<{
      id: string;
      startX: number;
      startY: number;
      origW: number;
      origH: number;
      origX: number;
      origY: number;
    } | null>(null);
    const wasDragged = useRef(false);
    const { show: showCtxMenu, hide: hideCtxMenu, menuRef, state: ctxMenuState } = useContextMenu();

    useImperativeHandle(ref, () => ({
      openAddWidget: () => setShowAddWidget(true),
    }));

    useEffect(() => {
      if (!folderId) return;
      setItems([]);
      let cancelled = false;
      const init = async () => {
        const layout = await loadLayout();
        if (cancelled) return;
        if (layout?.items && layout.items.length > 0) {
          const hasInvalidShortcut = layout.items.some(
            (it: DesktopItem) => it.type === "shortcut" && !it.url,
          );
          if (hasInvalidShortcut) {
            const bookmarks = await getFolderBookmarks(folderId);
            if (!cancelled && bookmarks.length > 0) {
              setItemsFromBookmarks(bookmarks);
            }
          } else {
            setItems(layout.items);
          }
        } else {
          const bookmarks = await getFolderBookmarks(folderId);
          if (cancelled) return;
          if (bookmarks.length > 0) {
            setItemsFromBookmarks(bookmarks);
          }
        }
      };
      init();
      return () => {
        cancelled = true;
      };
    }, [folderId, loadLayout, setItems, setItemsFromBookmarks]);

    const pageSize = grid.cols * grid.rows;
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
    const pageItems = items.filter((_, idx) => Math.floor(idx / pageSize) === currentPage);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent, item: DesktopItem) => {
        wasDragged.current = false;
        dragState.current = {
          id: item.id,
          startX: e.clientX,
          startY: e.clientY,
          origX: item.x,
          origY: item.y,
          dragged: false,
        };
        const handleMove = (ev: PointerEvent) => {
          if (!dragState.current) return;
          const ds = dragState.current;
          const moved =
            Math.abs(ev.clientX - ds.startX) > 5 || Math.abs(ev.clientY - ds.startY) > 5;
          if (moved) {
            ds.dragged = true;
            wasDragged.current = true;
          }
          if (!ds.dragged) return;
          const cellWithGap = grid.cellSize + grid.gap;
          const dx = ev.clientX - ds.startX;
          const dy = ev.clientY - ds.startY;
          const nx = Math.max(
            0,
            Math.min(grid.cols - item.w, Math.round((ds.origX * cellWithGap + dx) / cellWithGap)),
          );
          const ny = Math.max(
            0,
            Math.min(grid.rows - item.h, Math.round((ds.origY * cellWithGap + dy) / cellWithGap)),
          );
          setItems((prev) => prev.map((it) => (it.id === ds.id ? { ...it, x: nx, y: ny } : it)));
        };
        const handleUp = () => {
          const ds = dragState.current;
          if (ds && ds.dragged) {
            setItems((prev) => {
              const target = prev.find((it) => it.id === ds.id);
              if (!target) {
                scheduleSave(prev, grid);
                return prev;
              }
              const others = prev.filter((it) => it.id !== ds.id);
              if (others.some((o) => checkCollision(target, o))) {
                const freePos = findNearestFreePosition(target, prev, grid);
                if (freePos) {
                  const next = prev.map((it) =>
                    it.id === ds.id ? { ...it, x: freePos.x, y: freePos.y } : it,
                  );
                  scheduleSave(next, grid);
                  return next;
                }
                const next = prev.map((it) =>
                  it.id === ds.id ? { ...it, x: ds.origX, y: ds.origY } : it,
                );
                scheduleSave(next, grid);
                return next;
              }
              scheduleSave(prev, grid);
              return prev;
            });
          }
          dragState.current = null;
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
        };
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
      },
      [grid, setItems, scheduleSave],
    );

    const handleRemoveItem = useCallback(
      (id: string) => {
        removeItem(id);
        hideCtxMenu();
      },
      [removeItem, hideCtxMenu],
    );

    const handleShortcutClick = useCallback((item: ShortcutItem) => {
      if (item.url) {
        chrome.tabs.create({ url: item.url });
      }
    }, []);

    const handleResizeStart = useCallback(
      (e: React.PointerEvent, item: DesktopItem) => {
        if (item.type !== "widget") return;
        e.stopPropagation();
        e.preventDefault();
        resizeState.current = {
          id: item.id,
          startX: e.clientX,
          startY: e.clientY,
          origW: item.w,
          origH: item.h,
          origX: item.x,
          origY: item.y,
        };
        const handleMove = (ev: PointerEvent) => {
          const rs = resizeState.current;
          if (!rs) return;
          const cellWithGap = grid.cellSize + grid.gap;
          const dx = ev.clientX - rs.startX;
          const dy = ev.clientY - rs.startY;
          const nw = Math.max(
            1,
            Math.min(grid.cols - rs.origX, Math.round((rs.origW * cellWithGap + dx) / cellWithGap)),
          );
          const nh = Math.max(
            1,
            Math.min(grid.rows - rs.origY, Math.round((rs.origH * cellWithGap + dy) / cellWithGap)),
          );
          setItems((prev) => prev.map((it) => (it.id === rs.id ? { ...it, w: nw, h: nh } : it)));
        };
        const handleUp = () => {
          const rs = resizeState.current;
          if (rs) {
            setItems((prev) => {
              const target = prev.find((it) => it.id === rs.id);
              if (!target) {
                scheduleSave(prev, grid);
                return prev;
              }
              const others = prev.filter((it) => it.id !== rs.id);
              if (others.some((o) => checkCollision(target, o))) {
                const next = prev.map((it) =>
                  it.id === rs.id ? { ...it, w: rs.origW, h: rs.origH } : it,
                );
                scheduleSave(next, grid);
                return next;
              }
              scheduleSave(prev, grid);
              return prev;
            });
          }
          resizeState.current = null;
          window.removeEventListener("pointermove", handleMove);
          window.removeEventListener("pointerup", handleUp);
        };
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
      },
      [grid, setItems, scheduleSave],
    );

    const handleItemContextMenu = useCallback(
      (e: React.MouseEvent, item: DesktopItem) => {
        e.preventDefault();
        e.stopPropagation();
        const menuItems: ContextMenuItem[] = [
          {
            label: isShortcutItem(item)
              ? getMessage("removeShortcut", "删除快捷方式")
              : getMessage("removeWidget", "删除小部件"),
            onSelect: () => handleRemoveItem(item.id),
            className: "text-red-400",
          },
        ];
        if (isShortcutItem(item) && item.url) {
          menuItems.unshift({
            label: getMessage("openInNewTab", "在新标签页打开"),
            onSelect: () => chrome.tabs.create({ url: item.url }),
          });
        }
        showCtxMenu(e.nativeEvent, menuItems);
      },
      [showCtxMenu, handleRemoveItem],
    );

    const handleContainerContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        showCtxMenu(e.nativeEvent, [
          {
            label: getMessage("addWidget", "添加小部件"),
            onSelect: () => setShowAddWidget(true),
          },
        ]);
      },
      [showCtxMenu],
    );

    const handleDataChange = useCallback(
      (itemId: string, data: Record<string, unknown>) => {
        updateItemData(itemId, data);
      },
      [updateItemData],
    );

    const handleAddWidget = useCallback(
      (widgetType: string) => {
        const id = generateId();
        const newItem: WidgetItemData = {
          id,
          type: "widget",
          widgetType,
          title: widgetType,
          data: {},
          x: 0,
          y: 0,
          w: 2,
          h: 2,
          page: currentPage,
        };
        const freePos = findNearestFreePosition(newItem, items, grid);
        if (freePos) {
          newItem.x = freePos.x;
          newItem.y = freePos.y;
        }
        addItem(newItem);
        setShowAddWidget(false);
      },
      [addItem, currentPage, items, grid],
    );

    const containerStyle: React.CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
    };

    const ctxMenuEl = ctxMenuState.isOpen && (
      <div
        ref={menuRef}
        className="fixed z-[9999] min-w-[160px] rounded-lg border bg-popover p-1 shadow-md"
        style={{ left: ctxMenuState.x, top: ctxMenuState.y }}
      >
        {ctxMenuState.items.map((item, i) =>
          item.divider ? (
            <div key={i} className="my-1 h-px bg-border" />
          ) : (
            <button
              key={i}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent disabled:opacity-50"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                hideCtxMenu();
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    );

    if (items.length === 0) {
      return (
        <div
          ref={containerRef}
          className="desktop-box"
          style={containerStyle}
          onContextMenu={handleContainerContextMenu}
        >
          <div className="flex flex-col items-center justify-center h-full text-white/50 gap-3">
            <Plus className="w-10 h-10 opacity-40" />
            <p className="text-sm">{getMessage("rightClickAddWidget", "右键添加小部件")}</p>
          </div>

          {ctxMenuEl}

          <WidgetAddDialog
            open={showAddWidget}
            onOpenChange={setShowAddWidget}
            onSelect={handleAddWidget}
          />
        </div>
      );
    }

    return (
      <>
        <div
          ref={containerRef}
          className="desktop-box"
          style={containerStyle}
          onContextMenu={handleContainerContextMenu}
        >
          {pageItems.map((item) => {
            const style = itemPositionStyle(item);
            return (
              <div
                key={item.id}
                className="desktop-item"
                style={{
                  left: style.left,
                  top: style.top,
                  width: style.width,
                  height: style.height,
                  transition: "all 0.2s ease",
                }}
                onClick={() => {
                  if (isShortcutItem(item) && !wasDragged.current) {
                    handleShortcutClick(item);
                  }
                  wasDragged.current = false;
                }}
                onPointerDown={(e) => handlePointerDown(e, item)}
                onContextMenu={(e) => handleItemContextMenu(e, item)}
              >
                {isShortcutItem(item) && (
                  <div className="desktop-shortcut-inner">
                    <ShortcutIcon url={item.url} name={item.name} color={item.color} />
                    <span className="desktop-shortcut-name">{item.name}</span>
                  </div>
                )}
                {isWidgetItem(item) && (
                  <>
                    <WidgetGridItem item={item} onDataChange={handleDataChange} grid={grid} />
                    <div
                      className="desktop-resize-handle"
                      onPointerDown={(e) => handleResizeStart(e, item)}
                    >
                      <Maximize2 className="w-3 h-3" />
                    </div>
                  </>
                )}
                <div className="desktop-item-drag-handle">
                  <GripVertical className="w-3 h-3 opacity-40" />
                </div>
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="desktop-pages">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`desktop-page-dot ${i === currentPage ? "active" : ""}`}
                  onClick={() => setCurrentPage(i)}
                />
              ))}
            </div>
          )}

          {ctxMenuEl}
        </div>

        <WidgetAddDialog
          open={showAddWidget}
          onOpenChange={setShowAddWidget}
          onSelect={handleAddWidget}
        />
      </>
    );
  },
);

interface WidgetGridItemProps {
  item: WidgetItemData;
  onDataChange: (itemId: string, data: Record<string, unknown>) => void;
  grid: { cellSize: number; gap: number };
}

function WidgetGridItem({ item, onDataChange, grid }: WidgetGridItemProps) {
  const definition = getWidget(item.widgetType);
  const WidgetComponent = definition?.component;

  if (!WidgetComponent) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-xs">
        {item.title || item.widgetType}
      </div>
    );
  }

  const w = Math.max(1, item.w);
  const h = Math.max(1, item.h);
  const cellW = w * grid.cellSize + (w - 1) * grid.gap;
  const cellH = h * grid.cellSize + (h - 1) * grid.gap;

  return (
    <div
      className="w-full h-full overflow-hidden rounded-xl bg-white/75 dark:bg-[rgba(33,33,33,0.75)] border border-white/20 dark:border-white/5 shadow-md"
      style={{ pointerEvents: "auto" }}
    >
      <WidgetComponent
        data={item.data}
        onDataChange={(data) => onDataChange(item.id, data)}
        containerWidth={cellW - 8}
        containerHeight={cellH - 8}
      />
    </div>
  );
}
