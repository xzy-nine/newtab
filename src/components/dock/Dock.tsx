import { useState } from "react";
import { Settings, RefreshCw, Sun, Moon, Folder, Plus } from "lucide-react";
import { useAppSettings } from "@/lib/app-settings-store";
import { getMessage } from "@/lib/i18n";
import { DockFolderLayer, type DockFolderLayerProps } from "@/components/dock/DockFolderLayer";

interface DockProps {
  onOpenSettings?: () => void;
  onRefreshBackground?: () => void;
  pageCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  /** 文件夹浮层所需的文件夹数据与回调；缺省时不显示文件夹按钮。 */
  folderLayer?: Omit<DockFolderLayerProps, "onClose"> | null;
  /** "添加"菜单入口。 */
  onAddShortcut?: () => void;
  onAddWidget?: () => void;
}

export function Dock({
  onOpenSettings,
  onRefreshBackground,
  pageCount = 1,
  currentPage = 0,
  onPageChange,
  folderLayer = null,
  onAddShortcut,
  onAddWidget,
}: DockProps) {
  const { theme, setTheme } = useAppSettings();
  const [layerOpen, setLayerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const themeOrder: Array<"system" | "light" | "dark"> = ["system", "light", "dark"];

  const handleToggleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  };

  const themeIcon = () => {
    if (theme === "system") return <span className="dock-icon dock-icon-text">Auto</span>;
    if (theme === "dark") return <Moon className="dock-icon" />;
    return <Sun className="dock-icon" />;
  };

  const themeLabel = () => {
    if (theme === "system") return "自动";
    if (theme === "dark") return "深色";
    return "浅色";
  };

  return (
    <>
      <div className="dock-container">
        <div className="dock-inner">
          {pageCount > 1 && (
            <div className="dock-pages">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  className={`dock-page-dot ${i === currentPage ? "active" : ""}`}
                  onClick={() => onPageChange?.(i)}
                />
              ))}
            </div>
          )}

          <div className="dock-right">
            {(onAddShortcut || onAddWidget) && (
              <button
                className={`dock-btn active:scale-90 transition-all duration-150 ${
                  addOpen ? "dock-btn-active" : ""
                }`}
                title={getMessage("addToDesktop", "添加到主桌面")}
                onClick={() => setAddOpen((v) => !v)}
              >
                <Plus className="dock-icon" />
              </button>
            )}

            {folderLayer && (
              <button
                className={`dock-btn active:scale-90 transition-all duration-150 ${
                  layerOpen ? "dock-btn-active" : ""
                }`}
                title={getMessage("folderDrawer", "文件夹")}
                onClick={() => setLayerOpen((v) => !v)}
              >
                <Folder className="dock-icon" />
              </button>
            )}

            <button
              className="dock-btn active:scale-90 transition-all duration-150"
              title={`主题: ${themeLabel()}`}
              onClick={handleToggleTheme}
            >
              {themeIcon()}
            </button>
            <button
              className="dock-btn active:scale-90 transition-all duration-150"
              title={getMessage("refreshBackground", "更换背景")}
              onClick={onRefreshBackground}
            >
              <RefreshCw className="dock-icon" />
            </button>
            <button
              className="dock-btn active:scale-90 transition-all duration-150"
              title={getMessage("settingsTitle", "设置")}
              onClick={onOpenSettings}
            >
              <Settings className="dock-icon" />
            </button>
          </div>
        </div>
      </div>

      {/* "添加"菜单：锚在 Dock 上方 */}
      {addOpen && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setAddOpen(false)} />
          <div className="dock-menu xb-glass-popover" role="menu">
            <button
              className="dock-menu-item"
              onClick={() => {
                setAddOpen(false);
                onAddShortcut?.();
              }}
            >
              {getMessage("addShortcut", "添加快捷方式")}
            </button>
            <button
              className="dock-menu-item"
              onClick={() => {
                setAddOpen(false);
                onAddWidget?.();
              }}
            >
              {getMessage("addWidget", "添加小部件")}
            </button>
          </div>
        </>
      )}

      {/* 仅在打开时挂载浮层，初始选中项由 initialFolderId 直接决定 */}
      {folderLayer && layerOpen && (
        <DockFolderLayer
          {...folderLayer}
          key={folderLayer.initialFolderId ?? "none"}
          initialFolderId={folderLayer.initialFolderId ?? null}
          onClose={() => setLayerOpen(false)}
        />
      )}
    </>
  );
}
