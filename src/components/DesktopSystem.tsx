import { useCallback, useRef, useState, forwardRef, useImperativeHandle, useEffect } from "react";
import {
  useDesktopGrid,
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
      addItem,
      updateItemData,
      loadLayout,
      setItemsFromBookmarks,
      removeItem,
      scheduleSave,
      moveItemIndex,
    } = useDesktopGrid(folderId);
    const [currentPage, setCurrentPage] = useState(0);
    const [showAddWidget, setShowAddWidget] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [cols, setCols] = useState(6);
    const [containerWidth, setContainerWidth] = useState(800);
    const gap = 14;
    const dragIndexRef = useRef<number | null>(null);
    const resizeState = useRef<{
      id: string;
      startX: number;
      origW: number;
    } | null>(null);

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

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const calc = () => {
        const w = el.clientWidth;
        setContainerWidth(w);
        setCols(Math.max(2, Math.min(10, Math.floor(w / 100))));
      };
      calc();
      const ro = new ResizeObserver(calc);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const itemsPerPage = Math.max(cols * 8, 48);
    const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));
    const pageItems = items.filter((_, idx) => Math.floor(idx / itemsPerPage) === currentPage);

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
        if (from !== null && from !== toIndex) {
          moveItemIndex(from, toIndex);
        }
        dragIndexRef.current = null;
      },
      [moveItemIndex],
    );

    const handleDragEnd = useCallback(() => {
      dragIndexRef.current = null;
    }, []);

    const handleResizeStart = useCallback(
      (e: React.PointerEvent, item: WidgetItemData) => {
        e.stopPropagation();
        e.preventDefault();
        const unitWidth = (containerWidth - gap * (cols - 1)) / cols;
        resizeState.current = { id: item.id, startX: e.clientX, origW: item.w };
        const handleMove = (ev: PointerEvent) => {
          const rs = resizeState.current;
          if (!rs) return;
          const dx = ev.clientX - rs.startX;
          const nw = Math.max(1, Math.min(cols, Math.round(rs.origW + dx / unitWidth)));
          setItems((prev) => prev.map((it) => (it.id === rs.id ? { ...it, w: nw } : it)));
        };
        const handleUp = () => {
          if (resizeState.current) {
            setItems((prev) => {
              scheduleSave(prev);
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
      [containerWidth, cols, gap, setItems, scheduleSave],
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
          w: 2,
          h: 2,
        };
        addItem(newItem);
        setShowAddWidget(false);
      },
      [addItem],
    );

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
        <div ref={containerRef} className="desktop-box" onContextMenu={handleContainerContextMenu}>
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

    const baseItemWidth = `calc((100% - ${gap * (cols - 1)}px) / ${cols})`;

    return (
      <>
        <div ref={containerRef} className="desktop-box" onContextMenu={handleContainerContextMenu}>
          <div className="desktop-waterfall" style={{ gap: `${gap}px` }}>
            {pageItems.map((item, idx) => {
              const globalIdx = Math.floor(idx / itemsPerPage) * itemsPerPage + idx;
              const itemWidth =
                item.w === 1
                  ? baseItemWidth
                  : `calc(${baseItemWidth} * ${item.w} + ${gap * (item.w - 1)}px)`;
              return (
                <div
                  key={item.id}
                  className="desktop-item"
                  style={{ width: itemWidth }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, globalIdx)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, globalIdx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => {
                    if (isShortcutItem(item)) {
                      handleShortcutClick(item);
                    }
                  }}
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
                      <WidgetGridItem
                        item={item}
                        onDataChange={handleDataChange}
                        containerWidth={containerWidth}
                        gap={gap}
                        cols={cols}
                      />
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
          </div>

          {totalPages > 1 && (
            <div className="desktop-pages">
              <button
                className="desktop-page-btn"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                −
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`desktop-page-dot ${i === currentPage ? "active" : ""}`}
                  onClick={() => setCurrentPage(i)}
                />
              ))}
              <button
                className="desktop-page-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
              >
                +
              </button>
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
  containerWidth: number;
  gap: number;
  cols: number;
}

function WidgetGridItem({ item, onDataChange, containerWidth, gap, cols }: WidgetGridItemProps) {
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
