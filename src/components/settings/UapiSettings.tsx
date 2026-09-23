import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getMessage } from "@/lib/i18n";
import { showNotification } from "@/lib/notification";
import { clearAllCaches } from "@/lib/cache-store";
import { UAPI_CONSOLE_URL, UAPI_ERROR_FALLBACKS, testUapiKey } from "@/lib/uapi";
import { useUapiSettings } from "@/lib/uapi-settings-store";

/** UAPI 接口文档地址。 */
const UAPI_DOCS_URL = "https://uapis.cn/docs/getting-started/fair-use-and-rate-limiting";

/** 把时间戳格式化成 `MM-DD HH:mm`（本地时区，仅用于展示冷却截止）。 */
function formatUntil(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 密钥校验结果的展示状态。 */
type CheckState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok" }
  | { status: "fail"; text: string };

/**
 * UAPI 设置页。
 *
 * 说明清楚三件事：密钥存在哪里（仅本机）、为什么需要它（游客额度受限时兜底）、
 * 以及当前调用策略处于哪种状态。
 *
 * 密钥用 `type="password"` 输入，且只在用户点击「保存」时写入存储，
 * 避免每次按键都落盘。
 */
export function UapiSettings() {
  const {
    apiKey,
    preferKey,
    anonymousBlockedUntil,
    anonymousBlockedReason,
    setApiKey,
    setPreferKey,
    clearAnonymousBlock,
  } = useUapiSettings();

  /**
   * 输入框草稿。`synced` 记录它对应的 store 值：store 是异步 hydrate 的，
   * 存储里的密钥可能在首帧之后才到位，此时需要把草稿同步过来。
   *
   * 用「渲染期调整状态」而不是 useEffect，避免多一次级联渲染，
   * 也符合 React 对派生状态的推荐做法（effect 里 setState 会被 lint 拦截）。
   */
  const [draft, setDraft] = useState(() => ({ synced: apiKey, text: apiKey }));
  const [check, setCheck] = useState<CheckState>({ status: "idle" });

  if (draft.synced !== apiKey) {
    setDraft({ synced: apiKey, text: apiKey });
  }
  const draftKey = draft.text;

  /** 冷却截止时间的显示基准；用 state + 定时器，避免渲染期调用 Date.now()。 */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hasKey = apiKey.trim() !== "";
  const blocked = anonymousBlockedUntil > now;

  const handleDraftChange = useCallback((text: string) => {
    setDraft((prev) => ({ ...prev, text }));
  }, []);

  const handleSave = useCallback(() => {
    const next = draftKey.trim();
    setApiKey(next);
    setCheck({ status: "idle" });
    showNotification({
      title: getMessage("uapiApiKeySaved", "密钥已保存"),
      message: next
        ? getMessage("uapiKeyLocalOnly", "密钥仅保存在本机，不会参与云同步。")
        : getMessage("uapiApiKeyCleared", "密钥已清除"),
      type: "success",
      duration: 2000,
      forceLocal: true,
    });
  }, [draftKey, setApiKey]);

  const handleClear = useCallback(() => {
    setDraft({ synced: "", text: "" });
    setApiKey("");
    setCheck({ status: "idle" });
    showNotification({
      title: getMessage("uapiApiKeyCleared", "密钥已清除"),
      message: "",
      type: "success",
      duration: 2000,
      forceLocal: true,
    });
  }, [setApiKey]);

  const handleTest = useCallback(async () => {
    const key = draftKey.trim();
    if (!key) return;
    setCheck({ status: "testing" });
    const result = await testUapiKey(key);
    if (result.ok) {
      setCheck({ status: "ok" });
      return;
    }
    const text = getMessage(
      `uapiError${result.info.kind === "auth" ? "Unauthorized" : "Unavailable"}`,
      UAPI_ERROR_FALLBACKS.uapiErrorUnavailable ?? "接口暂时不可用，请稍后再试",
    );
    setCheck({ status: "fail", text: `${text}（HTTP ${result.info.status}）` });
  }, [draftKey]);

  const handleClearCache = useCallback(() => {
    clearAllCaches();
    showNotification({
      title: getMessage("uapiCacheCleared", "接口缓存已清除"),
      message: "",
      type: "success",
      duration: 2000,
      forceLocal: true,
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-1">
          {getMessage("uapiSettingsTitle", "UAPI 接口")}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {getMessage(
            "uapiSettingsDesc",
            "本项目多处使用 uapis.cn 的免费接口。默认以游客身份调用（按 IP 计积分、有速率限制），触及限制后会自动改用你配置的密钥。",
          )}
        </p>
      </div>

      {/* 密钥 */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-1.5">
          <KeyRound className="w-4 h-4" />
          {getMessage("uapiApiKey", "API 密钥")}
        </h4>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <Input
            type="password"
            value={draftKey}
            onChange={(e) => handleDraftChange(e.target.value)}
            placeholder={getMessage("uapiApiKeyPlaceholder", "粘贴在 uapis.cn 控制台创建的密钥")}
          />
          <p className="text-xs text-muted-foreground">
            {getMessage("uapiKeyLocalOnly", "密钥仅保存在本机，不会参与云同步。")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handleSave}>
              {getMessage("save", "保存")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleTest()}
              disabled={!draftKey.trim() || check.status === "testing"}
            >
              {check.status === "testing"
                ? getMessage("uapiTestTesting", "测试中...")
                : getMessage("uapiTestKey", "测试密钥")}
            </Button>
            {draftKey && (
              <Button size="sm" variant="outline" onClick={handleClear}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {getMessage("delete", "删除")}
              </Button>
            )}
            <button
              type="button"
              onClick={() => window.open(UAPI_CONSOLE_URL, "_blank")}
              className="ml-auto flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
            >
              {getMessage("uapiCreateKey", "创建密钥")} <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          {check.status !== "idle" && check.status !== "testing" && (
            <div
              className={cn(
                "flex items-start gap-1.5 text-xs",
                check.status === "ok" ? "text-green-600 dark:text-green-400" : "text-red-500",
              )}
            >
              {check.status === "ok" ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{getMessage("uapiTestOk", "密钥可用")}</span>
                </>
              ) : (
                <>
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    {getMessage("uapiTestFailed", "密钥不可用")}: {check.text}
                  </span>
                </>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground/80">
            {getMessage("uapiTestCostHint", "测试会真实调用一次接口，消耗 1 积分。")}
          </p>
        </div>
      </div>

      {/* 调用策略 */}
      <div>
        <h4 className="text-sm font-medium mb-3">{getMessage("uapiStatusTitle", "调用状态")}</h4>
        <div className="rounded-lg border border-border bg-card p-4 divide-y divide-border">
          <div className="flex items-center justify-between gap-4 pb-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">
                {getMessage("uapiPreferKey", "始终使用密钥")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {getMessage(
                  "uapiPreferKeyDesc",
                  "开启后不再以游客身份调用，直接使用密钥（默认关闭：优先用免费游客额度）。",
                )}
              </p>
            </div>
            <Switch
              checked={preferKey}
              disabled={!hasKey}
              onCheckedChange={(v) => setPreferKey(v as boolean)}
            />
          </div>

          <div className="pt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  blocked ? "bg-amber-500" : hasKey && preferKey ? "bg-blue-500" : "bg-green-500",
                )}
              />
              <span className="text-muted-foreground">
                {blocked && hasKey
                  ? getMessage("uapiStatusBlocked", "游客调用受限，已临时切换到密钥")
                  : hasKey && preferKey
                    ? getMessage("uapiStatusKeyActive", "当前使用密钥调用")
                    : getMessage("uapiStatusAnonymous", "当前以游客身份调用（未触发限制）")}
              </span>
            </div>

            {blocked && (
              <>
                <p className="text-xs text-muted-foreground">
                  {getMessage("uapiBlockedUntil", "冷却至 {time}").replace(
                    "{time}",
                    formatUntil(anonymousBlockedUntil),
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {anonymousBlockedReason === "quota"
                    ? getMessage("uapiBlockedQuota", "原因：本月游客额度已用尽（下月重置）")
                    : getMessage("uapiBlockedRateLimit", "原因：触发速率限制")}
                </p>
                <Button size="sm" variant="outline" onClick={clearAnonymousBlock}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  {getMessage("uapiResetAnonymous", "重新尝试游客调用")}
                </Button>
              </>
            )}

            {!hasKey && (
              <p className="text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                {getMessage(
                  "uapiNoKeyWarning",
                  "尚未配置密钥：一旦游客额度受限，接口将不可用。建议前往控制台免费创建一个。",
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 缓存 */}
      <div>
        <h4 className="text-sm font-medium mb-3">{getMessage("uapiClearCache", "清除接口缓存")}</h4>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground leading-relaxed flex-1">
            {getMessage(
              "uapiClearCacheDesc",
              "清除天气、壁纸等接口的本地缓存，下次使用时重新获取。",
            )}
          </p>
          <Button size="sm" variant="outline" onClick={handleClearCache}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            {getMessage("uapiClearCache", "清除接口缓存")}
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.open(UAPI_DOCS_URL, "_blank")}
        className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 transition-colors"
      >
        {getMessage("uapiDocs", "查看接口文档")} <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  );
}
