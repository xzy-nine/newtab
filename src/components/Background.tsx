import { useEffect, useState, useMemo } from "react";
import { useAppSettings } from "@/lib/app-settings-store";
import { readCache, readThroughCache } from "@/lib/cache-store";
import {
  BING_WALLPAPER_FALLBACK_URL,
  bingWallpaperTtlMs,
  pickBingImageUrl,
  uapiFetch,
} from "@/lib/uapi";

/** 壁纸元数据缓存的键（只缓存一个很小的 JSON，不缓存图片本身）。 */
const BING_WALLPAPER_CACHE_KEY = "bing-wallpaper-url";

/** 壁纸来源标识：必应壁纸用固定标记，自定义图片直接用其 URL。 */
const BING_SOURCE = "bing";

/**
 * 取必应每日壁纸的图片地址。
 *
 * 走 `format=json` 只拿元数据（约几百字节），图片交给浏览器 HTTP 缓存：
 * - 一天只需一个 API 请求（服务端另有约 30 分钟缓存），
 * - 不再把 4K 图片转成 data URL 写进 `storage.local`（那会撑爆配额并导致背景静默失效）。
 *
 * 失败链路：JSON 请求失败/解析不出地址 → 回退服务端直链；
 * 直链也加载不出来时，调用方回落为纯色背景。
 */
async function resolveBingWallpaperUrl(): Promise<string> {
  try {
    return await readThroughCache(
      BING_WALLPAPER_CACHE_KEY,
      async () => {
        const body = await uapiFetch<unknown>("/image/bing-daily", {
          query: { format: "json", resolution: "4k" },
        });
        const picked = pickBingImageUrl(body, "4k");
        if (!picked) throw new Error("INVALID_BING_WALLPAPER_RESPONSE");
        return picked;
      },
      bingWallpaperTtlMs(),
      (value): boolean => typeof value === "string" && value.trim() !== "",
    );
  } catch {
    // 拿不到元数据就直接用图片直链，让浏览器自己处理
    return BING_WALLPAPER_FALLBACK_URL;
  }
}

/**
 * 新标签页背景样式。
 *
 * 「已加载 / 加载失败」都通过**渲染期派生**（把地址与当前 URL 比对）而不是
 * 在 effect 里重置 state，这样切换背景时不会产生多余的级联渲染。
 */
export function useBackgroundStyle(): React.CSSProperties {
  const { backgroundEnabled, bgType, customImage } = useAppSettings();

  /** 当前壁纸来源；变化即表示换了图。 */
  const source: string | null =
    bgType === "custom" && customImage ? customImage : bgType === "bing" ? BING_SOURCE : null;

  /** 同步就能拿到的地址：自定义图片本身就是地址；必应先用缓存秒开（可能是过期值）。 */
  const syncUrl = useMemo(() => {
    if (source === null) return null;
    if (source !== BING_SOURCE) return source;
    return readCache<string>(BING_WALLPAPER_CACHE_KEY) ?? null;
  }, [source]);

  /** 异步解析出的必应地址，连同它所属来源一起记录，来源变了就自然作废。 */
  const [fetched, setFetched] = useState<{ source: string; url: string } | null>(null);
  const url = source !== null && fetched?.source === source ? fetched.url : syncUrl;

  /** 已成功加载 / 加载失败的地址；与当前 url 比对即可派生出状态。 */
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const imageLoaded = url !== null && loadedUrl === url;
  const failed = url !== null && failedUrl === url;

  // 必应壁纸需要异步解析出真实图片地址；自定义图片同步可用，无需请求。
  useEffect(() => {
    if (source !== BING_SOURCE) return;
    let cancelled = false;
    resolveBingWallpaperUrl().then((resolvedUrl) => {
      if (!cancelled) setFetched({ source: BING_SOURCE, url: resolvedUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // 预加载图片：成功与失败都记录在对应的地址上
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLoadedUrl(url);
    };
    img.onerror = () => {
      if (!cancelled) setFailedUrl(url);
    };
    img.src = url;
    return () => {
      cancelled = true;
      img.src = "";
    };
  }, [url]);

  const showDefault = !backgroundEnabled || bgType === "default" || failed || !url;

  if (showDefault || !url) {
    return { backgroundColor: "oklch(0.1448 0 0)" };
  }

  return {
    backgroundImage: `url(${url})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundAttachment: "fixed",
    backgroundRepeat: "no-repeat",
    opacity: imageLoaded ? 1 : 0,
    transition: "opacity 1000ms",
  };
}
