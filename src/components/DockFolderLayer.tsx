import { useEffect, useState } from "react";
import { Folder, Pin, PinOff, X } from "lucide-react";
import { FolderTreeView, type FolderTreeViewProps } from "@/components/FolderTreeView";
import { ShortcutIcon } from "@/components/DesktopItemViews";
import { useFolderBookmarks } from "@/hooks/useFolderBookmarks";
import { getMessage } from "@/lib/i18n";
import { openUrl } from "@/lib/open-url";

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

/**
 * Dock 文件夹按钮弹出的浮层。
 *
 * 左侧是文件夹树，右侧直接列出所选文件夹内的书签：
 * - 点击书签只是打开；
 * - 右侧顶部的图钉用于把该文件夹固定到主桌面（或取消固定）。
 *
 * 由父组件在打开时挂载，因此初始选中项直接取自 `initialFolderId`。
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

  const title = findFolderTitle(folderTree, selectedFolder);
  const isPinned = selectedFolder ? pinnedFolderIds.includes(selectedFolder) : false;

  // Esc 关闭。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <>
      {/* 点击外部关闭 */}
      <div className="fixed inset-0 z-[60]" onClick={onClose} />

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
              onSelect={(id) => setSelectedFolder(id)}
              onToggle={onToggleFolder}
              onPin={onPinFolder}
              onUnpin={onUnpinFolder}
            />
          </div>

          {/* 右侧：所选文件夹内的书签 */}
          <div className="dock-layer-content">
            <div className="dock-layer-content-header">
              <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs font-medium">
                {title || getMessage("drawerSelectFolder", "选择左侧的文件夹以查看书签")}
              </span>
              {selectedFolder && (
                <button
                  className={`dock-layer-pin ${isPinned ? "is-pinned" : ""}`}
                  title={
                    isPinned
                      ? getMessage("unpinFromDesktop", "从主桌面移除")
                      : getMessage("pinToDesktop", "固定到主桌面")
                  }
                  onClick={() =>
                    isPinned ? onUnpinFolder(selectedFolder) : onPinFolder(selectedFolder)
                  }
                >
                  {isPinned ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
                  <span>
                    {isPinned
                      ? getMessage("unpinFromDesktop", "从主桌面移除")
                      : getMessage("pinToDesktop", "固定到主桌面")}
                  </span>
                </button>
              )}
            </div>

            <div className="dock-layer-list">
              {!selectedFolder ? (
                <p className="dock-layer-hint">
                  {getMessage("drawerSelectFolder", "选择左侧的文件夹以查看书签")}
                </p>
              ) : loading ? (
                <p className="dock-layer-hint">{getMessage("loading", "加载中...")}</p>
              ) : bookmarks.length === 0 ? (
                <p className="dock-layer-hint">{getMessage("emptyFolder", "该文件夹内没有书签")}</p>
              ) : (
                bookmarks.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    className="dock-layer-bookmark"
                    title={bookmark.url}
                    onClick={() => openUrl(bookmark.url)}
                  >
                    <ShortcutIcon url={bookmark.url} name={bookmark.title} />
                    <span className="dock-layer-bookmark-name">{bookmark.title}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
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
