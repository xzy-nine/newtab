import { useEffect, useState, useCallback } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { ensureUapiSettingsHydrated } from "@/lib/uapi-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useBackgroundStyle } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { SettingsPanel } from "@/components/SettingsPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { DesktopWorkspace } from "@/components/DesktopWorkspace";
import { useWidgetRegistration } from "@/components/WidgetSystem";

export function NewTab() {
  const { hydrate, showClock, glassOpacity } = useAppSettings();
  useTheme();
  useWidgetRegistration();
  const backgroundStyle = useBackgroundStyle();

  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    hydrate();
    // UAPI 密钥/冷却状态独立存储，需与设置一起就绪，避免首个请求读到空密钥
    void ensureUapiSettingsHydrated();
  }, [hydrate]);

  // 玻璃效果同步：将设置值应用到 documentElement 的 CSS 变量
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
    <div className="min-h-screen relative flex flex-col" style={backgroundStyle}>
      <NotificationCenter />

      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        <header className="flex flex-col items-center justify-center pt-1 pb-0">
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
