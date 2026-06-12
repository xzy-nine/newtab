import { useEffect, useState, useCallback, useRef } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBookmarkFolders, type FolderNode } from "@/hooks/useBookmarkFolders";
import { Background } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { DesktopSystem, type DesktopSystemHandle } from "@/components/DesktopSystem";
import { SettingsPanel } from "@/components/SettingsPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Dock } from "@/components/Dock";
import { useWidgetRegistration } from "@/components/WidgetSystem";
import { getMessage } from "@/lib/i18n";
import { Folder, ChevronRight, ChevronDown, Pin, PinOff } from "lucide-react";

export function NewTab() {
  const { hydrate, showClock, showWidgets } = useAppSettings();
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
  const [isDark, setIsDark] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const handleFolderSelect = useCallback(
    async (fid: string) => {
      await selectFolder(fid);
      setShowFolderPicker(false);
    },
    [selectFolder],
  );

  const handleRefreshBackground = useCallback(() => {
    const imgs = document.querySelectorAll<HTMLImageElement>(
      ".bg-container img, img[alt='Background']",
    );
    imgs.forEach((img) => {
      img.style.opacity = "0";
      setTimeout(() => {
        const base = img.src.split("?")[0] || img.src;
        img.src = `${base}?t=${Date.now()}`;
        img.style.opacity = "1";
      }, 300);
    });
  }, []);

  return (
    <div className="min-h-screen relative flex flex-col">
      <NotificationCenter />
      <Background />

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <header className="flex flex-col items-center justify-center pt-1 pb-0">
          {showClock && <ClockWidget />}
          <div className="mt-0 w-full max-w-lg px-4">
            <SearchBox />
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center px-4 pb-0" style={{ minHeight: 0 }}>
          <div className="w-full flex-1 flex flex-col" style={{ minHeight: 0 }}>
            <div className="relative flex items-center gap-1.5 px-1 z-30 flex-wrap">
              {/* 主选择按钮 */}
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                onClick={() => setShowFolderPicker(!showFolderPicker)}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>
                  {folders.find((f) => f.id === currentFolder)?.title ||
                    getMessage("selectFolder", "选择文件夹")}
                </span>
              </button>

              {/* 固定的文件夹快捷按钮 */}
              {pinnedFolders.map((pid) => {
                const pf = folders.find((f) => f.id === pid);
                if (!pf) return null;
                const isActive = pid === currentFolder;
                return (
                  <div key={pid} className="relative group">
                    <button
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        isActive
                          ? "bg-white/15 text-white"
                          : "text-white/50 hover:text-white hover:bg-white/10"
                      }`}
                      onClick={() => handleFolderSelect(pid)}
                    >
                      <Pin className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{pf.title}</span>
                    </button>
                    <button
                      className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-black/70 text-white/40 hover:text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        unpinFolder(pid);
                      }}
                      title={getMessage("unpinFolder", "取消固定")}
                    >
                      <PinOff className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}

              {showFolderPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowFolderPicker(false)} />
                  <div className="absolute left-0 top-full z-40 mt-1 w-72 max-h-[70vh] overflow-y-auto rounded-xl border border-white/20 bg-black/60 backdrop-blur-2xl shadow-2xl">
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

            <div className="flex-1" style={{ minHeight: 0 }}>
              {showWidgets && currentFolder ? (
                <DesktopSystem ref={desktopRef} folderId={currentFolder} />
              ) : (
                <div className="flex items-center justify-center h-full text-white/40 text-sm">
                  {getMessage("selectFolderToStart", "请选择一个书签文件夹")}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <Dock
        isDark={isDark}
        onOpenSettings={() => setSettingsOpen(true)}
        onRefreshBackground={handleRefreshBackground}
      />

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function FolderTreeView({
  nodes,
  currentFolder,
  expandedFolders,
  pinnedFolders,
  onSelect,
  onToggle,
  onPin,
  onUnpin,
  level,
}: {
  nodes: FolderNode[];
  currentFolder: string | null;
  expandedFolders: Set<string>;
  pinnedFolders: string[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  level: number;
}) {
  return (
    <div className="folder-tree-list">
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedFolders.has(node.id);
        const isSelected = node.id === currentFolder;
        const isPinned = pinnedFolders.includes(node.id);
        const canSelect =
          node.hasUrlChildren ||
          (hasChildren &&
            node.children!.some((c) => c.hasUrlChildren || (c.children && c.children.length > 0)));

        return (
          <div key={node.id} className="folder-tree-item-wrapper">
            <div
              className={`folder-tree-item ${isSelected ? "selected" : ""} ${canSelect ? "selectable" : ""}`}
              style={{ paddingLeft: `${12 + level * 20}px` }}
              onClick={() => canSelect && onSelect(node.id)}
            >
              {hasChildren ? (
                <button
                  className="folder-tree-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(node.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="folder-tree-arrow-placeholder" />
              )}
              <Folder className="w-3.5 h-3.5 folder-tree-icon" />
              <span className="folder-tree-name">{node.title}</span>
              {canSelect && (
                <button
                  className="ml-auto p-0.5 rounded hover:bg-white/10 text-white/30 hover:text-white/70 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isPinned) onUnpin(node.id);
                    else onPin(node.id);
                  }}
                  title={
                    isPinned
                      ? getMessage("unpinFolder", "取消固定")
                      : getMessage("pinFolder", "固定文件夹")
                  }
                >
                  <Pin className={`w-3 h-3 ${isPinned ? "fill-white/60 text-white/60" : ""}`} />
                </button>
              )}
            </div>
            {hasChildren && isExpanded && (
              <FolderTreeView
                nodes={node.children!}
                currentFolder={currentFolder}
                expandedFolders={expandedFolders}
                pinnedFolders={pinnedFolders}
                onSelect={onSelect}
                onToggle={onToggle}
                onPin={onPin}
                onUnpin={onUnpin}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
