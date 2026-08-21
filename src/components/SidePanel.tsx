import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Smartphone } from "lucide-react";
import { SidePanelHome } from "@/components/SidePanelHome";
import { BrowserView } from "@/components/BrowserView";
import { onSidebarNavigate } from "@/lib/sidebar-nav";
import { registerLinkInterception } from "@/lib/link-intercept";

type OpenMode = "sidebar" | "main-window";
type PanelMode = "home" | "browse";

export function SidePanel() {
  const [openMode, setOpenMode] = useState<OpenMode>("sidebar");
  const [panelMode, setPanelMode] = useState<PanelMode>("home");
  const [browseUrl, setBrowseUrl] = useState("");
  /** 每次外部导航递增，以便强制重新装载 BrowserView（重置其初始地址）。 */
  const [browseSeq, setBrowseSeq] = useState(0);
  const [mobileUa, setMobileUa] = useState(true);

  const openModeRef = useRef(openMode);
  openModeRef.current = openMode;

  // 统一入口：按 openMode 决定"侧边栏打开"或"主窗口打开"。
  const openInSidebar = useCallback((targetUrl: string) => {
    if (!targetUrl) return;
    if (openModeRef.current === "main-window") {
      chrome.tabs.create({ url: targetUrl });
      return;
    }
    setBrowseUrl(targetUrl);
    setBrowseSeq((s) => s + 1);
    setPanelMode("browse");
  }, []);

  // 供事件回调以最新 openMode 调用。
  const openInSidebarRef = useRef(openInSidebar);
  openInSidebarRef.current = openInSidebar;

  const goHome = useCallback(() => {
    setPanelMode("home");
    setBrowseUrl("");
  }, []);

  useEffect(() => {
    (window as any).__IN_SIDEPANEL__ = true;
    chrome.runtime.sendMessage({ action: "getMobileUaState" }, (res) => {
      if (res?.enabled !== undefined) setMobileUa(res.enabled);
    });
    return () => {
      (window as any).__IN_SIDEPANEL__ = false;
    };
  }, []);

  // 侧边栏自身文档里的外部链接（书签等）→ 侧边栏打开；Ctrl/Cmd+点击可强制新开。
  useEffect(() => {
    return registerLinkInterception({
      takeoverEnabled: () => true,
      openInSidebar: (url) => openInSidebarRef.current(url),
      selfOrigin: window.location.origin,
    });
  }, []);

  // 主页各处（搜索/桌面/书签）通过导航通道请求打开 → 侧边栏。
  useEffect(() => {
    return onSidebarNavigate((url) => openInSidebarRef.current(url));
  }, []);

  // 后台在 iframe 内点击 target=_blank / window.open 后，把 URL 重定向回侧边栏。
  useEffect(() => {
    const handler = (request: { action?: string; url?: string }) => {
      if (request.action === "xbOpenInSidebar" && request.url) {
        openInSidebarRef.current(request.url);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const toggleMobileUa = useCallback(() => {
    const next = !mobileUa;
    setMobileUa(next);
    chrome.runtime.sendMessage({ action: "toggleMobileUa", enabled: next });
    // 移动端 UA 更替需重新加载 iframe。
    setBrowseSeq((s) => s + 1);
  }, [mobileUa]);

  return (
    <div className="flex flex-col h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card z-20">
        {panelMode === "browse" && (
          <button
            onClick={goHome}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="返回主页"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={toggleMobileUa}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            mobileUa
              ? "bg-primary text-primary-foreground"
              : "bg-accent text-accent-foreground hover:bg-accent/80"
          }`}
          title={mobileUa ? "移动端 UA（点击关闭）" : "移动端 UA（点击开启）"}
        >
          <Smartphone className="w-3.5 h-3.5" />
        </button>
        {panelMode === "home" && (
          <button
            onClick={() => setOpenMode(openMode === "sidebar" ? "main-window" : "sidebar")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
              openMode === "main-window"
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-accent-foreground hover:bg-accent/80"
            }`}
            title={openMode === "sidebar" ? "切换为主窗口打开" : "切换为侧边栏打开"}
          >
            {openMode === "sidebar" ? "侧边栏" : "主窗口"}
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 relative overflow-hidden">
        {panelMode === "home" ? (
          <SidePanelHome />
        ) : (
          <BrowserView key={browseSeq} initialUrl={browseUrl} />
        )}
      </div>
    </div>
  );
}
