/**
 * 把 AI 调用抛出的异常翻译成可以直接展示给用户的中文文案。
 *
 * 依赖 `ai` 包导出的 `APICallError`：OpenAI 兼容提供商在 HTTP 非 2xx 时抛出的
 * 正是它，`statusCode` / `responseBody` 字段就是厂商原始响应，因此不再需要
 * 自己拼 fetch、自己判断 `response.ok`、自己解析错误体。
 */

import { APICallError } from "ai";
import { z } from "zod";

/** 厂商错误响应体的常见两种形态：`{ error: { message } }` 与 `{ message }`。 */
const apiErrorBodySchema = z.object({
  error: z.object({ message: z.string() }).partial().optional(),
  message: z.string().optional(),
});

/** 从错误响应体中提取厂商给出的可读信息，取不到时返回空串。 */
function extractProviderMessage(responseBody: string | undefined): string {
  if (!responseBody) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    return "";
  }
  const result = apiErrorBodySchema.safeParse(parsed);
  if (!result.success) return "";
  return result.data.error?.message || result.data.message || "";
}

/** HTTP 状态码对应的中文说明。写成数据表，避免一大串 switch。 */
const STATUS_HINTS: Record<number, string> = {
  400: "请求格式错误。请检查请求参数格式。",
  401: "API密钥认证失败。请检查您的API密钥是否正确。",
  402: "账户余额不足。请确认账户余额并进行充值。",
  404: "API地址未找到。请检查API地址配置是否正确。",
  422: "请求参数错误。请检查请求参数。",
  429: "请求速率达到上限。请稍后再试，或考虑升级您的API计划。",
  500: "服务器内部故障。请稍后重试，如问题持续请联系API服务商。",
  503: "服务器繁忙。服务器负载过高，请稍后重试。",
};

/**
 * 生成用户可读的错误描述。
 *
 * - 带 `statusCode` 的 `APICallError`：套用状态码文案，并附上厂商原始信息。
 * - 不带 `statusCode` 的 `APICallError`：属于网络层失败（SDK 的
 *   `Cannot connect to API: ...`），直接使用其 message，避免出现
 *   `API请求失败 (undefined)` 这种没有信息量的文案。
 * - 其它异常：原样返回 message。
 */
export function describeApiError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    if (status === undefined) return error.message;

    const providerMessage = extractProviderMessage(error.responseBody);
    const hint = STATUS_HINTS[status];
    if (!hint) {
      return `API请求失败 (${status})${providerMessage ? `：${providerMessage}` : `。HTTP状态码：${status}`}`;
    }
    // 400/422 是"参数本身有问题"，直接把厂商信息接在冒号后更易读；
    // 其余状态码是环境/配额问题，另起一行给出细节。
    const detail =
      status === 400 || status === 422
        ? providerMessage
          ? `：${providerMessage}`
          : ""
        : providerMessage
          ? `\n详细信息：${providerMessage}`
          : "";
    return hint + detail;
  }

  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * 把任意异常统一为 `Error`，便于向上层抛出与回调。
 *
 * 注意顺序：`APICallError` 本身也是 `Error`，必须先按 API 错误翻译成中文文案，
 * 否则用户看到的会是厂商原文（例如 "Invalid API key"）。
 */
export function toChatError(error: unknown): Error {
  if (APICallError.isInstance(error)) return new Error(describeApiError(error));
  if (error instanceof Error) return error;
  return new Error(describeApiError(error));
}
