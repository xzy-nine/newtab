import { useCallback, useEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  id?: string;
  label: string;
  onSelect?: () => void;
  disabled?: boolean;
  divider?: boolean;
  className?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
  isOpen: boolean;
}

export function useContextMenu() {
  const [state, setState] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    items: [],
    isOpen: false,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const show = useCallback((event: MouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault();
    event.stopPropagation();
    setState({
      x: event.clientX,
      y: event.clientY,
      items,
      isOpen: true,
    });
  }, []);

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  useEffect(() => {
    if (!state.isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hide();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.isOpen, hide]);

  return { show, hide, menuRef, state };
}
