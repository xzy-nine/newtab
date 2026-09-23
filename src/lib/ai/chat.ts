/**
 * 对话补全与自动命名。
 *
 * 用 Vercel AI SDK 的 `streamText` / `generateText` 取代原先手写的
 * fetch + SSE 解析 + 错误体解析：流式增量、`reasoning_content`、错误状态码
 * 都由 SDK 的 openai-compatible 适配器负责，这里只做业务编排。
 */

import { generateText, streamText } from "ai";
import type { LanguageModel } from "ai";
import type { AIProvider } from "@/lib/app-settings";
import { toChatError } from "./errors";
import { isReasoningModel } from "./models";
import { resolveModel, resolveReasoning, resolveTemperature } from "./providers";
import type { AIMessage, ChatStreamCallbacks } from "./types";

/** API 消息：只保留 role 与 content，去掉本地时间戳等字段。 */
export interface ApiMessage {
  role: AIMessage["role"];
  content: string;
}

/**
 * 把本地消息转换为发给接口的消息数组。
 *
 * 过滤 `system` 角色：系统提示词由 `streamChat` 的 `system` 参数单独传递，
 * 否则会与历史里的系统消息重复。
 */
export function toApiMessages(messages: AIMessage[]): ApiMessage[] {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
}

/** 一次流式对话的结果。 */
export interface ChatStreamResult {
  content: string;
  reasoning: string;
}

/**
 * 发起一次流式对话。
 *
 * @param model AI SDK 模型句柄（由 `resolveModel` 构造）。
 * @param provider 提供商配置；用于决定思考模式与采样温度。
 * @param messages 完整历史（含本轮用户消息）。
 * @param systemPrompt 系统提示词。
 * @param callbacks 增量回调。
 * @param signal 中止信号。
 */
export async function streamChat(params: {
  model: LanguageModel;
  provider: AIProvider;
  messages: AIMessage[];
  systemPrompt: string;
  callbacks?: ChatStreamCallbacks;
  signal?: AbortSignal;
}): Promise<ChatStreamResult> {
  const { model, provider, messages, systemPrompt, callbacks, signal } = params;
  const reasoning = resolveReasoning(provider);
  const temperature = resolveTemperature(provider);

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      messages: toApiMessages(messages),
      maxRetries: 0,
      ...(reasoning ? { reasoning } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(signal ? { abortSignal: signal } : {}),
    });

    let content = "";
    let reasoningText = "";

    // fullStream 的事件形状：正文是 `text-delta` / `.text`，
    // 思维链是 `reasoning-delta` / `.text`（SDK 内部把 delta 重命名成了 text）。
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        content += part.text;
        callbacks?.onContent?.(part.text);
      } else if (part.type === "reasoning-delta") {
        reasoningText += part.text;
        callbacks?.onReasoning?.(part.text);
      } else if (part.type === "error") {
        throw toChatError(part.error);
      }
    }

    return { content, reasoning: reasoningText };
  } catch (error) {
    throw toChatError(error);
  }
}

/** 系统提示词：让模型只输出一个短标题。 */
const TITLE_SYSTEM_PROMPT = [
  "请为以下对话生成一个简洁、准确的标题。标题应该：",
  "1. 不超过20个字符",
  "2. 准确概括对话的主要内容",
  "3. 使用中文（如果对话是中文）或英文（如果对话是英文）",
  "4. 不要包含引号或特殊符号",
  "5. 直接输出标题，不要其他解释",
  "",
  "对话内容：",
].join("\n");

/** 标题生成的最大输出 token 数。 */
const TITLE_MAX_TOKENS = 100;

/**
 * 用 AI 生成对话标题；失败时抛出异常，由调用方回退到截断首条消息。
 */
export async function generateTitle(
  context: string,
  provider: AIProvider,
  model?: LanguageModel,
): Promise<string> {
  const resolved = model ?? resolveModel(provider);
  try {
    const result = await generateText({
      model: resolved,
      system: TITLE_SYSTEM_PROMPT,
      prompt: context,
      maxOutputTokens: TITLE_MAX_TOKENS,
      temperature: 0.3,
      maxRetries: 0,
    });
    return result.text.trim();
  } catch (error) {
    throw new Error("标题生成失败: " + toChatError(error).message);
  }
}

/**
 * 判断本轮是否触发自动重命名。
 *
 * 旧实现用 n²-n+1（1、3、7、13、21…）这种稀疏递增的轮次，避免每一轮都
 * 调用一次标题接口。这里保持同样的序列以维持既有行为。
 */
export function isTitleTriggerRound(roundCount: number): boolean {
  const n = Math.round(Math.sqrt(roundCount));
  return n * n - n + 1 === roundCount;
}

/** 从消息列表里截取用于生成标题的上下文（最近 4 组问答，各截断 200 字）。 */
export function buildTitleContext(messages: AIMessage[]): string {
  const sliced = messages.slice(-8).filter((m) => m.role !== "system");
  const lines: string[] = [];
  for (let i = 0; i < sliced.length; i += 2) {
    const user = sliced[i];
    const assistant = sliced[i + 1];
    if (!user || !assistant) continue;
    lines.push(`用户: ${truncate(user.content, 200)}\nAI: ${truncate(assistant.content, 200)}`);
  }
  return lines.join("\n\n").trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.substring(0, max) + "..." : text;
}

/**
 * 挑选用于生成标题的提供商：优先非推理模型里较快的那个（省时间省钱）。
 */
export function pickTitleProvider(providers: AIProvider[]): AIProvider | null {
  const withKey = providers.filter((p) => p.apiKey.trim() !== "");
  if (withKey.length === 0) return null;
  const nonReasoning = withKey.filter((p) => !isReasoningModel(p.model, p));
  if (nonReasoning.length === 0) return withKey[0]!;
  const fast = nonReasoning.find((p) =>
    /gpt-3\.5|deepseek-chat|deepseek-v4-flash|claude-3-haiku|gemini.*flash/i.test(p.model),
  );
  return fast ?? nonReasoning[0]!;
}

/**
 * 兜底标题：截断首条用户消息。
 */
export function fallbackTitle(message: string): string {
  return message.length > 50 ? message.substring(0, 50) + "..." : message;
}
