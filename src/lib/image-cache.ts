const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY_PREFIX = "image-cache:";

interface ImageCacheEntry {
  dataUrl: string;
  timestamp: number;
}

async function getCacheEntry(url: string): Promise<ImageCacheEntry | null> {
  const key = STORAGE_KEY_PREFIX + url;
  const result = await browser.storage.local.get(key);
  return key in result ? (result[key] as ImageCacheEntry) : null;
}

async function setCacheEntry(url: string, dataUrl: string): Promise<void> {
  const key = STORAGE_KEY_PREFIX + url;
  await browser.storage.local.set({
    [key]: {
      dataUrl,
      timestamp: Date.now(),
    },
  });
}

function isCacheValid(entry: ImageCacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getCachedImageUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) {
    return url;
  }

  const entry = await getCacheEntry(url);
  if (entry && isCacheValid(entry)) {
    return entry.dataUrl;
  }

  const dataUrl = await fetchImageAsDataUrl(url);
  await setCacheEntry(url, dataUrl);
  return dataUrl;
}

export async function clearImageCache(url?: string): Promise<void> {
  if (url) {
    const key = STORAGE_KEY_PREFIX + url;
    await browser.storage.local.remove(key);
  } else {
    const all = await browser.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter((k) => k.startsWith(STORAGE_KEY_PREFIX));
    if (keysToRemove.length > 0) {
      await browser.storage.local.remove(keysToRemove);
    }
  }
}
