import { useEffect } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { ensureUapiSettingsHydrated } from "@/lib/uapi-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBackgroundStyle } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { NotificationCenter } from "@/components/NotificationCenter";
import { DesktopWorkspace } from "@/components/DesktopWorkspace";
import { useWidgetRegistration } from "@/components/WidgetSystem";

export function SidePanelHome() {
  const { hydrate, showClock, glassOpacity, glassBlur } = useAppSettings();
  useTheme();
  useWidgetRegistration();
  const backgroundStyle = useBackgroundStyle();

  useEffect(() => {
    hydrate();
    // UAPI 密钥/冷却状态独立存储，需与设置一起就绪
    void ensureUapiSettingsHydrated();
  }, [hydrate]);

  // 玻璃效果同步：将透明度与模糊设置应用到 documentElement 的 CSS 变量和 data 属性
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

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-background text-foreground relative">
      <NotificationCenter />

      {/*
       * 同 NewTab：壁纸必须画在玻璃元素背后（同级、更低 z-index），
       * 不能挂在玻璃元素的祖先上并附带 opacity 淡入——那会让祖先成为 backdrop root，
       * 使 backdrop-filter 采样不到壁纸而不生效。
       */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={backgroundStyle}
        aria-hidden
      />

      <div className="relative z-10 flex-1 flex flex-col" style={{ minHeight: 0 }}>
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
