import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { Plus, GripVertical, X, Pin, ChevronLeft, ChevronRight } from "lucide-react";
import { registerWidget, getWidget, getAllTypes } from "@/lib/widget-registry";
import { useWidgetStore, type WidgetContainerData } from "@/lib/widget-store";
import { getMessage } from "@/lib/i18n";
import { CounterWidget } from "@/components/widgets/CounterWidget";
import { TimerWidget } from "@/components/widgets/TimerWidget";
import { NoteWidget } from "@/components/widgets/NoteWidget";
import { useContextMenu } from "@/hooks/useContextMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface WidgetSystemProps {
  folderId?: string;
}

function ensureViewport(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { left, top } = el.style;
  let x = parseInt(left) || 0;
  let y = parseInt(top) || 0;
  if (rect.left < 0) x = 0;
  if (rect.right > vw) x = vw - rect.width - 20;
  if (rect.top < 0) y = 0;
  if (rect.bottom > vh) y = vh - rect.height - 20;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function generateId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function WidgetSystem({ folderId }: WidgetSystemProps) {
  const {
    containers,
    hydrate,
    addContainer,
    updateContainer,
    removeContainer,
    addItem,
    removeItem,
    updateItemData,
    setActiveIndex,
  } = useWidgetStore();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addTargetContainer, setAddTargetContainer] = useState<string | null>(null);
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragState = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const { show: showCtxMenu, hide: hideCtxMenu, menuRef, state: ctxMenuState } = useContextMenu();

  useEffect(() => {
    registerWidget("counter", {
      meta: { type: "counter", name: "计数器", description: "简单的计数器小部件", icon: "counter" },
      config: {
        defaultWidth: 135,
        defaultHeight: 100,
        minWidth: 135,
        minHeight: 100,
        maxWidth: 300,
        maxHeight: 300,
      },
      component: CounterWidget,
    });
    registerWidget("timer", {
      meta: { type: "timer", name: "计时器", description: "提供秒表功能", icon: "timer" },
      config: {
        defaultWidth: 200,
        defaultHeight: 120,
        minWidth: 150,
        minHeight: 100,
        maxWidth: 300,
        maxHeight: 250,
      },
      component: TimerWidget,
    });
    registerWidget("note", {
      meta: {
        type: "note",
        name: "便签",
        description: "支持Markdown格式的便签小部件",
        icon: "note",
      },
      config: {
        defaultWidth: 200,
        defaultHeight: 150,
        minWidth: 200,
        minHeight: 150,
        maxWidth: 300,
        maxHeight: 300,
      },
      component: NoteWidget,
    });
  }, []);

  useEffect(() => {
    hydrate(folderId);
  }, [folderId, hydrate]);

  const filteredContainers = useMemo(
    () => containers.filter((c) => !folderId || c.folderId === folderId),
    [containers, folderId],
  );

  const getContainer = useCallback(
    (id: string) => {
      return containers.find((c) => c.id === id);
    },
    [containers],
  );

  const handleCreateContainer = useCallback(() => {
    const id = generateId();
    addContainer({
      id,
      folderId,
      fixed: false,
      activeIndex: 0,
      items: [],
      x: 50,
      y: 50,
      width: 200,
      height: 150,
    });
  }, [folderId, addContainer]);

  const handleDeleteContainer = useCallback(
    (id: string) => {
      removeContainer(id);
      hideCtxMenu();
    },
    [removeContainer, hideCtxMenu],
  );

  const handleToggleFixed = useCallback(
    (id: string) => {
      const c = getContainer(id);
      if (!c) return;
      updateContainer(id, { fixed: !c.fixed });
      hideCtxMenu();
    },
    [getContainer, updateContainer, hideCtxMenu],
  );

  const handleAddWidget = useCallback(
    (containerId: string) => {
      setAddTargetContainer(containerId);
      setShowAddDialog(true);
      hideCtxMenu();
    },
    [hideCtxMenu],
  );

  const handleSelectWidgetType = useCallback(
    (type: string) => {
      if (!addTargetContainer) return;
      const id = generateId();
      addItem(addTargetContainer, { type, id, data: {} });
      setShowAddDialog(false);
      setAddTargetContainer(null);
    },
    [addTargetContainer, addItem],
  );

  const handleRemoveWidget = useCallback(
    (containerId: string, itemId: string) => {
      removeItem(containerId, itemId);
    },
    [removeItem],
  );

  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent, containerId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const c = getContainer(containerId);
      if (!c) return;
      showCtxMenu(e as unknown as MouseEvent, [
        {
          label: getMessage("addWidget", "添加小部件"),
          onSelect: () => handleAddWidget(containerId),
        },
        {
          label: getMessage("deleteWidgetContainer", "删除小部件容器"),
          onSelect: () => handleDeleteContainer(containerId),
        },
        {
          label: c.fixed
            ? getMessage("unfixWidgetContainer", "取消固定")
            : getMessage("fixWidgetContainer", "固定位置"),
          onSelect: () => handleToggleFixed(containerId),
        },
      ]);
    },
    [getContainer, showCtxMenu, handleAddWidget, handleDeleteContainer, handleToggleFixed],
  );

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, containerId: string, itemId: string) => {
      e.preventDefault();
      e.stopPropagation();
      showCtxMenu(e as unknown as MouseEvent, [
        {
          label: getMessage("addWidget", "添加小部件"),
          onSelect: () => handleAddWidget(containerId),
        },
        {
          label: getMessage("removeWidget", "删除小部件"),
          onSelect: () => handleRemoveWidget(containerId, itemId),
        },
      ]);
    },
    [showCtxMenu, handleAddWidget, handleRemoveWidget],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, containerId: string) => {
      const c = getContainer(containerId);
      if (!c || c.fixed) return;
      e.preventDefault();
      const el = containerRefs.current.get(containerId);
      if (!el) return;
      el.classList.add("opacity-80", "z-50");
      dragState.current = {
        id: containerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: c.x,
        origY: c.y,
      };

      const onMove = (ev: PointerEvent) => {
        if (!dragState.current) return;
        const ds = dragState.current;
        const nx = Math.max(0, ds.origX + ev.clientX - ds.startX);
        const ny = Math.max(0, ds.origY + ev.clientY - ds.startY);
        updateContainer(ds.id, { x: nx, y: ny });
      };

      const onUp = (_ev: PointerEvent) => {
        if (!dragState.current) return;
        const el2 = containerRefs.current.get(dragState.current.id);
        if (el2) {
          el2.classList.remove("opacity-80", "z-50");
          if (el2.isConnected) ensureViewport(el2);
        }
        const c2 = getContainer(dragState.current.id);
        if (c2)
          updateContainer(dragState.current.id, {
            x: parseInt(el2?.style.left || "0") || c2.x,
            y: parseInt(el2?.style.top || "0") || c2.y,
          });
        dragState.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [getContainer, updateContainer],
  );

  const handlePrevItem = useCallback(
    (containerId: string) => {
      const c = getContainer(containerId);
      if (!c) return;
      const idx = c.activeIndex > 0 ? c.activeIndex - 1 : c.items.length - 1;
      setActiveIndex(containerId, idx);
    },
    [getContainer, setActiveIndex],
  );

  const handleNextItem = useCallback(
    (containerId: string) => {
      const c = getContainer(containerId);
      if (!c) return;
      const idx = c.activeIndex < c.items.length - 1 ? c.activeIndex + 1 : 0;
      setActiveIndex(containerId, idx);
    },
    [getContainer, setActiveIndex],
  );

  const handleDataChange = useCallback(
    (containerId: string, itemId: string, data: Record<string, unknown>) => {
      updateItemData(containerId, itemId, data);
    },
    [updateItemData],
  );

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <Button size="icon" onClick={handleCreateContainer} className="rounded-full shadow-lg">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {filteredContainers.map((container) => (
        <WidgetContainer
          key={container.id}
          container={container}
          containerRefs={containerRefs}
          onPointerDown={handlePointerDown}
          onContextMenu={handleContainerContextMenu}
          onItemContextMenu={handleItemContextMenu}
          onRemoveWidget={handleRemoveWidget}
          onPrevItem={handlePrevItem}
          onNextItem={handleNextItem}
          onDataChange={handleDataChange}
        />
      ))}

      {showAddDialog && (
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogTitle>{getMessage("addWidget", "添加小部件")}</DialogTitle>
            <DialogDescription>
              {getMessage("selectWidgetType", "选择要添加的小部件类型")}
            </DialogDescription>
            <div className="flex flex-col gap-2 mt-2">
              {getAllTypes().map((type) => (
                <Button
                  key={type.type}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSelectWidgetType(type.type)}
                >
                  {type.name}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {ctxMenuState.isOpen && (
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
      )}
    </>
  );
}

interface WidgetContainerProps {
  container: WidgetContainerData;
  containerRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onItemContextMenu: (e: React.MouseEvent, containerId: string, itemId: string) => void;
  onRemoveWidget: (containerId: string, itemId: string) => void;
  onPrevItem: (id: string) => void;
  onNextItem: (id: string) => void;
  onDataChange: (containerId: string, itemId: string, data: Record<string, unknown>) => void;
}

function WidgetContainer({
  container,
  containerRefs,
  onPointerDown,
  onContextMenu,
  onItemContextMenu,
  onRemoveWidget,
  onPrevItem,
  onNextItem,
  onDataChange,
}: WidgetContainerProps) {
  const activeItem = container.items[container.activeIndex];
  const definition = activeItem ? getWidget(activeItem.type) : null;
  const WidgetComponent = definition?.component;
  const config = definition?.config;

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) containerRefs.current.set(container.id, el);
      else containerRefs.current.delete(container.id);
    },
    [container.id, containerRefs],
  );

  const width = config?.defaultWidth ?? container.width;
  const height = config?.defaultHeight ?? container.height;

  return (
    <div
      ref={setRef}
      className="widget-container fixed rounded-xl overflow-hidden transition-shadow hover:shadow-xl"
      style={{
        left: container.x,
        top: container.y,
        width,
        height,
        zIndex: container.fixed ? 30 : 20,
        background: "var(--widget-bg, rgba(30,30,30,0.85))",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid var(--widget-border, rgba(255,255,255,0.1))",
      }}
      onContextMenu={(e) => onContextMenu(e, container.id)}
    >
      <div
        className="flex items-center gap-1 px-2 py-1 cursor-grab active:cursor-grabbing select-none"
        style={{ borderBottom: "1px solid var(--widget-border, rgba(255,255,255,0.08))" }}
        onPointerDown={(e) => onPointerDown(e, container.id)}
      >
        <GripVertical className="h-3 w-3 opacity-40" />
        <div className="flex-1" />
        {container.items.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              className="p-0.5 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onPrevItem(container.id);
              }}
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <div className="flex gap-1">
              {container.items.map((_, i) => (
                <span
                  key={i}
                  className={`block h-1.5 rounded-full transition-all ${i === container.activeIndex ? "w-3 bg-primary" : "w-1.5 bg-white/30"}`}
                />
              ))}
            </div>
            <button
              className="p-0.5 opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onNextItem(container.id);
              }}
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-0.5 ml-1">
          {container.fixed ? <Pin className="h-3 w-3 opacity-40" /> : null}
          <button
            className="p-0.5 opacity-30 hover:opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveWidget(container.id, activeItem?.id || "");
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden" style={{ height: "calc(100% - 28px)" }}>
        {activeItem && WidgetComponent ? (
          <div
            className="h-full w-full"
            onContextMenu={(e) => onItemContextMenu(e, container.id, activeItem.id)}
          >
            <WidgetComponent
              data={activeItem.data}
              onDataChange={(data) => onDataChange(container.id, activeItem.id, data)}
              containerWidth={width}
              containerHeight={height - 28}
            />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-white/40 text-sm">
            {getMessage("noWidget", "无内容")}
          </div>
        )}
      </div>
    </div>
  );
}
