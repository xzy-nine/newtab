import { useEffect } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBackgroundStyle } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { NotificationCenter } from "@/components/NotificationCenter";
import { DesktopWorkspace } from "@/components/DesktopWorkspace";
import { useWidgetRegistration } from "@/components/WidgetSystem";

export function SidePanelHome() {
  const { hydrate, showClock, glassOpacity } = useAppSettings();
  useTheme();
  useWidgetRegistration();
  const backgroundStyle = useBackgroundStyle();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // 玻璃效果同步：将设置值应用到 documentElement 的 CSS 变量和 data 属性
  useEffect(() => {
    const el = document.documentElement;
    const isGlassActive = glassOpacity < 100;
    if (isGlassActive) {
      el.setAttribute("data-glass", "");
    } else {
      el.removeAttribute("data-glass");
    }
    el.style.setProperty("--xb-glass-opacity", `${glassOpacity / 100}`);
  }, [glassOpacity]);

  return (
    <div
      className="h-full w-full overflow-hidden flex flex-col bg-background text-foreground relative"
      style={backgroundStyle}
    >
      <NotificationCenter />

      <div className="flex-1 flex flex-col">
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

        <div className="flex-1 flex flex-col px-3 pb-2" style={{ minHeight: 0 }}>
          <DesktopWorkspace compact />
        </div>
      </div>
    </div>
  );
}
