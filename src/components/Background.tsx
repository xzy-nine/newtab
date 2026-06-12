import { useEffect, useState, useMemo } from "react";
import { useAppSettings } from "@/lib/app-settings-store";

function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    if (img.complete) resolve(true);
  });
}

export function Background() {
  const { backgroundEnabled, bgType, customImage, backgroundBlur, backgroundDark } =
    useAppSettings();

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

  return (
    <div className="fixed inset-0 z-0">
      {showDefault ? (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
      ) : (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
          )}
          <img
            src={bgUrl!}
            alt="Background"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            style={{
              filter: backgroundBlur > 0 ? `blur(${backgroundBlur}px)` : undefined,
            }}
          />
          <div
            className="absolute inset-0 transition-colors duration-500"
            style={{
              backgroundColor: `rgba(0, 0, 0, ${backgroundDark})`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/50" />
        </>
      )}
    </div>
  );
}
