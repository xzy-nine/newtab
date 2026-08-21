import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Globe,
  Shield,
  ShieldOff,
  AlertTriangle,
} from "lucide-react";
import { normalizeBrowserUrl, embeddabilityOf, type BrowserProbeResult } from "@/lib/browser";

/** 侧边栏浏览器对外暴露的指令式接口，供父组件在收到外部导航请求时调用。 */
export interface BrowserViewHandle {
  /** 在侧边栏 iframe 中打开 url（推送进地址栏历史）。 */
  navigate: (url: string) => void;
}

export interface BrowserViewProps {
  /** 初始打开地址。 */
  initialUrl: string;
}

/**
 * 默认（同会话）沙箱令牌：含 allow-same-origin，页面用自己的 origin 与
 * Cookie（共享浏览器会话）；但不含 allow-popups / allow-top-navigation，因此
 * 第三方页面里的 window.open / target=_blank 会被浏览器直接拦下，不再新开
 * 标签页，普通链接仍留在 iframe 内导航。这是"防第三方按钮跳出侧边栏"的关键。
 */
const IFRAME_SANDBOX_SAME_SESSION =
  "allow-same-origin allow-scripts allow-forms allow-downloads allow-modals";

/**
 * 隔离会话沙箱令牌（可选）：不含 allow-same-origin，页面运行在不透明 origin，
 * 拿不到站点 Cookie/登录态；同样不含 allow-popups，因此第三方页面的弹窗也会
 * 被拦下，与默认模式一致地"不新开标签页"。
 */
const IFRAME_SANDBOX_ISOLATED = "allow-scripts allow-forms allow-downloads allow-modals";

/** 安全的 origin 提取，失败返回空串。 */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/**
 * 侧边栏浏览器：地址栏 + iframe。默认用"同会话"沙箱（allow-same-origin，共享
 * 浏览器 Cookie/登录态）渲染，同时拦截第三方页面的弹窗跳转；工具栏提供"隔离
 * 沙箱"开关切到不透明 origin（不共享会话）。会探测目标站点是否拒绝被嵌入
 * （X-Frame-Options / CSP frame-ancestors），被拒时显示解释面板而非浏览器的
 * "拒绝连接"空白。
 */
export const BrowserView = forwardRef<BrowserViewHandle, BrowserViewProps>(function BrowserView(
  { initialUrl },
  ref,
) {
  const [url, setUrl] = useState<string | null>(initialUrl || null);
  const [input, setInput] = useState<string>(initialUrl || "");
  /** 地址栏提示（非法/被拒）。 */
  const [message, setMessage] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(initialUrl ? [initialUrl] : []);
  const [cursor, setCursor] = useState<number>(initialUrl ? 0 : -1);
  const [reloadKey, setReloadKey] = useState(0);
  /** 该站点拒绝被嵌入的 URL（显示解释面板）。 */
  const [embedBlocked, setEmbedBlocked] = useState<string | null>(null);
  /** 用户选择"仍要加载"。 */
  const [forceEmbed, setForceEmbed] = useState(false);
  /** 沙箱开关：默认关 = 同会话（共享 Cookie/登录态，且禁止第三方页弹窗）。 */
  const [sandbox, setSandbox] = useState(false);

  // 读取沙箱偏好（默认关 = 同会话）。
  useEffect(() => {
    chrome.storage.local.get("browserSandbox").then((r) => {
      setSandbox(r.browserSandbox === true);
    });
  }, []);

  const probe = useCallback((target: string) => {
    let cancelled = false;
    setEmbedBlocked(null);
    setForceEmbed(false);
    chrome.runtime
      .sendMessage({ action: "browserProbe", url: target })
      .then((probeResult: BrowserProbeResult | undefined) => {
        if (!cancelled && probeResult && embeddabilityOf(probeResult) === "blocked") {
          setEmbedBlocked(target);
        }
      })
      .catch(() => {
        /* 不可达：保留普通 iframe */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 每次 URL 导航都会重新探测嵌入性。
  useEffect(() => {
    if (url === null) return;
    return probe(url);
  }, [url, probe]);

  /** 把合法 URL 推入地址栏历史并加载。 */
  const goTo = useCallback(
    (next: string) => {
      const prevOrigin = url ? originOf(url) : "";
      const nextOrigin = originOf(next);
      setUrl(next);
      setInput(next);
      setMessage(null);
      setHistory((previous) => [...previous.slice(0, cursor + 1), next]);
      setCursor((previous) => previous + 1);
      setReloadKey((key) => key + 1);
      // 域名变了则清掉上一个站点的强制嵌入规则。
      if (prevOrigin && prevOrigin !== nextOrigin) {
        chrome.runtime
          .sendMessage({ action: "forceEmbedUrl", url, enabled: false })
          .catch(() => {});
      }
    },
    [cursor, url],
  );

  const navigateTo = useCallback(
    (raw: string) => {
      const result = normalizeBrowserUrl(raw);
      if (result.kind === "ok") {
        goTo(result.url);
        return;
      }
      setMessage(
        result.kind === "invalid"
          ? "无效的网址"
          : result.reason === "scheme"
            ? "已阻止：仅支持 http/https 链接"
            : "已阻止：不允许在侧边栏访问本机或内部地址",
      );
    },
    [goTo],
  );

  const goBack = useCallback(() => {
    if (cursor <= 0) return;
    const next = history[cursor - 1]!;
    setCursor(cursor - 1);
    setUrl(next);
    setInput(next);
    setReloadKey((key) => key + 1);
  }, [cursor, history]);

  const goForward = useCallback(() => {
    if (cursor >= history.length - 1) return;
    const next = history[cursor + 1]!;
    setCursor(cursor + 1);
    setUrl(next);
    setInput(next);
    setReloadKey((key) => key + 1);
  }, [cursor, history]);

  useImperativeHandle(
    ref,
    () => ({
      navigate: (next: string) => navigateTo(next),
    }),
    [navigateTo],
  );

  const toggleSandbox = useCallback(() => {
    setSandbox((prev) => {
      const next = !prev;
      chrome.storage.local.set({ browserSandbox: next });
      return next;
    });
    setReloadKey((key) => key + 1);
  }, []);

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const openEmbedInBrowser = useCallback(() => {
    if (embedBlocked) window.open(embedBlocked, "_blank", "noopener");
  }, [embedBlocked]);

  const loadAnyway = useCallback(() => {
    if (embedBlocked) {
      setForceEmbed(true);
      chrome.runtime
        .sendMessage({ action: "forceEmbedUrl", url: embedBlocked, enabled: true })
        .catch(() => {});
      setReloadKey((key) => key + 1);
    }
  }, [embedBlocked]);

  // 当前宿主名（用于嵌入被拒文案）。
  let host = "";
  if (embedBlocked) {
    try {
      host = new URL(embedBlocked).hostname;
    } catch {
      host = embedBlocked;
    }
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      {/* 地址栏 */}
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-border bg-card">
        <button
          type="button"
          onClick={goBack}
          disabled={cursor <= 0}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="后退"
          aria-label="后退"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={goForward}
          disabled={cursor >= history.length - 1}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="前进"
          aria-label="前进"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="刷新"
          aria-label="刷新"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex items-center flex-1 min-w-0">
          <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground ml-1" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") navigateTo(input);
            }}
            placeholder="输入网址，例如 example.com"
            spellCheck={false}
            className="flex-1 bg-transparent border border-input rounded-md px-2 py-1 ml-1.5 text-sm outline-none focus:border-ring transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => navigateTo(input)}
          className="flex items-center justify-center px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
          title="前往"
        >
          前往
        </button>
        <button
          type="button"
          onClick={() => {
            if (url) window.open(url, "_blank", "noopener");
          }}
          disabled={url === null}
          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
          title="在主窗口中打开当前页"
          aria-label="在主窗口中打开当前页"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={toggleSandbox}
          className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
            sandbox
              ? "bg-primary text-primary-foreground"
              : "bg-accent text-accent-foreground hover:bg-accent/80"
          }`}
          title={
            sandbox
              ? "隔离沙箱（不共享会话，点击切换为同会话）"
              : "同会话（禁弹窗，点击切换为隔离沙箱）"
          }
        >
          {sandbox ? <Shield className="w-3.5 h-3.5" /> : <ShieldOff className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 提示条 */}
      {message !== null && (
        <div className="px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-b border-border">
          {message}
        </div>
      )}

      {/* 内容区 */}
      <div className="flex-1 relative overflow-hidden">
        {url === null ? (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-sm">
            输入网址开始浏览
          </div>
        ) : embedBlocked !== null && !forceEmbed ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
            <div className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium">{host} 拒绝被嵌入</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-sm">
              该站点设置了 X-Frame-Options / CSP
              frame-ancestors，不允许在侧边栏内显示。你可以在浏览器中打开，或强制加载（可能失效）。
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openEmbedInBrowser}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
              >
                <ExternalLink className="w-3 h-3" />
                在浏览器打开
              </button>
              <button
                type="button"
                onClick={loadAnyway}
                className="px-3 py-1.5 rounded-md border border-border text-xs hover:bg-accent transition-colors"
              >
                仍要加载
              </button>
            </div>
          </div>
        ) : (
          <iframe
            key={`${reloadKey}:${sandbox ? "sb" : "ns"}`}
            src={url}
            sandbox={sandbox ? IFRAME_SANDBOX_ISOLATED : IFRAME_SANDBOX_SAME_SESSION}
            allow="camera; microphone; geolocation; fullscreen; autoplay; clipboard-read; clipboard-write"
            className="absolute inset-0 w-full h-full border-0"
          />
        )}
      </div>
    </div>
  );
});
