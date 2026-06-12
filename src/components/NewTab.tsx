import { useEffect } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { Background } from "@/components/Background";
import { ClockWidget } from "@/components/ClockWidget";
import { SearchBox } from "@/components/SearchBox";
import { BookmarksList } from "@/components/BookmarksList";
import { SettingsPanel } from "@/components/SettingsPanel";
import { NotificationCenter } from "@/components/NotificationCenter";
import { WidgetSystem } from "@/components/WidgetSystem";

export function NewTab() {
  const { hydrate, showClock, showBookmarks, showWidgets } = useAppSettings();
  useTheme();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <div className="min-h-screen relative">
      <NotificationCenter />
      <Background />

      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="flex-1 flex flex-col items-center justify-center">
          {showClock && <ClockWidget />}

          <div className="mt-8 w-full px-4">
            <SearchBox />
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center">
          {showBookmarks && (
            <div className="w-full max-w-md px-4">
              <BookmarksList />
            </div>
          )}
          {showWidgets && (
            <div className="w-full max-w-2xl px-4 mt-4">
              <WidgetSystem />
            </div>
          )}
        </div>

        <footer className="pb-8">
          <SettingsPanel />
        </footer>
      </div>
    </div>
  );
}
