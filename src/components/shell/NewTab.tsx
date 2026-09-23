import { useEffect, useState, useCallback } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { ensureUapiSettingsHydrated } from "@/lib/uapi-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBackgroundStyle } from "@/components/background/Background";
import { ClockWidget } from "@/components/clock/ClockWidget";
import { SearchBox } from "@/components/search/SearchBox";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { NotificationCenter } from "@/components/notification/NotificationCenter";
import { DesktopWorkspace } from "@/components/desktop/DesktopWorkspace";
import { useWidgetRegistration } from "@/components/widget-system/WidgetSystem";

export function NewTab() {
  const { hydrate, showClock, glassOpacity, glassBlur } = useAppSettings();
  useTheme();
  useWidgetRegistration();
  const backgroundStyle = useBackgroundStyle();

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    hydrate();
    // UAPI 密钥/冷却状态独立存储，需与设置一起就绪，避免首个请求读到空密钥
    void ensureUapiSettingsHydrated();
  }, [hydrate]);

  // 玻璃效果同步：将透明度与模糊设置应用到 documentElement 的 CSS 变量
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

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);

  return (
    <div className="min-h-screen relative flex flex-col">
      <NotificationCenter />

      {/*
       * 壁纸必须画在玻璃元素的“背后”而不是“祖先”上：
       * backgroundStyle 带有 opacity 淡入，若把它挂在玻璃元素的祖先上，
       * 该祖先就会成为 backdrop root，模糊只能采样到它内部的内容（等于什么都没采样），
       * 表现为 backdrop-filter 完全不生效。因此这里用一个独立的绝对定位背景层，
       * 它与玻璃元素同级、位于其后（z-0 < z-10），既能被 backdrop-filter 采样，
       * 又能独立承担淡入动画。
       */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={backgroundStyle}
        aria-hidden
      />

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <header className="flex flex-col items-center justify-center pt-1 pb-3">
          {showClock && <ClockWidget />}
          <div className="mt-0 w-full max-w-lg px-4">
            <SearchBox />
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center px-4 pb-0" style={{ minHeight: 0 }}>
          <div className="w-full flex-1 flex flex-col" style={{ minHeight: 0 }}>
            <DesktopWorkspace
              onOpenSettings={handleOpenSettings}
              onRefreshBackground={handleRefreshBackground}
            />
          </div>
        </main>
      </div>

      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
