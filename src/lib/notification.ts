import { create } from "zustand";

export type NotificationType = "info" | "success" | "warning" | "error" | "loading";

export interface NotificationButton {
  text: string;
  className?: string;
  callback?: () => void;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  duration: number;
  buttons?: NotificationButton[];
  onClose?: () => void;
  createdAt: number;
  progress?: number;
  progressMessage?: string;
}

interface NotificationState {
  notifications: NotificationItem[];
}

interface NotificationActions {
  add: (item: Omit<NotificationItem, "id" | "createdAt">) => string;
  remove: (id: string) => void;
  updateProgress: (id: string, percent: number, message?: string) => void;
  clearAll: () => void;
}

let nextId = 1;
function genId() {
  return `notif-${nextId++}-${Date.now()}`;
}

export const useNotificationStore = create<NotificationState & NotificationActions>((set) => ({
  notifications: [],

  add: (item) => {
    const id = genId();
    const entry: NotificationItem = { id, createdAt: Date.now(), ...item };
    set((s) => ({ notifications: [...s.notifications, entry] }));
    return id;
  },

  remove: (id) => {
    set((s) => {
      const target = s.notifications.find((n) => n.id === id);
      if (target?.onClose) target.onClose();
      return { notifications: s.notifications.filter((n) => n.id !== id) };
    });
  },

  updateProgress: (id, percent, message) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id
          ? { ...n, progress: percent, progressMessage: message ?? n.progressMessage }
          : n,
      ),
    }));
  },

  clearAll: () => set({ notifications: [] }),
}));

export const DEFAULT_DURATIONS: Record<Exclude<NotificationType, "loading">, number> = {
  info: 3000,
  success: 2000,
  warning: 5000,
  error: 8000,
};

export function getDuration(type: NotificationType): number {
  if (type === "loading") return 0;
  const key = `notification-duration-${type}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) return Math.max(0, parseInt(stored, 10));
  } catch {}
  return DEFAULT_DURATIONS[type] ?? 3000;
}

export function setDuration(type: Exclude<NotificationType, "loading">, ms: number) {
  const key = `notification-duration-${type}`;
  try {
    localStorage.setItem(key, String(ms));
  } catch {}
}

async function sendToPopup(notification: {
  title: string;
  message: string;
  type: string;
  showInBadge?: boolean;
}) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        action: "addPopupNotification",
        notification: { showInBadge: true, ...notification },
      });
    }
  } catch {}
}

function isExtensionEnv(): boolean {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime?.sendMessage;
  } catch {
    return false;
  }
}

function isNewTabPage(): boolean {
  try {
    return (
      window.location.pathname.includes("newtab.html") ||
      window.location.protocol === "chrome-extension:"
    );
  } catch {
    return false;
  }
}

export function showNotification(options: {
  title?: string;
  message?: string;
  type?: NotificationType;
  duration?: number | null;
  buttons?: NotificationButton[];
  onClose?: () => void;
  sendToPopup?: boolean;
  forceLocal?: boolean;
  showInBadge?: boolean | null;
}) {
  const {
    title = "",
    message = "",
    type = "info",
    duration = null,
    buttons,
    onClose,
    sendToPopup: sendToPopupOpt = true,
    forceLocal = false,
    showInBadge = null,
  } = options;

  const shouldSendToPopup = sendToPopupOpt && !forceLocal && type !== "loading" && isExtensionEnv();
  const shouldShowInBadge = showInBadge !== null ? showInBadge : !isNewTabPage();

  if (shouldSendToPopup) {
    sendToPopup({ title, message, type, showInBadge: shouldShowInBadge });
  }

  const finalDuration = duration ?? getDuration(type);
  const id = useNotificationStore.getState().add({
    title,
    message,
    type,
    duration: finalDuration,
    buttons,
    onClose,
  });

  return {
    id,
    close: () => useNotificationStore.getState().remove(id),
  };
}
