import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LayoutGrid, Link2, Pin, PinOff, Puzzle } from "lucide-react";
import { DesktopGridView } from "@/components/DesktopGridView";
import { WidgetAddDialog } from "@/components/WidgetSystem";
import { FolderPopup } from "@/components/FolderPopup";
import { WidgetPopupHost } from "@/components/WidgetPopupHost";
import { BOOKMARK_DRAG_TYPE } from "@/components/DockFolderLayer";
import { useContextMenu, type ContextMenuItem } from "@/hooks/useContextMenu";
import { getMessage } from "@/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeBrowserUrl } from "@/lib/browser";
import { isInSidePanel, openUrl } from "@/lib/open-url";
import { createDesktopItemId, useHomeDesktop } from "@/lib/home-desktop-store";
import { hasWidgetPopup } from "@/lib/widget-registry";
import {
  DEFAULT_ITEM_NAME,
  DEFAULT_SHORTCUT_COLOR,
  folderTileForm,
  isFolderItem,
  isShortcutItem,
  isWidgetItem,
  type BookmarkLike,
  type DesktopItem,
  type WidgetItemData,
} from "@/lib/desktop-items";

export interface HomeDesktopHandle {
  /** 打开"添加小部件"对话框。 */
  openAddWidget: () => void;
  /** 打开"添加快捷方式"对话框。 */
  openAddShortcut: () => void;
}

interface HomeDesktopProps {
  /** 全部书签文件夹（用于给文件夹图标命名）。 */
  folders: { id: string; title: string }[];
  /** 已固定到主桌面的文件夹 id 列表。 */
  pinnedFolderIds: string[];
  /** 从主桌面取消固定。 */
  onUnpinFolder: (folderId: string) => void;
  /** 是否显示小部件（关闭时仅隐藏主桌面上的小部件）。 */
  showWidgets?: boolean;
  /**
   * 书签文件夹与固定列表是否已加载完成。
   * 未完成前不加载/不同步主桌面，避免用空的固定列表误删文件夹图标。
   */
  ready?: boolean;
}

/**
 * 主桌面：新标签页唯一的桌面。
 *
 * 独立于"当前书签文件夹"，拥有自己的存储（`newtab:home-desktop`），
 * 可放文件夹图标、网址快捷方式与小部件。
 *
 * 文件夹图标有两种形态：默认是图标，点击弹出该书签文件夹的内容；
 * 像小部件一样拉伸到 2 列以上则变成展开块，直接在桌面内显示书签。
 * 两种形态下点击书签都只是"打开"，不会固定任何东西。
 */
export const HomeDesktop = forwardRef<HomeDesktopHandle, HomeDesktopProps>(function HomeDesktop(
  { folders, pinnedFolderIds, onUnpinFolder, showWidgets = true, ready = true },
  ref,
) {
  const {
    items: allItems,
    hydrate,
    replaceItems,
    addItem,
    removeItem,
    updateItemData,
    moveItemIndex,
    syncFolderItems,
    pinBookmarks,
  } = useHomeDesktop();

  const [showAddWidget, setShowAddWidget] = useState(false);
  const [showAddShortcut, setShowAddShortcut] = useState(false);
  const [shortcutForm, setShortcutForm] = useState({ name: "", url: "" });
  /** 正在弹窗展示的文件夹 id。 */
  const [popupFolderId, setPopupFolderId] = useState<string | null>(null);
  /** 已展开的小部件（有 popup 定义的那些）。 */
  const [expandedWidget, setExpandedWidget] = useState<WidgetItemData | null>(null);
  /** 初始加载是否已完成；未完成前不做任何落盘，避免覆盖已有数据。 */
  const [loaded, setLoaded] = useState(false);
  const loadStartedRef = useRef(false);

  const { show: showCtxMenu, hide: hideCtxMenu, menuRef, state: ctxMenuState } = useContextMenu();

  useImperativeHandle(
    ref,
    () => ({
      openAddWidget: () => setShowAddWidget(true),
      openAddShortcut: () => setShowAddShortcut(true),
    }),
    [],
  );

  // 首次加载主桌面（含一次性迁移）。等书签与固定列表就绪后再读，
  // 否则迁移会以空的固定列表播种、同步会误删已有文件夹图标。
  useEffect(() => {
    if (!ready || loadStartedRef.current) return;
    loadStartedRef.current = true;
    let cancelled = false;
    const init = async () => {
      await hydrate(folders);
      if (cancelled) return;
      setLoaded(true);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [ready, hydrate, folders]);

  const folderTitles = useMemo(() => {
    const titles: Record<string, string> = {};
    for (const folder of folders) titles[folder.id] = folder.title;
    return titles;
  }, [folders]);

  // 文件夹图标跟随固定文件夹列表变化（仅在加载完成后生效）。
  useEffect(() => {
    if (!ready || !loaded) return;
    syncFolderItems(pinnedFolderIds, folderTitles);
  }, [ready, loaded, pinnedFolderIds, syncFolderItems, folderTitles]);

  // 关闭小部件时仅隐藏它们，数据仍保留在主桌面存储中。
  const visibleItems = useMemo(
    () => (showWidgets ? allItems : allItems.filter((item) => !isWidgetItem(item))),
    [allItems, showWidgets],
  );

  /** 把可见列表的下标映射回完整列表，避免隐藏小部件时排序串位。 */
  const handleMoveVisible = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (showWidgets) {
        moveItemIndex(fromIndex, toIndex);
        return;
      }
      const fromId = visibleItems[fromIndex]?.id;
      const toId = visibleItems[toIndex]?.id;
      if (!fromId || !toId) return;
      const from = allItems.findIndex((it) => it.id === fromId);
      const to = allItems.findIndex((it) => it.id === toId);
      if (from >= 0 && to >= 0) moveItemIndex(from, to);
    },
    [allItems, moveItemIndex, showWidgets, visibleItems],
  );

  const handleRemoveItem = useCallback(
    (id: string) => {
      removeItem(id);
      hideCtxMenu();
    },
    [removeItem, hideCtxMenu],
  );

  /** 缩放过程中直接改宽度（节流交给 React 渲染）。 */
  const handleResize = useCallback((id: string, w: number) => {
    const items = useHomeDesktop.getState().items.map((it) => (it.id === id ? { ...it, w } : it));
    useHomeDesktop.setState({ items });
  }, []);

  /** 文件夹缩放：同时更新宽度与 1x1 预览态。 */
  const handleFolderResize = useCallback((id: string, w: number, preview: boolean) => {
    const items = useHomeDesktop
      .getState()
      .items.map((it) => (it.id === id && it.type === "folder" ? { ...it, w, preview } : it));
    useHomeDesktop.setState({ items });
  }, []);

  /** 缩放结束：落盘一次。 */
  const handleResizeEnd = useCallback(() => {
    replaceItems(useHomeDesktop.getState().items);
  }, [replaceItems]);

  const handleItemClick = useCallback((item: DesktopItem) => {
    if (isShortcutItem(item)) openUrl(item.url);
    // 文件夹：点击落在书签格子上时，面板内部已 stopPropagation 并直接打开；
    // 能冒泡到这里说明点的是图标/标题/空白处 → 打开文件夹弹窗。
    else if (isFolderItem(item)) {
      setPopupFolderId(item.folderId);
    }
  }, []);

  const handleAddShortcut = useCallback(() => {
    const normalized = normalizeBrowserUrl(shortcutForm.url);
    if (normalized.kind !== "ok") return;
    addItem({
      id: createDesktopItemId(),
      type: "shortcut",
      name: shortcutForm.name.trim() || normalized.url || DEFAULT_ITEM_NAME,
      url: normalized.url,
      color: DEFAULT_SHORTCUT_COLOR,
      w: 1,
      h: 1,
    });
    setShortcutForm({ name: "", url: "" });
    setShowAddShortcut(false);
  }, [addItem, shortcutForm]);

  const handleItemContextMenu = useCallback(
    (e: React.MouseEvent, item: DesktopItem) => {
      e.preventDefault();
      e.stopPropagation();
      const menuItems: ContextMenuItem[] = [];

      if (isShortcutItem(item)) {
        menuItems.push({
          label: isInSidePanel()
            ? getMessage("openInSidebar", "在侧边栏打开")
            : getMessage("openInNewTab", "在新标签页打开"),
          onSelect: () => openUrl(item.url),
        });
        menuItems.push({
          label: getMessage("removeShortcut", "删除快捷方式"),
          onSelect: () => handleRemoveItem(item.id),
          className: "text-red-400",
        });
      }

      if (isFolderItem(item)) {
        // 点击才是打开；固定/取消固定只在这里（以及文件夹树上的图钉）。
        const form = folderTileForm(item);
        if (form === "expanded") {
          menuItems.push({
            label: getMessage("collapseFolder", "收起为图标"),
            onSelect: () => handleFolderResize(item.id, 1, false),
          });
        } else {
          // 1x1：可在"普通图标"与"2x2 预览"之间切换（也可直接轻拉缩放手柄）。
          menuItems.push({
            label:
              form === "preview"
                ? getMessage("hideFolderPreview", "隐藏文件夹预览")
                : getMessage("showFolderPreview", "显示文件夹预览"),
            onSelect: () => handleFolderResize(item.id, 1, form !== "preview"),
          });
        }
        menuItems.push({
          label: getMessage("unpinFromDesktop", "从主桌面移除"),
          onSelect: () => onUnpinFolder(item.folderId),
        });
      }

      if (isWidgetItem(item)) {
        // 支持展开的小部件（如天气）在右键菜单里也给一个入口，
        // 与磁贴右上角的按钮等价。
        if (hasWidgetPopup(item.widgetType)) {
          menuItems.push({
            label: getMessage("widgetExpand", "展开详情"),
            onSelect: () => setExpandedWidget(item),
          });
        }
        menuItems.push({
          label: getMessage("removeWidget", "删除小部件"),
          onSelect: () => handleRemoveItem(item.id),
          className: "text-red-400",
        });
      }

      if (menuItems.length === 0) return;
      showCtxMenu(e.nativeEvent, menuItems);
    },
    [handleFolderResize, handleRemoveItem, onUnpinFolder, showCtxMenu],
  );

  const handleEmptyContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      showCtxMenu(e.nativeEvent, [
        {
          label: getMessage("addWidget", "添加小部件"),
          onSelect: () => setShowAddWidget(true),
        },
        {
          label: getMessage("addShortcut", "添加快捷方式"),
          onSelect: () => setShowAddShortcut(true),
        },
      ]);
    },
    [showCtxMenu],
  );

  const ctxMenuEl: ReactNode = ctxMenuState.isOpen && (
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

  const emptyState = (
    <div className="flex flex-col items-center justify-center h-full text-white/50 gap-3">
      <LayoutGrid className="w-10 h-10 opacity-40" />
      <p className="text-sm">
        {getMessage(
          "homeDesktopEmptyHint",
          "右键添加快捷方式或小部件；文件夹请用文件夹树上的图钉固定",
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowAddShortcut(true)}>
          <Link2 className="w-3.5 h-3.5 mr-1" />
          {getMessage("addShortcut", "添加快捷方式")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowAddWidget(true)}>
          <Puzzle className="w-3.5 h-3.5 mr-1" />
          {getMessage("addWidget", "添加小部件")}
        </Button>
      </div>
      {pinnedFolderIds.length === 0 && (
        <p className="text-xs opacity-70 flex items-center gap-1">
          <Pin className="w-3 h-3" />
          {getMessage("pinFolderHint", "在文件夹树上点击图钉，即可固定到主桌面")}
          <PinOff className="w-3 h-3 ml-1" />
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* 文件夹视图里的书签可直接拖到桌面固定（见 DockFolderLayer 的 dataTransfer） */}
      <div
        className="home-desktop-drop"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
          if (!raw) return;
          e.preventDefault();
          try {
            const payload = JSON.parse(raw) as BookmarkLike[];
            if (Array.isArray(payload)) pinBookmarks(payload);
          } catch {
            /* 忽略非法拖拽数据 */
          }
        }}
      >
        <DesktopGridView
          items={visibleItems}
          onMove={handleMoveVisible}
          onItemClick={handleItemClick}
          onItemContextMenu={handleItemContextMenu}
          onEmptyContextMenu={handleEmptyContextMenu}
          onWidgetDataChange={updateItemData}
          onItemResize={handleResize}
          onFolderResize={handleFolderResize}
          onItemResizeEnd={handleResizeEnd}
          onOpenBookmark={openUrl}
          onOpenFolderPopup={setPopupFolderId}
          onExpandWidget={setExpandedWidget}
          emptyState={emptyState}
          className="home-desktop"
        >
          {ctxMenuEl}
        </DesktopGridView>
      </div>

      <FolderPopup
        folderId={popupFolderId}
        title={popupFolderId ? folderTitles[popupFolderId] : undefined}
        onClose={() => setPopupFolderId(null)}
      />

      <WidgetPopupHost
        item={expandedWidget}
        onClose={() => setExpandedWidget(null)}
        onDataChange={updateItemData}
      />

      <WidgetAddDialog
        open={showAddWidget}
        onOpenChange={setShowAddWidget}
        onSelect={(type) => {
          addItem({
            id: createDesktopItemId(),
            type: "widget",
            widgetType: type,
            title: type,
            data: {},
            w: 2,
            h: 2,
          });
          setShowAddWidget(false);
        }}
      />

      <Dialog open={showAddShortcut} onOpenChange={setShowAddShortcut}>
        <DialogContent className="max-w-md">
          <DialogTitle>{getMessage("addShortcut", "添加快捷方式")}</DialogTitle>
          <div className="flex flex-col gap-3 mt-2">
            <Input
              placeholder={getMessage("shortcutName", "名称（可选）")}
              value={shortcutForm.name}
              onChange={(e) => setShortcutForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              placeholder="https://example.com"
              value={shortcutForm.url}
              onChange={(e) => setShortcutForm((f) => ({ ...f, url: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddShortcut();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddShortcut(false)}>
                {getMessage("cancel", "取消")}
              </Button>
              <Button size="sm" onClick={handleAddShortcut}>
                <Link2 className="w-3.5 h-3.5 mr-1" />
                {getMessage("save", "保存")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
