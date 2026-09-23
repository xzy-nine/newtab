/**
 * 对话历史的持久化。
 *
 * 用 zod 校验从 `browser.storage.local` 读回的数据：旧实现只判断
 * `Array.isArray(stored)` 就整体采用，一旦存储被外部改坏（或写入过旧结构），
 * UI 会在渲染时才崩。这里改为"坏数据丢弃、好数据保留"。
 */

import { z } from "zod";
import type { Conversation } from "./types";

/** 对话历史的存储键。保持与旧版本一致，避免用户历史丢失。 */
export const CONVERSATIONS_STORAGE_KEY = "aiConversations";

/** 最多保留的对话数量。 */
export const MAX_CONVERSATIONS = 100;

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  timestamp: z.number(),
  reasoning_content: z.string().optional(),
});

const conversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(messageSchema),
  createdAt: z.number(),
  lastUpdated: z.number(),
});

/** 从任意未知值中解析出合法的对话列表；无法解析的条目直接丢弃。 */
export function parseConversations(value: unknown): Conversation[] {
  if (!Array.isArray(value)) return [];
  const parsed: Conversation[] = [];
  for (const item of value) {
    const result = conversationSchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

/** 按最近更新时间保留最新的若干条对话。 */
export function pruneConversations(
  conversations: Conversation[],
  max = MAX_CONVERSATIONS,
): Conversation[] {
  if (conversations.length <= max) return conversations;
  return [...conversations].sort((a, b) => b.lastUpdated - a.lastUpdated).slice(0, max);
}

/** 读取对话历史。存储不可用或数据损坏时返回空数组。 */
export async function loadConversations(): Promise<Conversation[]> {
  try {
    const result = await browser.storage.local.get(CONVERSATIONS_STORAGE_KEY);
    return pruneConversations(parseConversations(result[CONVERSATIONS_STORAGE_KEY]));
  } catch {
    return [];
  }
}

/** 写入对话历史。失败时静默返回：对话仍保留在内存中。 */
export async function saveConversations(conversations: Conversation[]): Promise<void> {
  try {
    await browser.storage.local.set({ [CONVERSATIONS_STORAGE_KEY]: conversations });
  } catch {
    // 持久化失败不影响当前会话继续使用。
  }
}

/**
 * 生成对话 id。
 *
 * 优先用 `crypto.randomUUID()`（扩展页面为安全上下文，可直接使用），
 * 不可用时回退到时间戳 + 随机串。
 */
export function createConversationId(): string {
  try {
    return `conv_${crypto.randomUUID()}`;
  } catch {
    return "conv_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
  }
}
