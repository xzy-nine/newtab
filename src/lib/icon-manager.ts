const iconCache = new Map<string, { data: string; timestamp: number }>();
const FETCH_TIMEOUT = 3000;

interface IconResult {
  url: string;
  data: string;
  width: number;
  height: number;
  isSvg: boolean;
  score: number;
}

export async function getIconUrl(url: string): Promise<string> {
  if (!url) return "";

  const domain = getDomain(url);

  if (iconCache.has(domain)) {
    return stripFallbackPrefix(iconCache.get(domain)!.data);
  }

  try {
    const cached = (await chrome.storage.local.get([url, domain])) as Record<
      string,
      string | undefined
    >;
    const iconData = cached[url] || cached[domain];
    if (iconData && !iconData.startsWith("data:text/html")) {
      iconCache.set(domain, { data: iconData, timestamp: Date.now() });
      return stripFallbackPrefix(iconData);
    }
  } catch {}

  return generateInitialBasedIcon(domain);
}

export async function fetchIconFromSources(url: string, domain: string): Promise<string | null> {
  const iconUrls = [
    `${domain}/favicon.ico`,
    `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=64`,
    `https://api.faviconkit.com/${new URL(url).hostname}/64`,
    `https://favicon.yandex.net/favicon/${new URL(url).hostname}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}`,
  ];

  let htmlIconUrls: string[] = [];
  try {
    htmlIconUrls = await extractIconUrlsFromHtml(url);
  } catch {}

  const allUrls = [...htmlIconUrls, ...iconUrls];
  const promises = allUrls.map((iconUrl) => tryFetchIcon(iconUrl));
  const results = await Promise.all(promises);
  const validIcons = results.filter((r): r is IconResult => r !== null);

  if (validIcons.length > 0) {
    validIcons.sort((a, b) => b.score - a.score);
    const bestIcon = validIcons[0];
    let finalIconData = bestIcon.data;
    if (!bestIcon.isSvg && (bestIcon.width < 32 || bestIcon.height < 32)) {
      finalIconData = await addPaddingToSmallIcon(bestIcon.data);
    }
    await chrome.storage.local.set({ [url]: finalIconData });
    iconCache.set(domain, { data: finalIconData, timestamp: Date.now() });
    return finalIconData;
  }

  const fallbackIcon = generateInitialBasedIcon(domain);
  iconCache.set(domain, { data: fallbackIcon, timestamp: Date.now() });
  await chrome.storage.local.set({ [url]: fallbackIcon });
  return fallbackIcon;
}

async function extractIconUrlsFromHtml(url: string): Promise<string[]> {
  const icons: string[] = [];
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) return icons;

    const text = await response.text();
    const regex =
      /<link[^>]*rel=["'](icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      try {
        icons.push(new URL(match[2], url).href);
      } catch {}
    }

    if (icons.length === 0) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      doc
        .querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
        )
        .forEach((link) => {
          const href = link.getAttribute("href");
          if (href) icons.push(new URL(href, url).href);
        });
    }
  } catch {}
  return icons;
}

async function tryFetchIcon(iconUrl: string): Promise<IconResult | null> {
  try {
    const response = await fetch(iconUrl, {
      mode: "cors",
      credentials: "omit",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!response.ok) return null;

    const blob = await response.blob();
    const base64data = await blobToBase64(blob);
    if (base64data.startsWith("data:text")) return null;

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = base64data;
    });

    if (img.width < 5 || img.height < 5) return null;

    const isSvg = base64data.includes("data:image/svg+xml");
    return {
      url: iconUrl,
      data: base64data,
      width: img.width,
      height: img.height,
      isSvg,
      score: isSvg ? 1000 : Math.max(img.width, img.height),
    };
  } catch {
    return null;
  }
}

function addPaddingToSmallIcon(iconData: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext("2d")!;
      const scaleFactor = Math.min(24 / img.width, 24 / img.height);
      const newWidth = img.width * scaleFactor;
      const newHeight = img.height * scaleFactor;
      ctx.drawImage(img, (32 - newWidth) / 2, (32 - newHeight) / 2, newWidth, newHeight);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(iconData);
    img.src = iconData;
  });
}

export function generateInitialBasedIcon(domain: string): string {
  const cleanDomain = domain
    .replace(/^.*?:\/\//, "")
    .split("?")[0]
    .split("#")[0];
  const keyword = extractKeyword(cleanDomain) || "?";
  const prefix =
    keyword.length <= 2
      ? keyword.toUpperCase()
      : keyword.charAt(0).toUpperCase() + keyword.slice(1, 4).toLowerCase();
  const bgColor = `hsl(${Math.abs(hashCode(domain)) % 360}, 70%, 60%)`;

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  const fontSize = prefix.length <= 2 ? 36 : prefix.length === 3 ? 26 : 20;
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(prefix, 32, 32);

  return canvas.toDataURL("image/png");
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getDomain(url: string): string {
  try {
    const { protocol, hostname } = new URL(url);
    return `${protocol}//${hostname}`;
  } catch {
    return url;
  }
}

function extractKeyword(domain: string): string {
  const parts = domain.split(".");
  const tldPattern = /^[a-z]{2,4}$/i;
  const secondLevelPattern = /^(co|com|net|org|gov|edu|ac|www)$/i;
  const commonSubdomainPatterns = [
    /^www\d*$/i,
    /^m(obile)?$/i,
    /^(api|app)$/i,
    /^(mail|ftp|blog|news|shop)$/i,
  ];

  const workingParts = [...parts];
  if (workingParts.length > 1 && tldPattern.test(workingParts[workingParts.length - 1])) {
    workingParts.pop();
    if (workingParts.length > 1 && secondLevelPattern.test(workingParts[workingParts.length - 1])) {
      workingParts.pop();
    }
  }

  for (let i = workingParts.length - 1; i >= 0; i--) {
    const part = workingParts[i];
    const isCommon = commonSubdomainPatterns.some((p) => p.test(part));
    const isNumber = /^\d+$/.test(part);
    if (workingParts.length === 1 || (!isCommon && !isNumber)) return part;
  }

  return workingParts[0] || "site";
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

function stripFallbackPrefix(iconData: string): string {
  const PREFIX = "data:image/png;base64,FALLBACKICON:";
  if (iconData && iconData.startsWith(PREFIX)) {
    return "data:image/png;base64," + iconData.substring(PREFIX.length);
  }
  return iconData;
}
