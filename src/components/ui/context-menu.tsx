import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type RefObject } from "react";
import type { ContextMenuItem } from "@/hooks/useContextMenu";

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  menuRef: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
}

/** 菜单与视口边缘的最小间距。 */
const EDGE_GAP = 8;

/**
 * 右键菜单。
 *
 * **必须渲染到 `document.body`（Portal）**，不能作为调用方的普通子节点：
 * `position: fixed` 的定位基准是"最近的、会形成包含块的祖先"，而
 * `backdrop-filter` 非 none 的元素（本项目的玻璃系统大量使用）正是这样的祖先。
 * 菜单若留在桌面容器或 Dock 浮层内部，`left/top` 就会相对那个容器计算，
 * 而不是相对视口——表现为菜单不出现在鼠标位置、且随容器偏移。
 *
 * 另外按视口做翻转：鼠标靠近右下角时菜单向外展开会溢出屏幕，
 * 此时改为向左/向上展开，保证整块菜单始终可见。
 */
export function ContextMenu({ x, y, items, menuRef, onSelect }: ContextMenuProps) {
  /** 实测尺寸前的初始位置：先按鼠标点放置，避免首帧闪到别处。 */
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - EDGE_GAP;
    const maxTop = window.innerHeight - height - EDGE_GAP;
    // 放不下就向左/向上翻转；翻转后仍越界则贴边钳制
    const left = x + width > window.innerWidth ? Math.max(EDGE_GAP, x - width) : x;
    const top = y + height > window.innerHeight ? Math.max(EDGE_GAP, y - height) : y;
    setPos({
      left: Math.min(left, Math.max(EDGE_GAP, maxLeft)),
      top: Math.min(top, Math.max(EDGE_GAP, maxTop)),
    });
  }, [x, y, items, menuRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={menuRef}
      /*
       * 走玻璃系统（`.xb-glass-popover`）：与 Dock 菜单、Dock 浮层同一套
       * 令牌混色 + 模糊，亮/暗色由 `--color-popover` 自动适配。
       * 这里**不能**再叠 Tailwind 的 `bg-popover`——那是实色背景，
       * 会把玻璃的通透感整个盖掉。
       */
      className="ctx-menu fixed z-[9999] min-w-[160px] rounded-lg border p-1 shadow-md xb-glass-popover"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={i}
            className={`ctx-menu-item w-full text-left px-2 py-1.5 text-sm rounded disabled:opacity-50 ${item.className ?? ""}`}
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              onSelect();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
