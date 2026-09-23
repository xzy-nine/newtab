import { emitSidebarNavigate } from "@/lib/sidebar-nav";

/**
 * 在侧边栏或新标签页中打开一个 URL。
 *
 * 侧边栏内的桌面/书签点击应留在侧边栏浏览（`SidePanel` 订阅导航通道），
 * 新标签页中则新建标签页。供主桌面、文件夹桌面与 Dock 抽屉共用。
 */
export function openUrl(url: string): void {
  if (!url) return;
  if ((window as unknown as { __IN_SIDEPANEL__?: boolean }).__IN_SIDEPANEL__) {
    emitSidebarNavigate(url);
  } else {
    chrome.tabs.create({ url });
  }
}

/** 当前是否运行在侧边栏页面内。 */
export function isInSidePanel(): boolean {
  return Boolean((window as unknown as { __IN_SIDEPANEL__?: boolean }).__IN_SIDEPANEL__);
}
