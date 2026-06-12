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
import { Folder, ChevronRight, ChevronDown, Settings } from "lucide-react";

export function NewTab() {
  const { hydrate, showClock, showWidgets } = useAppSettings();
  useTheme();
  useWidgetRegistration();

  const { currentFolder, folders, folderTree, expandedFolders, toggleFolder, selectFolder } =
    useBookmarkFolders();
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

      <button
        onClick={() => setSettingsOpen(true)}
        className="fixed top-4 right-4 z-50 flex items-center justify-center w-10 h-10 rounded-md bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white transition-colors"
        title="设置"
      >
        <Settings className="w-5 h-5" />
      </button>

      <div className="relative z-10 flex-1 flex flex-col">
        <header className="flex flex-col items-center justify-center pt-12 pb-4">
          {showClock && <ClockWidget />}
          <div className="mt-6 w-full max-w-lg px-4">
            <SearchBox />
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center px-4 pb-4" style={{ minHeight: 0 }}>
          <div className="w-full max-w-4xl flex-1 flex flex-col" style={{ minHeight: 0 }}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                onClick={() => setShowFolderPicker(!showFolderPicker)}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>
                  {folders.find((f) => f.id === currentFolder)?.title ||
                    getMessage("selectFolder", "选择文件夹")}
                </span>
              </button>
            </div>

            {showFolderPicker && (
              <div className="folder-picker mb-2 rounded-lg bg-white/10 backdrop-blur-sm">
                <FolderTreeView
                  nodes={folderTree}
                  currentFolder={currentFolder}
                  expandedFolders={expandedFolders}
                  onSelect={handleFolderSelect}
                  onToggle={toggleFolder}
                  level={0}
                />
              </div>
            )}

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
        onAddWidget={() => desktopRef.current?.openAddWidget()}
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
  onSelect,
  onToggle,
  level,
}: {
  nodes: FolderNode[];
  currentFolder: string | null;
  expandedFolders: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  level: number;
}) {
  return (
    <div className="folder-tree-list">
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedFolders.has(node.id);
        const isSelected = node.id === currentFolder;
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
            </div>
            {hasChildren && isExpanded && (
              <FolderTreeView
                nodes={node.children!}
                currentFolder={currentFolder}
                expandedFolders={expandedFolders}
                onSelect={onSelect}
                onToggle={onToggle}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
