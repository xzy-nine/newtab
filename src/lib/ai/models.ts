/**
 * 模型能力判定与模型列表拉取。
 *
 * 这一层是纯逻辑（`isReasoningModel*`）加一个轻量的 HTTP 查询（`listModels`），
 * 不含 React 状态，便于单测。
 */

import { z } from "zod";
import type { AIProvider } from "@/lib/app-settings";
import { isProviderReady, type ProviderCredentials } from "./providers";

/**
 * 仅依据模型名判断是否是推理模型（用于列表里的「推理」标记）。
 *
 * 覆盖常见命名：`reasoner` / `thinking` / `o1` / `o3` / `deepseek-v4` 等。
 */
export function isReasoningModelName(model: string): boolean {
  return /reason|think|o[13]|deepseek[-_]?(v4|reasoner)/i.test(model);
}

/**
 * 判断模型在"当前提供商配置"下是否真的会走推理（用于自动命名时挑一个快模型）。
 *
 * DeepSeek v4/reasoner 只有显式开启思考时才算推理模型；其余按名字判断。
 */
export function isReasoningModel(
  model: string,
  provider?: Pick<AIProvider, "thinkingMode">,
): boolean {
  if (/reason|think|o[13]/i.test(model)) return true;
  if (/deepseek[-_]?(v4|reasoner)/i.test(model)) return provider?.thinkingMode === "enabled";
  return false;
}

/** `/v1/models` 响应体：只关心 `data[].id`。 */
const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })).optional(),
});

/**
 * 拉取提供商的可用模型列表。
 *
 * 旧实现用 `new URL("/v1/models", new URL(apiUrl).origin)` 拼地址——只取
 * origin 会丢掉子路径厂商（如 Azure、自建网关）的路径前缀。这里改为保留
 * 去掉 `/chat/completions` 之后的 baseURL，再拼 `/v1/models`，兼容面更广。
 *
 * @returns 模型 id 列表；请求失败或响应格式不符时返回空数组（不抛出，
 *   因为模型列表只是辅助 UI，不应打断聊天）。
 */
export async function listModels(
  provider: ProviderCredentials,
  options?: { signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<string[]> {
  if (!isProviderReady(provider)) return [];
  const fetchImpl = options?.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(buildModelsUrl(provider.apiUrl), {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    if (!response.ok) return [];
    const parsed = modelListSchema.safeParse(await response.json());
    if (!parsed.success) return [];
    return (parsed.data.data ?? []).map((m) => m.id);
  } catch {
    // 主动取消（AbortError）与网络错误都归结为"拿不到列表"。
    return [];
  }
}

/**
 * 由 API 地址推导 `/v1/models` 地址。
 *
 * `https://api.deepseek.com`                 → `https://api.deepseek.com/v1/models`
 * `https://api.deepseek.com/v1`              → `https://api.deepseek.com/v1/models`
 * `https://api.openai.com/v1/chat/completions` → `https://api.openai.com/v1/models`
 */
export function buildModelsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (trimmed === "") return "";
  const base = trimmed.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
  if (/\/v\d+[a-z]*$/.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}
