import { defineBackground } from "wxt/utils/define-background";

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";
const UA_RULE_ID = 102;

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
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: [101],
          addRules: [
            {
              id: 101,
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
                resourceTypes: ["sub_frame"],
              },
            },
          ],
        });
        const { mobileUaEnabled } = await chrome.storage.local.get("mobileUaEnabled");
        await updateMobileUaRule(mobileUaEnabled !== false);
        console.log("侧边栏iframe规则已设置");
      } catch (err) {
        console.error("设置侧边栏iframe规则失败:", err);
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
      },
    );

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
