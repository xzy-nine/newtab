import { useEffect, useCallback, useRef } from "react";
import {
  useDesktopGrid,
  type DesktopItem,
  type ShortcutItem,
  type WidgetItemData,
} from "@/hooks/useDesktopGrid";

interface DesktopSystemProps {
  folderId: string;
}

function isShortcutItem(item: DesktopItem): item is ShortcutItem {
  return item.type === "shortcut";
}

function isWidgetItem(item: DesktopItem): item is WidgetItemData {
  return item.type === "widget";
}

export function DesktopSystem({ folderId }: DesktopSystemProps) {
  const { items, setItems, grid, containerRef, itemPositionStyle, loadLayout } =
    useDesktopGrid(folderId);
  const dragState = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    loadLayout().then((layout) => {
      if (layout?.items) setItems(layout.items as DesktopItem[]);
    });
  }, [folderId, loadLayout, setItems]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, item: DesktopItem) => {
      e.preventDefault();
      dragState.current = {
        id: item.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: item.x,
        origY: item.y,
      };
      const handleMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const ds = dragState.current;
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
        dragState.current = null;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [grid, setItems],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[300px]"
      style={{ padding: "20px", boxSizing: "border-box" }}
    >
      {items.map((item) => {
        const style = itemPositionStyle(item);
        return (
          <div
            key={item.id}
            className="absolute flex flex-col items-center justify-center gap-2 cursor-pointer select-none z-10"
            style={{
              left: style.left,
              top: style.top,
              width: style.width,
              height: style.height,
              transition: "all 0.2s ease",
            }}
            onPointerDown={(e) => handlePointerDown(e, item)}
          >
            {isShortcutItem(item) && (
              <>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md"
                  style={{ backgroundColor: item.color || "#3b82f6" }}
                >
                  <span className="text-white text-sm font-bold">{item.name?.[0] || "?"}</span>
                </div>
                <span className="text-xs text-white/90 drop-shadow-md max-w-[72px] truncate text-center">
                  {item.name}
                </span>
              </>
            )}
            {isWidgetItem(item) && (
              <div className="w-full h-full rounded-xl bg-white/90 shadow-md p-4 flex items-center justify-center">
                <span className="text-sm text-gray-600">{item.title || item.widgetType}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
