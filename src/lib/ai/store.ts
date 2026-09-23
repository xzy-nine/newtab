/**
 * AI 对话的 Zustand store。
 *
 * 这一层只做状态编排：把设置、提供商解析、流式请求、持久化几个模块粘起来，
 * 具体的网络/存储/解析逻辑都在各自的模块里，便于单独测试。
 */

import { create } from "zustand";
import { useAppSettings } from "@/lib/app-settings-store";
import {
  buildTitleContext,
  fallbackTitle,
  generateTitle,
  isTitleTriggerRound,
  pickTitleProvider,
  streamChat,
} from "./chat";
import { toChatError } from "./errors";
import {
  createConversationId,
  loadConversations,
  pruneConversations,
  saveConversations,
} from "./persistence";
import { isProviderReady, resolveModel } from "./providers";
import type { AIMessage, Conversation, SendMessageOptions } from "./types";

/** 新建对话的默认标题。 */
const NEW_CONVERSATION_TITLE = "新对话";

interface AIStore {
  conversations: Conversation[];
  currentConversationId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  streamingConversationId: string | null;
  hydrateConversations: () => Promise<void>;
  createConversation: () => Conversation;
  switchConversation: (id: string | null) => void;
  deleteConversation: (id: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  /** 中止正在进行的生成。 */
  stopStreaming: () => void;
  sendMessage: (
    message: string,
    options?: SendMessageOptions,
  ) => Promise<{ conversationId: string }>;
}

/** 当前进行中的请求控制器，用于"停止生成"。 */
let activeAbort: AbortController | null = null;

/** 构造一个空对话。 */
function newConversation(): Conversation {
  const now = Date.now();
  return {
    id: createConversationId(),
    title: NEW_CONVERSATION_TITLE,
    messages: [],
    createdAt: now,
    lastUpdated: now,
  };
}

/** 把一次对话写回 store 与存储。 */
async function commitConversation(
  set: (partial: Partial<AIStore>) => void,
  get: () => AIStore,
  conversation: Conversation,
): Promise<void> {
  const next = pruneConversations(
    get().conversations.map((c) => (c.id === conversation.id ? conversation : c)),
  );
  set({
    conversations: next,
    currentConversationId: conversation.id,
    isStreaming: false,
    streamingContent: "",
    streamingReasoning: "",
    streamingConversationId: null,
  });
  await saveConversations(next);
}

export const useAIStore = create<AIStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  isStreaming: false,
  streamingContent: "",
  streamingReasoning: "",
  streamingConversationId: null,

  hydrateConversations: async () => {
    const stored = await loadConversations();
    if (stored.length > 0) set({ conversations: stored });
  },

  createConversation: () => {
    const conv = newConversation();
    set((s) => ({ conversations: [conv, ...s.conversations], currentConversationId: conv.id }));
    return conv;
  },

  switchConversation: (id) => {
    set({ currentConversationId: id });
  },

  deleteConversation: async (id) => {
    const { conversations, currentConversationId } = get();
    const updated = conversations.filter((c) => c.id !== id);
    set({
      conversations: updated,
      currentConversationId: currentConversationId === id ? null : currentConversationId,
    });
    await saveConversations(updated);
  },

  clearAllConversations: async () => {
    set({ conversations: [], currentConversationId: null });
    await saveConversations([]);
  },

  stopStreaming: () => {
    // 只负责中止；收尾（保留已生成的部分内容）由 sendMessage 的 catch 统一处理。
    activeAbort?.abort();
  },

  sendMessage: async (message, options) => {
    const settings = useAppSettings.getState();

    if (!settings.aiEnabled) throw new Error("AI功能未启用");

    const provider = settings.aiProviders[settings.aiCurrentProviderIndex];
    if (!isProviderReady(provider)) {
      throw new Error("AI配置不完整，请检查API地址和密钥");
    }

    const { conversations, currentConversationId } = get();
    const existing = conversations.find((c) => c.id === currentConversationId);
    const isNew = !existing;
    const conversation = existing ?? newConversation();

    const userMessage: AIMessage = { role: "user", content: message, timestamp: Date.now() };
    const updatedMessages = [...conversation.messages, userMessage];

    if (isNew) set((s) => ({ conversations: [conversation, ...s.conversations] }));
    set({
      currentConversationId: conversation.id,
      isStreaming: true,
      streamingContent: "",
      streamingReasoning: "",
      streamingConversationId: conversation.id,
    });

    const abort = new AbortController();
    activeAbort = abort;

    try {
      const result = await streamChat({
        model: resolveModel(provider, options?.model),
        provider,
        messages: updatedMessages,
        systemPrompt: settings.aiSystemPrompt,
        signal: abort.signal,
        callbacks: {
          onContent: (chunk) => {
            options?.onContent?.(chunk);
            set((s) => ({ streamingContent: s.streamingContent + chunk }));
          },
          onReasoning: (chunk) => {
            options?.onReasoning?.(chunk);
            set((s) => ({ streamingReasoning: s.streamingReasoning + chunk }));
          },
        },
      });

      const assistantMessage: AIMessage = {
        role: "assistant",
        content: result.content,
        timestamp: Date.now(),
        ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
      };
      const finalMessages = [...updatedMessages, assistantMessage];

      const title = await resolveConversationTitle({
        conversation,
        finalMessages,
        firstMessage: message,
        settings,
      });

      activeAbort = null;
      await commitConversation(set, get, {
        ...conversation,
        messages: finalMessages,
        title,
        lastUpdated: Date.now(),
      });
      options?.onDone?.();

      return { conversationId: conversation.id };
    } catch (error) {
      activeAbort = null;
      const { streamingContent, streamingReasoning } = get();

      // 用户主动停止：不当作错误，保留已经生成的部分内容。
      if (abort.signal.aborted) {
        const partialMessages = streamingContent
          ? [
              ...updatedMessages,
              {
                role: "assistant" as const,
                content: streamingContent,
                timestamp: Date.now(),
                ...(streamingReasoning ? { reasoning_content: streamingReasoning } : {}),
              },
            ]
          : updatedMessages;
        await commitConversation(set, get, {
          ...conversation,
          messages: partialMessages,
          lastUpdated: Date.now(),
        });
        return { conversationId: conversation.id };
      }

      set({
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingConversationId: null,
      });
      const normalized = toChatError(error);
      options?.onError?.(normalized);
      throw normalized;
    }
  },
}));

/**
 * 计算本轮结束后该用的对话标题。
 *
 * 保持既有策略：
 * - 第 1 轮必定尝试改名；之后仅在开启自动改名且命中触发轮次时尝试。
 * - 未配置系统提示词时不做 AI 改名（避免意外产生 API 调用与费用），直接截断首条消息。
 * - AI 改名失败或未选出可用提供商时，回退为截断首条消息。
 */
async function resolveConversationTitle(params: {
  conversation: Conversation;
  finalMessages: AIMessage[];
  firstMessage: string;
  settings: ReturnType<typeof useAppSettings.getState>;
}): Promise<string> {
  const { conversation, finalMessages, firstMessage, settings } = params;
  const roundCount = finalMessages.filter((m) => m.role === "user").length;

  if (roundCount !== 1 && !(settings.aiAutoRename && isTitleTriggerRound(roundCount))) {
    return conversation.title;
  }
  if (!settings.aiSystemPrompt) return fallbackTitle(firstMessage);

  const titleProvider = pickTitleProvider(settings.aiProviders);
  if (!titleProvider) return fallbackTitle(firstMessage);

  try {
    const generated = await generateTitle(buildTitleContext(finalMessages), titleProvider);
    return generated || fallbackTitle(firstMessage);
  } catch {
    return fallbackTitle(firstMessage);
  }
}
