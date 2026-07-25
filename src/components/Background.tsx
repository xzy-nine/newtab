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

  useEffect(() => {
    setCachedUrl(null);
    setImageLoaded(false);
    setError(false);

    if (!rawBgUrl) {
      setImageLoaded(true);
      return;
    }

    getCachedImageUrl(rawBgUrl)
      .then((url) => {
        setCachedUrl(url);
      })
      .catch(() => {
        setError(true);
        setImageLoaded(true);
      });
  }, [rawBgUrl]);

  useEffect(() => {
    if (!cachedUrl) return;
    setImageLoaded(false);
    const img = new Image();
    img.onload = () => {
      setImageLoaded(true);
    };
    img.onerror = () => {
      setError(true);
      setImageLoaded(true);
    };
    img.src = cachedUrl;
    if (img.complete) {
      setImageLoaded(true);
    }
    return () => {
      img.src = "";
    };
  }, [cachedUrl]);

  const showDefault = !backgroundEnabled || bgType === "default" || error;

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
