import { useEffect } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { ensureUapiSettingsHydrated } from "@/lib/uapi-settings-store";
import { useTheme } from "@/hooks/useTheme";
import { useGlassSurface } from "@/hooks/useGlassSurface";
import { useBackgroundStyle } from "@/components/background/Background";
import { useWidgetRegistration } from "@/components/widget-system/WidgetSystem";

/** 外壳启动后需要渲染的数据。 */
export interface ShellBootstrap {
  /** 是否显示时钟。 */
  showClock: boolean;
  /** 壁纸容器样式。 */
  backgroundStyle: React.CSSProperties;
}

/**
 * 新标签页与侧边栏共用的外壳启动流程。
 *
 * 两处外壳的布局不同但启动步骤一致：主题、小部件注册、设置与 UAPI 密钥的
 * 水合、玻璃素材同步、壁纸样式。任何一步只在一侧执行，都会让两侧的行为分叉。
 *
 * @returns 外壳渲染所需的数据。
 */
export function useShellBootstrap(): ShellBootstrap {
  const { hydrate, showClock, glassOpacity, glassBlur } = useAppSettings();
  useTheme();
  useWidgetRegistration();
  const backgroundStyle = useBackgroundStyle();

  useEffect(() => {
    hydrate();
    // UAPI 密钥/冷却状态独立存储，需与设置一起就绪，避免首个请求读到空密钥
    void ensureUapiSettingsHydrated();
  }, [hydrate]);

  useGlassSurface(glassOpacity, glassBlur);

  return { showClock, backgroundStyle };
}
