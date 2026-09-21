import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Folder, Pin, PinOff, X } from "lucide-react";
import { FolderTreeView, type FolderTreeViewProps } from "@/components/FolderTreeView";
import { ShortcutIcon } from "@/components/DesktopItemViews";
import { useContextMenu } from "@/hooks/useContextMenu";
import { useFolderBookmarks } from "@/hooks/useFolderBookmarks";
import { useHomeDesktop } from "@/lib/home-desktop-store";
import { getMessage } from "@/lib/i18n";
import { openUrl } from "@/lib/open-url";
import type { BookmarkLike } from "@/lib/desktop-items";

export interface DockFolderLayerProps {
  onClose: () => void;
  folderTree: FolderTreeViewProps["nodes"];
  expandedFolders: Set<string>;
  pinnedFolderIds: string[];
  onToggleFolder: (id: string) => void;
  onPinFolder: (id: string) => void;
  onUnpinFolder: (id: string) => void;
  /** 初始选中的文件夹（上次查看的那个）。 */
  initialFolderId?: string | null;
}

/** 拖拽固定到主桌面时使用的 dataTransfer 类型。 */
export const BOOKMARK_DRAG_TYPE = "application/x-newtab-bookmark";

/**
 * Dock 文件夹视图。
 *
 * 左侧是文件夹树，右侧是所选文件夹内的书签：
 * - 点击书签只是打开；
 * - 右键可"固定到桌面/从桌面移除"；
 * - 拖到主桌面也会固定；
 * - 支持多选（Ctrl/Cmd 点击、Shift 连选、空白处框选、全选），再批量固定/取消固定。
 *
 * 固定的目标始终是"书签快捷方式"，不会固定文件夹本身。
 */
export function DockFolderLayer({
  onClose,
  folderTree,
  expandedFolders,
  pinnedFolderIds,
  onToggleFolder,
  onPinFolder,
  onUnpinFolder,
  initialFolderId,
}: DockFolderLayerProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(initialFolderId ?? null);
  const { bookmarks, loading } = useFolderBookmarks(selectedFolder);

  const homeItems = useHomeDesktop((s) => s.items);
  const pinBookmarks = useHomeDesktop((s) => s.pinBookmarks);
  const unpinBookmarks = useHomeDesktop((s) => s.unpinBookmarks);

  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const lastClickedIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { show: showCtxMenu, hide: hideCtxMenu, menuRef, state: ctxMenuState } = useContextMenu();

  const pinnedUrls = useMemo(
    () => new Set(homeItems.filter((it) => it.type === "shortcut").map((it) => it.url)),
    [homeItems],
  );

  const title = findFolderTitle(folderTree, selectedFolder);
  const allSelected = bookmarks.length > 0 && selectedUrls.size === bookmarks.length;

  /** 切换文件夹：清空多选，避免选中项跨文件夹残留。 */
  const selectFolder = useCallback((folderId: string) => {
    setSelectedFolder(folderId);
    setSelectedUrls(new Set());
    lastClickedIndexRef.current = null;
  }, []);

  // Esc 关闭。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleSelect = useCallback((url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const handleBookmarkClick = useCallback(
    (e: React.MouseEvent, bookmark: BookmarkLike, index: number) => {
      // Ctrl/Cmd 点击：逐个加选，不打开。
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        toggleSelect(bookmark.url);
        lastClickedIndexRef.current = index;
        return;
      }
      // Shift 点击：从上次点击处连选。
      if (e.shiftKey && lastClickedIndexRef.current !== null) {
        e.preventDefault();
        const from = Math.min(lastClickedIndexRef.current, index);
        const to = Math.max(lastClickedIndexRef.current, index);
        setSelectedUrls((prev) => {
          const next = new Set(prev);
          for (let i = from; i <= to; i++) {
            const bm = bookmarks[i];
            if (bm) next.add(bm.url);
          }
          return next;
        });
        return;
      }
      // 已有多选时，单击只切换选中状态。
      if (selectedUrls.size > 0) {
        e.preventDefault();
        toggleSelect(bookmark.url);
        lastClickedIndexRef.current = index;
        return;
      }
      openUrl(bookmark.url);
    },
    [bookmarks, selectedUrls.size, toggleSelect],
  );

  /** 空白处按下并拖动 = 框选。 */
  const handleMarqueeStart = useCallback((e: React.PointerEvent) => {
    // 只响应直接落在空白区域的按下（点在书签上不框选）。
    if (e.target !== e.currentTarget) return;
    const container = listRef.current;
    if (!container) return;
    const items = Array.from(container.querySelectorAll<HTMLElement>("[data-bookmark-url]"));
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      const left = Math.min(startX, ev.clientX);
      const right = Math.max(startX, ev.clientX);
      const top = Math.min(startY, ev.clientY);
      const bottom = Math.max(startY, ev.clientY);
      const hits = new Set<string>();
      for (const el of items) {
        const r = el.getBoundingClientRect();
        const intersects = r.right >= left && r.left <= right && r.bottom >= top && r.top <= bottom;
        const url = el.dataset.bookmarkUrl;
        if (intersects && url) hits.add(url);
      }
      setSelectedUrls(hits);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent, bookmark: BookmarkLike) => {
      // 若该项在多选中，整批一起拖（落到桌面会批量固定）。
      const urls = selectedUrls.has(bookmark.url) ? [...selectedUrls] : [bookmark.url];
      const payload = bookmarks.filter((b) => urls.includes(b.url));
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(BOOKMARK_DRAG_TYPE, JSON.stringify(payload));
      e.dataTransfer.setData("text/plain", bookmark.url);
    },
    [bookmarks, selectedUrls],
  );

  /** 拖到浮层外部 = 拖到主桌面：固定这些书签。 */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      try {
        const payload = JSON.parse(raw) as BookmarkLike[];
        if (Array.isArray(payload) && payload.length > 0) pinBookmarks(payload);
      } catch {
        /* 忽略非法拖拽数据 */
      }
    },
    [pinBookmarks],
  );

  const handleBookmarkContextMenu = useCallback(
    (e: React.MouseEvent, bookmark: BookmarkLike) => {
      e.preventDefault();
      e.stopPropagation();
      const isPinned = pinnedUrls.has(bookmark.url);
      // 右键已选中的项 → 对这一批操作；否则只对当前项。
      const targets = selectedUrls.has(bookmark.url)
        ? bookmarks.filter((b) => selectedUrls.has(b.url))
        : [bookmark];
      showCtxMenu(e.nativeEvent, [
        {
          label: getMessage("openInNewTab", "在新标签页打开"),
          onSelect: () => openUrl(bookmark.url),
        },
        {
          label: isPinned
            ? getMessage("unpinShortcutFromDesktop", "从桌面移除")
            : getMessage("pinShortcutToDesktop", "固定到桌面"),
          onSelect: () =>
            isPinned ? unpinBookmarks(targets.map((b) => b.url)) : pinBookmarks(targets),
        },
        {
          label: getMessage("selectMultiple", "多选"),
          onSelect: () => toggleSelect(bookmark.url),
        },
      ]);
    },
    [bookmarks, pinBookmarks, pinnedUrls, selectedUrls, showCtxMenu, toggleSelect, unpinBookmarks],
  );

  const selectedBookmarks = useMemo(
    () => bookmarks.filter((b) => selectedUrls.has(b.url)),
    [bookmarks, selectedUrls],
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

  return (
    <>
      {/* 点击外部关闭；同时作为"拖到主桌面"的落点 */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={onClose}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={handleDrop}
      />

      <div
        className="dock-layer xb-glass-popover"
        role="dialog"
        aria-label={getMessage("folderDrawer", "文件夹")}
      >
        <div className="dock-layer-header">
          <span className="text-sm font-medium">
            {getMessage("folderDrawerTitle", "文件夹与书签")}
          </span>
          <button
            className="dock-layer-close"
            onClick={onClose}
            title={getMessage("close", "关闭")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="dock-layer-body">
          {/* 左侧：文件夹树 */}
          <div className="dock-layer-tree">
            <FolderTreeView
              nodes={folderTree}
              currentFolder={selectedFolder}
              expandedFolders={expandedFolders}
              pinnedFolders={pinnedFolderIds}
              onSelect={(id) => selectFolder(id)}
              onToggle={onToggleFolder}
              onPin={onPinFolder}
              onUnpin={onUnpinFolder}
            />
          </div>

          {/* 右侧：所选文件夹内的书签快捷方式 */}
          <div className="dock-layer-content">
            <div className="dock-layer-content-header">
              <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs font-medium">
                {title || getMessage("drawerSelectFolder", "选择左侧的文件夹以查看书签")}
              </span>

              {bookmarks.length > 0 && selectedFolder && (
                <button
                  className="dock-layer-tool"
                  onClick={() =>
                    setSelectedUrls(allSelected ? new Set() : new Set(bookmarks.map((b) => b.url)))
                  }
                >
                  {allSelected
                    ? getMessage("clearSelection", "取消全选")
                    : getMessage("selectAll", "全选")}
                </button>
              )}
            </div>

            {/* 批量操作条：选中若干书签后出现 */}
            {selectedBookmarks.length > 0 && (
              <div className="dock-layer-bulk">
                <span className="dock-layer-bulk-count">
                  {getMessage("selectedCount", "已选")} {selectedBookmarks.length}
                </span>
                <button
                  className="dock-layer-bulk-btn is-primary"
                  onClick={() => pinBookmarks(selectedBookmarks)}
                >
                  <Pin className="w-3 h-3" />
                  {getMessage("pinAllToDesktop", "固定到桌面")}
                </button>
                <button
                  className="dock-layer-bulk-btn"
                  onClick={() => unpinBookmarks(selectedBookmarks.map((b) => b.url))}
                >
                  <PinOff className="w-3 h-3" />
                  {getMessage("unpinAllFromDesktop", "从桌面移除")}
                </button>
                <button className="dock-layer-bulk-btn" onClick={() => setSelectedUrls(new Set())}>
                  {getMessage("cancel", "取消")}
                </button>
              </div>
            )}

            <div className="dock-layer-list" ref={listRef} onPointerDown={handleMarqueeStart}>
              {!selectedFolder ? (
                <p className="dock-layer-hint">
                  {getMessage("drawerSelectFolder", "选择左侧的文件夹以查看书签")}
                </p>
              ) : loading ? (
                <p className="dock-layer-hint">{getMessage("loading", "加载中...")}</p>
              ) : bookmarks.length === 0 ? (
                <p className="dock-layer-hint">{getMessage("emptyFolder", "该文件夹内没有书签")}</p>
              ) : (
                bookmarks.map((bookmark, index) => {
                  const isSelected = selectedUrls.has(bookmark.url);
                  const isPinned = pinnedUrls.has(bookmark.url);
                  return (
                    <button
                      key={bookmark.id}
                      data-bookmark-url={bookmark.url}
                      className={`dock-layer-bookmark ${isSelected ? "is-selected" : ""}`}
                      title={bookmark.url}
                      draggable
                      onDragStart={(e) => handleDragStart(e, bookmark)}
                      onClick={(e) => handleBookmarkClick(e, bookmark, index)}
                      onContextMenu={(e) => handleBookmarkContextMenu(e, bookmark)}
                    >
                      <ShortcutIcon url={bookmark.url} name={bookmark.title} />
                      <span className="dock-layer-bookmark-name">{bookmark.title}</span>
                      {isPinned && (
                        <Pin
                          className="dock-layer-bookmark-pin"
                          aria-label={getMessage("pinnedShortcut", "已在桌面")}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {ctxMenuEl}
    </>
  );
}

/** 在文件夹树中按 id 查找标题。 */
function findFolderTitle(
  nodes: FolderTreeViewProps["nodes"],
  folderId: string | null,
): string | undefined {
  if (!folderId) return undefined;
  for (const node of nodes) {
    if (node.id === folderId) return node.title;
    const found = node.children ? findFolderTitle(node.children, folderId) : undefined;
    if (found) return found;
  }
  return undefined;
}
