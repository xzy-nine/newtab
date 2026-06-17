import { useEffect, useState, useMemo } from "react";
import { useAppSettings } from "@/lib/app-settings-store";

/**
 * 预加载图片，返回是否加载成功
 * @param url 图片地址
 * @returns Promise<boolean>
 */
function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    if (img.complete) resolve(true);
  });
}

/**
 * 背景样式 hook
 * 返回根容器应使用的 inline style，把背景图直接 inline 到 NewTab / SidePanelHome 根 div 上。
 * 这样 desktop-box 的 backdrop-filter 就能在同一 stacking context 内正确采样到背景图。
 * @returns React.CSSProperties
 */
export function useBackgroundStyle(): React.CSSProperties {
  const { backgroundEnabled, bgType, customImage } = useAppSettings();

  const bgUrl = useMemo(() => {
    if (bgType === "custom" && customImage) return customImage;
    if (bgType === "bing") return "https://bing.img.run/1920x1080.php";
    return null;
  }, [bgType, customImage]);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setError(false);
    if (!bgUrl) {
      setImageLoaded(true);
      return;
    }
    preloadImage(bgUrl).then((ok) => {
      if (ok) {
        setImageLoaded(true);
      } else {
        setError(true);
        setImageLoaded(true);
      }
    });
  }, [bgUrl]);

  const showDefault = !backgroundEnabled || bgType === "default" || error;

  // 关闭背景 / 无 URL / 加载失败 → 纯色兜底（不绘制图片）
  if (showDefault || !bgUrl) {
    return { backgroundColor: "oklch(0.1448 0 0)" };
  }

  // 正常情况：背景图 inline 到根容器上，backgroundAttachment: fixed 让背景稳定
  return {
    backgroundImage: `url(${bgUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
    backgroundRepeat: "no-repeat",
    opacity: imageLoaded ? 1 : 0,
    transition: "opacity 1000ms",
  };
}
