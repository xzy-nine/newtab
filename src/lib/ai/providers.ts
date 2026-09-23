/**
 * 把「设置里的提供商配置」翻译成 Vercel AI SDK 的模型句柄。
 *
 * 关键点：官方 `@ai-sdk/openai-compatible` 会在传入的 baseURL 后面直接拼
 * `/chat/completions`。所以这里必须把用户填的地址收敛成一个"纯 baseURL"，
 * 否则用户粘了完整地址就会变成 `.../chat/completions/chat/completions`。
 */

import { createOpenAICompatible, type OpenAICompatibleProvider } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { AIProvider } from "@/lib/app-settings";

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";

/**
 * 把用户填写的 API 地址收敛成 SDK 需要的 baseURL。
 *
 * 与旧实现的三种输入逐一对齐（这是刻意的：地址拼接是最容易改坏的地方）：
 *
 * | 输入                                        | baseURL                  |
 * | ------------------------------------------- | ------------------------ |
 * | `https://api.openai.com/v1/chat/completions` | `https://api.openai.com/v1` |
 * | `https://api.openai.com/v1`                  | `https://api.openai.com/v1` |
 * | `https://api.deepseek.com`                   | `https://api.deepseek.com`   |
 * | `https://api.deepseek.com/v1`                | `https://api.deepseek.com`   |
 *
 * 注意 `/v1` 只在 DeepSeek 系接口上剥离：DeepSeek 的对话端点是
 * `https://api.deepseek.com/chat/completions`（`/v1` 只是别名），而 OpenAI
 * 系接口必须保留 `/v1`。
 */
export function resolveBaseUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (trimmed === "") return "";

  // 已经带了对话补全路径时，直接把前缀当作 baseURL，不再做任何版本段猜测。
  if (trimmed.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return trimmed.slice(0, -CHAT_COMPLETIONS_SUFFIX.length);
  }

  let base = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (isDeepSeekApiUrl(base)) {
    base = base.replace(/\/v1$/, "");
  }
  return base;
}

/** 仅依据地址判断是否 DeepSeek 系接口（用于 `/v1` 剥离）。 */
function isDeepSeekApiUrl(apiUrl: string): boolean {
  return /deepseek/i.test(apiUrl);
}

/**
 * 判断提供商是否是 DeepSeek 系接口。
 *
 * 用于两处兼容处理：请求体里的 `thinking` 字段，以及思考开关的语义。
 * 流式响应中 `reasoning_content` 的读取由 AI SDK 的 openai-compatible
 * 适配器自动完成，这里不需要额外解析。
 */
export function isDeepSeekProvider(provider: Pick<AIProvider, "apiUrl" | "name">): boolean {
  return /deepseek/i.test(provider.apiUrl) || /deepseek/i.test(provider.name);
}

/** 该提供商在本次请求中是否开启思考模式。 */
function isThinkingEnabled(provider: Pick<AIProvider, "thinkingMode">): boolean {
  return provider.thinkingMode === "enabled";
}

/**
 * 映射成 AI SDK 的 `reasoning` 取值。
 *
 * 只有 DeepSeek 系接口才返回档位：旧实现同样只在 `isDeepSeek` 分支里写
 * `reasoning_effort`，对其它提供商从不发送该字段。这一点很关键——把
 * `reasoning_effort` 发给不支持它的接口（例如 OpenAI 的非推理模型）会直接
 * 返回 400 Unsupported parameter。
 *
 * 关闭思考时返回 `undefined`，让 SDK 使用 `provider-default`，因而完全不往
 * 请求体里写 `reasoning_effort`。
 */
export function resolveReasoning(
  provider: Pick<AIProvider, "apiUrl" | "name" | "thinkingMode" | "reasoningEffort">,
): "high" | "xhigh" | undefined {
  if (!isDeepSeekProvider(provider)) return undefined;
  if (!isThinkingEnabled(provider)) return undefined;
  return provider.reasoningEffort === "max" ? "xhigh" : "high";
}

/**
 * 采样温度。
 *
 * 旧实现只在"非思考模式"下显式写 `temperature: 1.0`（思考模式下不传，交给
 * 厂商默认值），这里保持一致。
 */
export function resolveTemperature(provider: AIProvider): number | undefined {
  return isThinkingEnabled(provider) ? undefined : 1.0;
}

/**
 * DeepSeek 专用请求体改写。
 *
 * AI SDK 的 openai-compatible 适配器只认标准的 `reasoning_effort`，而 DeepSeek
 * 需要额外的 `thinking: { type: "enabled" | "disabled" }`；`reasoning_effort`
 * 由 SDK 依据 `reasoning` 参数写入。用 provider 的 `transformRequestBody`
 * 钩子注入，避免自己拼 fetch 与 SSE 解析。
 */
function deepSeekThinkingTransform(
  enabled: boolean,
): (body: Record<string, unknown>) => Record<string, unknown> {
  return (body) => ({ ...body, thinking: { type: enabled ? "enabled" : "disabled" } });
}

/**
 * 构造 AI SDK 提供商实例。
 *
 * @param provider 设置中的提供商配置。
 * @param options.fetch 可选的 fetch 实现；仅用于测试时注入假响应。
 */
export function createProvider(
  provider: AIProvider,
  options?: { fetch?: typeof fetch },
): OpenAICompatibleProvider {
  const deepSeek = isDeepSeekProvider(provider);
  return createOpenAICompatible({
    name: provider.name,
    baseURL: resolveBaseUrl(provider.apiUrl),
    apiKey: provider.apiKey,
    ...(options?.fetch ? { fetch: options.fetch } : {}),
    ...(deepSeek
      ? { transformRequestBody: deepSeekThinkingTransform(isThinkingEnabled(provider)) }
      : {}),
  });
}

/**
 * 取出一个可用于 `streamText` / `generateText` 的模型句柄。
 *
 * @param provider 提供商配置（需已填好 apiKey）。
 * @param modelId 可选的模型覆盖；不传时用配置里的 model。
 * @param options.fetch 可选的 fetch 实现；仅用于测试时注入假响应。
 */
export function resolveModel(
  provider: AIProvider,
  modelId?: string,
  options?: { fetch?: typeof fetch },
): LanguageModel {
  return createProvider(provider, options)(modelId || provider.model);
}

/** 发起请求所需的最小凭据集合。 */
export type ProviderCredentials = Pick<AIProvider, "apiUrl" | "apiKey">;

/** 提供商配置是否已具备发起请求的最低条件。 */
export function isProviderReady(
  provider: ProviderCredentials | undefined,
): provider is ProviderCredentials {
  return Boolean(provider && provider.apiUrl.trim() !== "" && provider.apiKey.trim() !== "");
}
