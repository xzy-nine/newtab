/**
 * 侧边栏自身文档的外部链接拦截：点击指向外部的 http(s) 链接时，改为在侧边栏
 * 浏览器 iframe 中打开，而不是跳转到新标签页。只监听侧边栏自身文档——浏览器
 * iframe 里的链接属另一份文档（跨源），不会冒泡到这里，且本就留在 iframe 内。
 *
 * 仅接管"未修饰的左键点击"（Ctrl/Cmd/Shift/Alt 点击可强制走真实浏览器）。
 * 这里的协议/同源策略是纯逻辑；prefs 等"是否允许接管"的门由调用方通过
 * `takeoverEnabled(url)` 回调决定。
 */

/** 纯决策：返回要在侧边栏打开的 URL，或 null 放行该点击。`anchorHref` 必须是
 *  绝对 href（`<a>.href` 天然就是）。 */
export function shouldInterceptLink(anchorHref: string, selfOrigin: string): string | null {
  let url: URL;
  try {
    url = new URL(anchorHref);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // 同源链接是侧边栏内部导航（设置页、扩展文档），不送进浏览器。
  try {
    if (url.origin === new URL(selfOrigin).origin) return null;
  } catch {
    // selfOrigin 解析失败（实际不会）：防御性地接管。
  }
  return url.href;
}

/** 是否允许接管：仅未修饰的左键点击。 */
export function isPlainLeftClick(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * 注册整文档的点击捕获，把外部链接送进侧边栏浏览器。返回注销函数。
 */
export function registerLinkInterception(opts: {
  /** 对当前 url 是否允许接管（调用方的各类开关）。
   * @param 目标绝对 URL（已解析）。
   */
  takeoverEnabled: (url: URL) => boolean;
  /** 在侧边栏打开该 URL。 */
  openInSidebar: (url: string) => void;
  /** 侧边栏自身 origin（chrome-extension://<id>）。 */
  selfOrigin: string;
}): () => void {
  const onClick = (event: MouseEvent): void => {
    if (!isPlainLeftClick(event)) return;
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target === null || typeof (target as Element).closest !== "function") return;
    const anchor = (target as Element).closest("a[href]") as HTMLAnchorElement | null;
    if (anchor === null) return;
    const url = shouldInterceptLink(anchor.href, opts.selfOrigin);
    if (url === null) return;
    if (!opts.takeoverEnabled(new URL(url))) return;
    event.preventDefault();
    opts.openInSidebar(url);
  };
  document.addEventListener("click", onClick, true);
  return () => {
    document.removeEventListener("click", onClick, true);
  };
}
