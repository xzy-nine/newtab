import { Settings, RefreshCw, Sun, Moon } from "lucide-react";
import { useAppSettings } from "@/lib/app-settings-store";

interface DockProps {
  onOpenSettings?: () => void;
  onRefreshBackground?: () => void;
  pageCount?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  isDark?: boolean;
}

export function Dock({
  onOpenSettings,
  onRefreshBackground,
  pageCount = 1,
  currentPage = 0,
  onPageChange,
  isDark = false,
}: DockProps) {
  const { theme, setTheme } = useAppSettings();

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
          <button
            className="dock-btn active:scale-90 transition-all duration-150"
            title={`主题: ${themeLabel()}`}
            onClick={handleToggleTheme}
          >
            {themeIcon()}
          </button>
          <button
            className="dock-btn active:scale-90 transition-all duration-150"
            title="更换背景"
            onClick={onRefreshBackground}
          >
            <RefreshCw className="dock-icon" />
          </button>
          <button
            className="dock-btn active:scale-90 transition-all duration-150"
            title="设置"
            onClick={onOpenSettings}
          >
            <Settings className="dock-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}
