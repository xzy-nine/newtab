import { useEffect, useState, useMemo } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { getCachedImageUrl } from "@/lib/image-cache";

export function useBackgroundStyle(): React.CSSProperties {
  const { backgroundEnabled, bgType, customImage } = useAppSettings();

  const rawBgUrl = useMemo(() => {
    if (bgType === "custom" && customImage) return customImage;
    if (bgType === "bing") return "https://uapis.cn/api/v1/image/bing-daily";
    return null;
  }, [bgType, customImage]);

  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(false);

  // 异步获取缓存图片 — rawBgUrl 变化时 effect 重新执行
  useEffect(() => {
    if (!rawBgUrl) return;
    let cancelled = false;
    getCachedImageUrl(rawBgUrl)
      .then((url) => {
        if (!cancelled) setCachedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [rawBgUrl]);

  // 预加载图片
  useEffect(() => {
    if (!cachedUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImageLoaded(true);
    };
    img.onerror = () => {
      if (!cancelled) {
        setError(true);
        setImageLoaded(true);
      }
    };
    img.src = cachedUrl;
    return () => {
      cancelled = true;
      img.src = "";
    };
  }, [cachedUrl]);

  const showDefault = !backgroundEnabled || bgType === "default" || error || !rawBgUrl;

  if (showDefault || !cachedUrl) {
    return { backgroundColor: "oklch(0.1448 0 0)" };
  }

  return {
    backgroundImage: `url(${cachedUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
    backgroundRepeat: "no-repeat",
    opacity: imageLoaded ? 1 : 0,
    transition: "opacity 1000ms",
  };
}
