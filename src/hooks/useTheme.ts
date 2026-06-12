import { useEffect } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { resolveIsDarkMode } from "@/lib/app-settings";

export function useTheme() {
  const { theme } = useAppSettings();

  useEffect(() => {
    const applyTheme = (isDark: boolean) => {
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", isDark);
      window.dispatchEvent(new CustomEvent("theme-changed", { detail: { isDark } }));
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      const isDark = resolveIsDarkMode(theme, mediaQuery.matches);
      applyTheme(isDark);
    };

    handleChange();

    if (theme === "system") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);
}
