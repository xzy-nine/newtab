import { useCallback, useRef } from "react";
import { useBookmarkFolders } from "@/hooks/useBookmarkFolders";
import { HomeDesktop, type HomeDesktopHandle } from "@/components/HomeDesktop";
import { Dock } from "@/components/Dock";
import { useAppSettings } from "@/lib/app-settings-store";

interface DesktopWorkspaceProps {
  /** 紧凑布局（侧边栏）。 */
  compact?: boolean;
  /** 是否渲染 Dock。 */
  showDock?: boolean;
  onOpenSettings?: () => void;
  onRefreshBackground?: () => void;
}

/**
 * 桌面工作区。
 *
 * 页面里只有主桌面一个桌面——没有顶部文件夹栏，也没有文件夹视图切换。
 * 固定在主桌面上的文件夹以图标形式存在：点击弹出其书签，拉伸则内联展开。
 * 其余文件夹通过 Dock 的文件夹按钮浮层（左树 + 右书签）访问，
 * 在浮层或文件夹树上都能把文件夹固定到主桌面。
 */
export function DesktopWorkspace({
  showDock = true,
  onOpenSettings,
  onRefreshBackground,
}: DesktopWorkspaceProps) {
  const { showWidgets } = useAppSettings();
  const {
    currentFolder,
    folders,
    folderTree,
    expandedFolders,
    pinnedFolders,
    ready,
    toggleFolder,
    pinFolder,
    unpinFolder,
  } = useBookmarkFolders();

  const homeRef = useRef<HomeDesktopHandle>(null);

  const handleAddShortcut = useCallback(() => {
    homeRef.current?.openAddShortcut();
  }, []);

  const handleAddWidget = useCallback(() => {
    homeRef.current?.openAddWidget();
  }, []);

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      <div className="flex-1" style={{ minHeight: 0 }}>
        <HomeDesktop
          ref={homeRef}
          folders={folders}
          pinnedFolderIds={pinnedFolders}
          onUnpinFolder={unpinFolder}
          showWidgets={showWidgets}
          ready={ready}
        />
      </div>

      {showDock && (
        <Dock
          onOpenSettings={onOpenSettings}
          onRefreshBackground={onRefreshBackground}
          onAddShortcut={handleAddShortcut}
          onAddWidget={handleAddWidget}
          folderLayer={{
            folderTree,
            expandedFolders,
            pinnedFolderIds: pinnedFolders,
            onToggleFolder: toggleFolder,
            onPinFolder: pinFolder,
            onUnpinFolder: unpinFolder,
            initialFolderId: currentFolder,
          }}
        />
      )}
    </div>
  );
}
