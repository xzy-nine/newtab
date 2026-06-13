import { useEffect, useState, useCallback, useRef } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBookmarkFolders } from "@/hooks/useBookmarkFolders";
import { Background } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { DesktopSystem, type DesktopSystemHandle } from "@/components/DesktopSystem";
import { SettingsPanel } from "@/components/SettingsPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Dock } from "@/components/Dock";
import { useWidgetRegistration } from "@/components/WidgetSystem";
import { FolderTreeView } from "@/components/FolderTreeView";
import { getMessage } from "@/lib/i18n";
import { Folder, Pin, PinOff } from "lucide-react";

export function NewTab() {
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

  // 玻璃效果同步：将设置值应用到 documentElement 的 CSS 变量和 data 属性
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
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
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
                          ? "bg-foreground/15 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-foreground/10"
                      }`}
                      onClick={() => handleFolderSelect(pid)}
                    >
                      <Pin className="w-3 h-3" />
                      <span className="max-w-[120px] truncate">{pf.title}</span>
                    </button>
                    <button
                      className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-background/70 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
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
                  <div
                    className="fixed inset-0"
                    style={{ zIndex: 50 }}
                    onClick={() => setShowFolderPicker(false)}
                  />
                  <div
                    className="absolute left-0 top-full mt-1 w-72 max-h-[70vh] overflow-y-auto rounded-xl xb-glass-popover shadow-2xl"
                    style={{ zIndex: 51 }}
                  >
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
