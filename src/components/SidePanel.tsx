import { useState, useRef, useEffect, useCallback } from "react";
import {
  ExternalLink,
  ArrowRight,
  Home,
  Globe,
  ArrowLeft,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { SidePanelHome } from "@/components/SidePanelHome";

type OpenMode = "sidebar" | "main-window";
type PanelMode = "home" | "browse";

export function SidePanel() {
  const [url, setUrl] = useState("");
  const [openMode, setOpenMode] = useState<OpenMode>("sidebar");
  const [panelMode, setPanelMode] = useState<PanelMode>("home");
  const [browseUrl, setBrowseUrl] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [mobileUa, setMobileUa] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openModeRef = useRef(openMode);
  openModeRef.current = openMode;

  useEffect(() => {
    (window as any).__IN_SIDEPANEL__ = true;
    chrome.runtime.sendMessage({ action: "getMobileUaState" }, (res) => {
      if (res?.enabled !== undefined) setMobileUa(res.enabled);
    });
    return () => {
      (window as any).__IN_SIDEPANEL__ = false;
    };
  }, []);

  useEffect(() => {
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.currentUrl) {
        const targetUrl = changes.currentUrl.newValue as string;
        if (!targetUrl) return;
        if (openModeRef.current === "main-window") {
          chrome.tabs.create({ url: targetUrl });
        } else {
          setBrowseUrl(targetUrl);
          setPanelMode("browse");
        }
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  const normalizeUrl = useCallback((input: string) => {
    if (!input) return "";
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return input;
    }
    return `https://${input}`;
  }, []);

  const navigate = useCallback(() => {
    const target = normalizeUrl(url);
    if (!target) return;
    if (openMode === "main-window") {
      chrome.tabs.create({ url: target });
    } else {
      setBrowseUrl(target);
      setPanelMode("browse");
    }
  }, [url, openMode, normalizeUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") navigate();
    },
    [navigate],
  );

  const goHome = useCallback(() => {
    setPanelMode("home");
    setBrowseUrl("");
    setUrl("");
  }, []);

  const openCurrentInMain = useCallback(() => {
    if (browseUrl) {
      chrome.tabs.create({ url: browseUrl });
    }
  }, [browseUrl]);

  const refreshIframe = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const toggleMobileUa = useCallback(() => {
    const next = !mobileUa;
    setMobileUa(next);
    chrome.runtime.sendMessage({ action: "toggleMobileUa", enabled: next });
    if (panelMode === "browse") refreshIframe();
  }, [mobileUa, panelMode, refreshIframe]);

  const toggleShowInput = useCallback(() => {
    setShowInput((v) => !v);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

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
        <button
          onClick={toggleShowInput}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="输入网址"
        >
          <Globe className="w-4 h-4" />
        </button>
        {panelMode === "browse" && (
          <button
            onClick={goHome}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="新标签页"
          >
            <Home className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1" />
        {panelMode === "browse" && (
          <button
            onClick={refreshIframe}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="刷新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        {panelMode === "browse" && (
          <button
            onClick={openCurrentInMain}
            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="在主窗口中打开当前页"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
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
            <ArrowRight className="w-3 h-3" />
            <span>{openMode === "sidebar" ? "侧边栏" : "主窗口"}</span>
          </button>
        )}
      </div>

      {/* URL 输入栏（可折叠） */}
      {showInput && (
        <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border bg-card/80 z-20">
          <input
            ref={inputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入网址…"
            className="flex-1 bg-transparent border border-input rounded-md px-2 py-1 text-sm outline-none focus:border-ring transition-colors"
          />
          <button
            onClick={navigate}
            className="flex items-center justify-center px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
          >
            前往
          </button>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 relative overflow-hidden">
        {panelMode === "home" ? (
          <SidePanelHome />
        ) : (
          <iframe
            key={refreshKey}
            ref={iframeRef}
            src={browseUrl}
            className="absolute inset-0 w-full h-full border-0"
            allow="camera; microphone; geolocation; fullscreen; autoplay; clipboard-read; clipboard-write"
          />
        )}
      </div>
    </div>
  );
}
