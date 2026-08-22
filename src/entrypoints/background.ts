import { defineBackground } from "wxt/utils/define-background";
import { isLoopbackHostname, extractFrameAncestors, type BrowserProbeResult } from "@/lib/browser";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const UA_RULE_ID = 102;
// 定向"强制嵌入"规则：仅当用户在嵌入被拒面板里点"仍要加载"时，才删除该
// 站点的 XFO/CSP（替代旧的全局规则 101，不再一刀切）。
const FORCE_EMBED_RULE_ID = 103;

async function updateMobileUaRule(enabled: boolean) {
  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [UA_RULE_ID],
        addRules: [
          {
            id: UA_RULE_ID,
            priority: 1,
            action: {
              type: "modifyHeaders",
              requestHeaders: [{ header: "User-Agent", operation: "set", value: MOBILE_UA }],
            },
            condition: {
              resourceTypes: ["sub_frame"],
            },
          },
        ],
      });
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [UA_RULE_ID],
        addRules: [],
      });
    }
    await chrome.storage.local.set({ mobileUaEnabled: enabled });
  } catch (err) {
    console.error("更新移动端UA规则失败:", err);
  }
}

export default defineBackground({
  main() {
    chrome.runtime.onInstalled.addListener(() => {
      console.log("新标签页扩展已安装或更新");
      setupExtensionPage();
    });

    chrome.runtime.onStartup.addListener(() => {
      console.log("浏览器启动，新标签页扩展正在初始化");
      setupExtensionPage();
    });

    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.error("设置侧边栏点击行为失败:", err);
    });

    setupSidepanelRules();

    async function setupSidepanelRules() {
      try {
        // 不再全局删除 sub_frame 的 XFO/CSP（旧规则 101）——改为在用户点
        // "仍要加载"时按需为单个站点定向删除（setForceEmbedRule）。
        // 这里只清掉可能残留的旧 101/103 规则，并设置移动端 UA 规则。
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [101, FORCE_EMBED_RULE_ID],
          addRules: [],
        });
        const { mobileUaEnabled } = await chrome.storage.local.get("mobileUaEnabled");
        await updateMobileUaRule(mobileUaEnabled !== false);
        console.log("侧边栏iframe规则已设置");
      } catch (err) {
        console.error("设置侧边栏iframe规则失败:", err);
      }
    }

    // 为指定站点添加/移除"定向强制嵌入"规则：删除该站点 sub_frame 响应的
    // XFO/CSP/x-content-type-options，允许其在侧边栏 iframe 中加载。
    async function setForceEmbedRule(url: string, enabled: boolean) {
      try {
        if (!enabled) {
          await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [FORCE_EMBED_RULE_ID],
            addRules: [],
          });
          return;
        }
        const host = new URL(url).hostname;
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [FORCE_EMBED_RULE_ID],
          addRules: [
            {
              id: FORCE_EMBED_RULE_ID,
              priority: 1,
              action: {
                type: "modifyHeaders",
                responseHeaders: [
                  { header: "x-frame-options", operation: "remove" },
                  { header: "content-security-policy", operation: "remove" },
                  { header: "x-content-type-options", operation: "remove" },
                ],
              },
              condition: {
                requestDomains: [host],
                resourceTypes: ["sub_frame"],
              },
            },
          ],
        });
      } catch (err) {
        console.error("设置强制嵌入规则失败:", err);
      }
    }

    // 后台读取目标 URL 的响应头，判断其是否允许被侧边栏 iframe 嵌入
    // （X-Frame-Options / CSP frame-ancestors）。移植自服务端 browser.probe。
    async function probeUrl(raw: string): Promise<BrowserProbeResult> {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return { reachable: false };
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { reachable: false };
      }
      if (isLoopbackHostname(parsed.hostname)) {
        return { reachable: false };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        let response = await fetch(parsed, {
          method: "HEAD",
          redirect: "follow",
          signal: controller.signal,
        });
        // 有的服务器对 HEAD 回 405/501；重试一次 GET（body 丢弃，只看头）。
        if (response.status === 405 || response.status === 501) {
          response = await fetch(parsed, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
          });
        }
        // 重定向后重新校验 URL，防止重定向到回环地址
        const finalUrl = new URL(response.url);
        if (isLoopbackHostname(finalUrl.hostname)) {
          return { reachable: false };
        }
        const csp = response.headers.get("content-security-policy");
        const frameAncestors = extractFrameAncestors(csp);
        const xFrameOptions = response.headers.get("x-frame-options");
        return {
          reachable: true,
          url: response.url,
          status: response.status,
          ...(xFrameOptions !== null ? { xFrameOptions } : {}),
          ...(frameAncestors !== undefined ? { frameAncestors } : {}),
        };
      } catch {
        // DNS / TLS / 连接 / 超时：无从判断，客户端保留普通 iframe。
        return { reachable: false };
      } finally {
        clearTimeout(timer);
      }
    }

    function setupExtensionPage() {
      const extensionPageUrl = chrome.runtime.getURL("newtab.html");
      console.log("可访问的扩展页面URL:", extensionPageUrl);
    }

    chrome.runtime.onMessage.addListener(
      (
        request: Record<string, unknown>,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: unknown) => void,
      ) => {
        if (request.action === "getNewTabContent") {
          fetch(chrome.runtime.getURL("newtab.html"))
            .then((response) => response.text())
            .then((content) => sendResponse({ content }))
            .catch((error) => sendResponse({ error: error.message }));
          return true;
        }

        if (request.action === "howToAccess") {
          sendResponse({ message: `请访问: ${chrome.runtime.getURL("newtab.html")}` });
          return true;
        }

        if (request.action === "getExtensionPageUrl") {
          sendResponse({ url: chrome.runtime.getURL("newtab.html") });
          return true;
        }

        if (request.action === "addPopupNotification") {
          addPopupNotification(
            request.notification as {
              type?: string;
              title?: string;
              message?: string;
              showInBadge?: boolean;
            },
          )
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
          return true;
        }

        if (request.action === "notificationsCleared") {
          chrome.action.setBadgeText({ text: "" });
          sendResponse({ success: true });
          return true;
        }

        if (request.action === "toggleMobileUa") {
          updateMobileUaRule(request.enabled as boolean)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;
        }

        if (request.action === "getMobileUaState") {
          chrome.storage.local
            .get("mobileUaEnabled")
            .then((r) => sendResponse({ enabled: r.mobileUaEnabled !== false }))
            .catch(() => sendResponse({ enabled: true }));
          return true;
        }

        if (request.action === "browserProbe") {
          probeUrl(String(request.url))
            .then(sendResponse)
            .catch(() => sendResponse({ reachable: false }));
          return true;
        }

        if (request.action === "forceEmbedUrl") {
          const url = String(request.url ?? "");
          const enabled = request.enabled !== false;
          if (!url) {
            sendResponse({ success: false });
            return true;
          }
          setForceEmbedRule(url, enabled)
            .then(() => sendResponse({ success: true }))
            .catch((err) => sendResponse({ success: false, error: err.message }));
          return true;
        }
      },
    );

    // 侧边栏 iframe 内点击 target="_blank" 链接或调用 window.open 时，会创建
    // 新的标签页（跳出侧边栏）。此处拦截：关闭新标签页，并通过 runtime 消息
    // 让侧边栏在 iframe 内打开该 URL（替代旧的 storage sidepanelNavUrl 轮询）。
    // 仅拦截子框架发起的导航（sourceFrameId !== 0）：顶层框架（如新标签页的
    // window.open）保持原样。
    chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
      const url = details.url;
      if (!url) return;
      if (details.sourceFrameId === 0) return;
      if (!/^https?:/i.test(url)) return;
      chrome.tabs.remove(details.tabId).catch(() => {});
      chrome.runtime.sendMessage({ action: "xbOpenInSidebar", url }).catch(() => {});
    });

    chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
      if (details.reason === "update") {
        addPopupNotification({
          type: "info",
          title: "扩展已更新",
          message: `扩展已更新到版本 ${chrome.runtime.getManifest().version}`,
          showInBadge: true,
        });
      }
      setupExtensionPage();
    });

    async function addPopupNotification(notification: {
      type?: string;
      title?: string;
      message?: string;
      showInBadge?: boolean;
    }) {
      try {
        const result = await chrome.storage.local.get(["popupNotifications"]);
        const notifications = (result.popupNotifications ?? []) as Array<{
          id: string;
          timestamp: number;
          read: boolean;
          type: string;
          showInBadge: boolean;
          title?: string;
          message?: string;
        }>;

        const newNotification = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          read: false,
          type: "info",
          showInBadge: notification.showInBadge !== false,
          ...notification,
        };

        notifications.unshift(newNotification);

        if (notifications.length > 90) {
          notifications.splice(90);
        }

        await chrome.storage.local.set({ popupNotifications: notifications });

        const unreadCount = notifications.filter(
          (n: { read: boolean; showInBadge: boolean }) => !n.read && n.showInBadge !== false,
        ).length;

        if (unreadCount > 0) {
          chrome.action.setBadgeText({
            text: unreadCount > 99 ? "99+" : unreadCount.toString(),
          });
          chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
        } else {
          chrome.action.setBadgeText({ text: "" });
        }
      } catch (error) {
        console.error("添加通知失败:", error);
      }
    }
  },
});
