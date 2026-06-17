import { useRef } from "react";
import { Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSettings } from "@/lib/app-settings-store";
import { getMessage } from "@/lib/i18n";

function compressImage(dataUrl: string, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function isImageTooLarge(dataUrl: string): boolean {
  const byteSize = (dataUrl.length * 3) / 4;
  return byteSize > 4 * 1024 * 1024;
}

export function BackgroundSettings() {
  const {
    bgType,
    customImage,
    glassOpacity,
    setBgType,
    setCustomImage,
    setGlassOpacity,
    backgroundEnabled,
    setBackgroundEnabled,
  } = useAppSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let dataUrl = reader.result as string;
      if (isImageTooLarge(dataUrl)) {
        dataUrl = await compressImage(dataUrl, 0.7);
      }
      if (isImageTooLarge(dataUrl)) {
        alert(getMessage("imageTooLarge", "图片过大，请选择更小的图片"));
        return;
      }
      setCustomImage(dataUrl);
      setBgType("custom");
    };
    reader.readAsDataURL(file);
  };

  const handleClearCustom = () => {
    setCustomImage(null);
    if (bgType === "custom") setBgType("bing");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{getMessage("backgroundImage", "背景图片")}</p>
          <p className="text-xs text-gray-500">
            {getMessage("bingDailyWallpaper", "使用 Bing 每日壁纸")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${backgroundEnabled ? "bg-green-500" : "bg-gray-300"}`}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBackgroundEnabled(!backgroundEnabled)}
          >
            {backgroundEnabled ? getMessage("enabled", "已开启") : getMessage("disabled", "已关闭")}
          </Button>
        </div>
      </div>

      {backgroundEnabled && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm">{getMessage("bgType", "背景类型")}</p>
            <Select
              value={bgType}
              onValueChange={(v) => setBgType(v as "bing" | "custom" | "default")}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bing">{getMessage("bingWallpaper", "Bing 每日壁纸")}</SelectItem>
                <SelectItem value="custom">{getMessage("customImage", "自定义图片")}</SelectItem>
                <SelectItem value="default">{getMessage("solidColor", "纯色背景")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {bgType === "custom" && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1" />
                {getMessage("uploadImage", "上传图片")}
              </Button>
              {customImage && (
                <Button variant="outline" size="sm" onClick={handleClearCustom}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  {getMessage("reset", "重置")}
                </Button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm">{getMessage("glassOpacity", "玻璃透明度")}</p>
              <span className="text-xs text-gray-500 w-8 text-right">{glassOpacity}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={glassOpacity}
              onChange={(e) => setGlassOpacity(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
        </>
      )}
    </div>
  );
}
