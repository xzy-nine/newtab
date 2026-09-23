import { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useNotificationStore,
  type NotificationItem,
  type NotificationType,
} from "@/lib/notification";
import { getMessage } from "@/lib/i18n";

const TYPE_STYLES: Record<
  NotificationType,
  { container: string; icon: string; iconEl: React.ReactNode }
> = {
  info: {
    container: "border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/40",
    icon: "text-blue-500",
    iconEl: <Info className="w-5 h-5" />,
  },
  success: {
    container: "border-l-4 border-green-500 bg-green-50 dark:bg-green-950/40",
    icon: "text-green-500",
    iconEl: <CheckCircle2 className="w-5 h-5" />,
  },
  warning: {
    container: "border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/40",
    icon: "text-yellow-500",
    iconEl: <AlertTriangle className="w-5 h-5" />,
  },
  error: {
    container: "border-l-4 border-red-500 bg-red-50 dark:bg-red-950/40",
    icon: "text-red-500",
    iconEl: <AlertCircle className="w-5 h-5" />,
  },
  loading: {
    container: "border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/40",
    icon: "text-blue-500",
    iconEl: <Loader2 className="w-5 h-5 animate-spin" />,
  },
};

function NotificationToast({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (item.duration > 0) {
      timerRef.current = setTimeout(onClose, item.duration);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.duration, onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${item.title}\n${item.message}`.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [item.title, item.message]);

  const style = TYPE_STYLES[item.type];

  return (
    <div
      className={cn(
        "relative w-80 rounded-lg shadow-lg overflow-hidden transition-all duration-300 ease-out",
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0",
        style.container,
      )}
      role="alert"
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className={cn("shrink-0 mt-0.5", style.icon)}>{style.iconEl}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {item.title}
              </p>
              <button
                onClick={onClose}
                className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 break-words">
              {item.message}
            </p>

            {item.type === "loading" && item.progress !== undefined && (
              <div className="mt-2">
                <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300 ease-out",
                      item.progress >= 100 ? "bg-green-500" : "bg-blue-500",
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.progressMessage && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {item.progressMessage}
                  </p>
                )}
              </div>
            )}

            {item.buttons && item.buttons.length > 0 && (
              <div className="flex gap-2 mt-2">
                {item.buttons.map((btn, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      btn.callback?.();
                      onClose();
                    }}
                    className={cn(
                      "text-xs px-2.5 py-1 rounded transition-colors",
                      btn.className ??
                        "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200",
                    )}
                  >
                    {btn.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {item.type !== "loading" && (
            <button
              onClick={handleCopy}
              title={getMessage("copyToClipboard", "复制内容")}
              className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors mt-0.5"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-gray-400" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function NotificationCenter() {
  const notifications = useNotificationStore((s) => s.notifications);
  const remove = useNotificationStore((s) => s.remove);
  const visible = notifications.slice(0, 3);

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {visible.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <NotificationToast item={item} onClose={() => remove(item.id)} />
        </div>
      ))}
    </div>
  );
}
