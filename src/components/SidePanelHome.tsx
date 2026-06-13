import { useEffect, useState, useCallback, useRef } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBookmarkFolders } from "@/hooks/useBookmarkFolders";
import { Background } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { DesktopSystem, type DesktopSystemHandle } from "@/components/DesktopSystem";
import { NotificationCenter } from "@/components/NotificationCenter";
import { FolderTreeView } from "@/components/FolderTreeView";
import { useWidgetRegistration } from "@/components/WidgetSystem";
import { getMessage } from "@/lib/i18n";
import { Folder } from "lucide-react";

export function SidePanelHome() {
  const { hydrate, showClock, showWidgets, glassOpacity, glassBlur } = useAppSettings();
  useTheme();
  useWidgetRegistration();

  const {
    currentFolder,
    folders,
    folderTree,
    expandedFolders,
    pinnedFolders,
    toggleFolder,
    selectFolder,
    pinFolder,
    unpinFolder,
  } = useBookmarkFolders();
  const desktopRef = useRef<DesktopSystemHandle>(null);

  const [showFolderPicker, setShowFolderPicker] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const el = document.documentElement;
    const isGlassActive = glassBlur > 0 || glassOpacity < 100;
    if (isGlassActive) {
      el.setAttribute("data-glass", "");
    } else {
      el.removeAttribute("data-glass");
    }
    el.style.setProperty("--xb-glass-opacity", `${glassOpacity / 100}`);
    el.style.setProperty("--xb-glass-blur", `${glassBlur}px`);
  }, [glassOpacity, glassBlur]);

  const handleFolderSelect = useCallback(
    async (fid: string) => {
      await selectFolder(fid);
      setShowFolderPicker(false);
    },
    [selectFolder],
  );

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-background text-foreground relative">
      <NotificationCenter />
      <div className="absolute inset-0 pointer-events-none">
        <Background />
      </div>

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <header className="flex flex-col items-center pt-2 pb-0 px-3 gap-1">
          {showClock && (
            <div className="scale-[0.6] origin-top -mb-6">
              <ClockWidget />
            </div>
          )}
          <div className="w-full">
            <SearchBox />
          </div>
        </header>

        <div className="flex items-center gap-1 py-1 flex-wrap relative px-3">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
            onClick={() => setShowFolderPicker(!showFolderPicker)}
          >
            <Folder className="w-3 h-3" />
            <span className="truncate max-w-[100px]">
              {folders.find((f) => f.id === currentFolder)?.title ||
                getMessage("selectFolder", "选择文件夹")}
            </span>
          </button>

          {pinnedFolders.map((pid) => {
            const pf = folders.find((f) => f.id === pid);
            if (!pf) return null;
            const isActive = pid === currentFolder;
            return (
              <button
                key={pid}
                className={`flex items-center gap-1 px-1.5 py-1 rounded-md text-xs transition-colors ${
                  isActive
                    ? "bg-foreground/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                }`}
                onClick={() => handleFolderSelect(pid)}
              >
                <span className="max-w-[80px] truncate">{pf.title}</span>
              </button>
            );
          })}

          {showFolderPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowFolderPicker(false)} />
              <div className="absolute left-0 top-full mt-1 w-72 max-h-[50vh] overflow-y-auto rounded-xl xb-glass-popover shadow-2xl z-50">
                <FolderTreeView
                  nodes={folderTree}
                  currentFolder={currentFolder}
                  expandedFolders={expandedFolders}
                  pinnedFolders={pinnedFolders}
                  onSelect={handleFolderSelect}
                  onToggle={toggleFolder}
                  onPin={pinFolder}
                  onUnpin={unpinFolder}
                  level={0}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex-1 flex flex-col overflow-hidden px-3 pb-2">
          <div className="flex-1 overflow-hidden rounded-xl">
            {showWidgets && currentFolder ? (
              <DesktopSystem ref={desktopRef} folderId={currentFolder} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
                {getMessage("selectFolderToStart", "请选择一个书签文件夹")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
