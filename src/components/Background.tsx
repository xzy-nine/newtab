import { useEffect, useState } from "react";
import { useAppSettings } from "@/lib/app-settings-store";

export function Background() {
  const { backgroundEnabled, backgroundImageUrl } = useAppSettings();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    setError(false);
  }, [backgroundImageUrl]);

  if (!backgroundEnabled) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-0" />
    );
  }

  return (
    <div className="fixed inset-0 z-0">
      {!imageLoaded && !error && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" />
      )}
      <img
        src={backgroundImageUrl}
        alt="Background"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          imageLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setImageLoaded(true)}
        onError={() => {
          setError(true);
          setImageLoaded(true);
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/50" />
    </div>
  );
}
