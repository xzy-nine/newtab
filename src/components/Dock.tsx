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

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : theme === "light" ? "dark" : "light";
    setTheme(next);
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
          <button className="dock-btn" title="切换主题" onClick={handleToggleTheme}>
            {isDark ? <Sun className="dock-icon" /> : <Moon className="dock-icon" />}
          </button>
          <button className="dock-btn" title="更换背景" onClick={onRefreshBackground}>
            <RefreshCw className="dock-icon" />
          </button>
          <button className="dock-btn" title="设置" onClick={onOpenSettings}>
            <Settings className="dock-icon" />
          </button>
        </div>
      </div>
    </div>
  );
}
