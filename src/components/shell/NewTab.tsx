import { useCallback, useState } from "react";
import { useShellBootstrap } from "@/hooks/useShellBootstrap";
import { ClockWidget } from "@/components/clock/ClockWidget";
import { SearchBox } from "@/components/search/SearchBox";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { NotificationCenter } from "@/components/notification/NotificationCenter";
import { DesktopWorkspace } from "@/components/desktop/DesktopWorkspace";

export function NewTab() {
  const { showClock, backgroundStyle } = useShellBootstrap();

  const [settingsOpen, setSettingsOpen] = useState(false);

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
