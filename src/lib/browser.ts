/**
 * 侧边栏浏览器的纯 URL 策略与嵌入性判定。
 *
 * 职责：把地址栏输入规范化为 http(s) URL，并对会因 X-Frame-Options /
 * CSP frame-ancestors 拒绝被嵌入的站点给出判定。保持零依赖，便于单元测试。
 *
 * 安全模型：这里只是地址栏这道"闸门"。真正的嵌入边界是 iframe 本身
 * （默认同会话普通 iframe；可选隔离沙箱）。本模块只放行 http/https，
 * 拒绝 loopback，以免被浏览页面借机探测本机服务。
 */

/** 一次导航被拒绝的原因。 */
export type BrowserBlockReason = "scheme" | "loopback";

/** 一次地址栏输入规范化的结果。 */
export type BrowserNavigateResult =
  | { kind: "ok"; url: string }
  | { kind: "blocked"; reason: BrowserBlockReason }
  | { kind: "invalid" };

/** 后台 browserProbe 的一次探测结果（后台 fetch 目标响应头后返回）。 */
export interface BrowserProbeResult {
  reachable: boolean;
  /** 重定向后的最终 URL；可达时存在。 */
  url?: string;
  status?: number;
  xFrameOptions?: string;
  /** CSP frame-ancestors 源列表；指令存在时存在。 */
  frameAncestors?: string[];
}

/** 一次探测的嵌入性判定。 */
export type Embeddability = "embeddable" | "blocked" | "unknown";

/**
 * 判定一个站点能否渲染进侧边栏 iframe。信号恰好就是浏览器在拒绝嵌入时
 * 强制的那两个：X-Frame-Options DENY/SAMEORIGIN，或 frame-ancestors
 * 指令不含 `*`（'self' 指站点自身 origin，绝不等于我们的 origin，所以
 * 也会拦下侧边栏）。探测不到（不可达）返回 'unknown'，保留普通 iframe。
 */
export function embeddabilityOf(probe: BrowserProbeResult): Embeddability {
  if (probe.reachable !== true) return "unknown";
  const xfo = probe.xFrameOptions?.trim().toUpperCase();
  if (xfo === "DENY" || xfo === "SAMEORIGIN") return "blocked";
  if (
    probe.frameAncestors !== undefined &&
    !probe.frameAncestors.some((source) => source === "*")
  ) {
    return "blocked";
  }
  return "embeddable";
}

/** loopback 主机名（localhost、IPv6 ::1、127.0.0.0/8、0.0.0.0）。 */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  // 移除 DNS 尾随点，防止 localhost. 绕过检测
  const normalizedHost = host.endsWith(".") ? host.slice(0, -1) : host;
  if (normalizedHost === "localhost" || normalizedHost === "::1" || normalizedHost === "0.0.0.0")
    return true;
  const parts = normalizedHost.split(".");
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/** 绝不允许进入 iframe 的协议（即便不带 `//`）。带端口的"主机名:端口"
 *  写法（example.com:8080）不在此列——下面会按主机解析。 */
const FORBIDDEN_SCHEMES = new Set([
  "javascript",
  "data",
  "file",
  "about",
  "vbscript",
  "blob",
  "mailto",
  "tel",
  "ftp",
  "ftps",
  "ws",
  "wss",
  "sftp",
  "ssh",
  "chrome",
  "chrome-extension",
  "moz-extension",
  "edge",
  "opera",
  "resource",
  "view-source",
]);

/**
 * 规范化一条地址栏输入。
 * @param input 原始用户输入。扩展侧边栏运行在 chrome-extension://<id> 上，
 * 而非 loopback，因此无需 DSH 那样的"自身 origin 例外"；loopback 一律拒绝。
 */
export function normalizeBrowserUrl(input: string): BrowserNavigateResult {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "invalid" };

  // 区分显式 scheme 与裸"主机:端口"。example.com:8080 会被朴素 scheme 正则
  // 误判（点号在 scheme 里合法），所以只在显式 http(s) 或已知禁止 scheme 时才
  // 当 scheme 处理；其余一律按主机补 https://。
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed);
  let withScheme: string;
  if (schemeMatch === null) {
    withScheme = `https://${trimmed}`;
  } else {
    const scheme = schemeMatch[1]!.toLowerCase();
    if (scheme === "http" || scheme === "https") {
      withScheme = trimmed;
    } else if (FORBIDDEN_SCHEMES.has(scheme)) {
      return { kind: "blocked", reason: "scheme" };
    } else {
      withScheme = `https://${trimmed}`;
    }
  }

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { kind: "invalid" };
  }

  // 协议兜底：仍解析出非 http(s) 的（如 ftp://、ws:// 带了 `//`）在此拒绝。
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "blocked", reason: "scheme" };
  }

  if (isLoopbackHostname(url.hostname)) return { kind: "blocked", reason: "loopback" };
  return { kind: "ok", url: url.href };
}

/**
 * 从 Content-Security-Policy 头提取 frame-ancestors 源列表，指令不存在
 * （或为空）时返回 undefined。该指令是唯一带源列表的指令，源以空格分隔
 * （'none'、'self'、* 或 origin）。
 */
export function extractFrameAncestors(csp: string | null): string[] | undefined {
  if (csp === null) return undefined;
  for (const directive of csp.split(";")) {
    const parts = directive.trim().split(/\s+/);
    if (parts[0] === "frame-ancestors") {
      const sources = parts.slice(1).filter((source) => source !== "");
      return sources.length === 0 ? undefined : sources;
    }
  }
  return undefined;
}
