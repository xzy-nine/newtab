import { create } from "zustand";
import { useAppSettings } from "@/lib/app-settings-store";
import type { AIProvider } from "@/lib/app-settings";

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  reasoning_content?: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: AIMessage[];
  createdAt: number;
  lastUpdated: number;
}

const STORAGE_KEY = "aiConversations";
const MAX_CONVERSATIONS = 100;

function generateId(): string {
  return "conv_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11);
}

function buildChatUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (trimmed.includes("/chat/completions")) return trimmed;
  if (trimmed.includes("/v1")) {
    return trimmed.endsWith("/") ? trimmed + "chat/completions" : trimmed + "/chat/completions";
  }
  const base = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  return base + "/v1/chat/completions";
}

function handleApiError(status: number, responseText: string): string {
  let errorData: { error?: { message?: string }; message?: string } | null = null;
  try {
    errorData = JSON.parse(responseText);
  } catch {}
  const apiMsg = errorData?.error?.message || errorData?.message || "";
  switch (status) {
    case 400:
      return "请求格式错误" + (apiMsg ? `：${apiMsg}` : "。请检查请求参数格式。");
    case 401:
      return (
        "API密钥认证失败。请检查您的API密钥是否正确。" + (apiMsg ? `\n详细信息：${apiMsg}` : "")
      );
    case 402:
      return "账户余额不足。请确认账户余额并进行充值。" + (apiMsg ? `\n详细信息：${apiMsg}` : "");
    case 404:
      return "API地址未找到。请检查API地址配置是否正确。" + (apiMsg ? `\n详细信息：${apiMsg}` : "");
    case 422:
      return "请求参数错误" + (apiMsg ? `：${apiMsg}` : "。请检查请求参数。");
    case 429:
      return (
        "请求速率达到上限。请稍后再试，或考虑升级您的API计划。" +
        (apiMsg ? `\n详细信息：${apiMsg}` : "")
      );
    case 500:
      return (
        "服务器内部故障。请稍后重试，如问题持续请联系API服务商。" +
        (apiMsg ? `\n详细信息：${apiMsg}` : "")
      );
    case 503:
      return "服务器繁忙。服务器负载过高，请稍后重试。" + (apiMsg ? `\n详细信息：${apiMsg}` : "");
    default:
      return `API请求失败 (${status})${apiMsg ? `：${apiMsg}` : `。HTTP状态码：${status}`}`;
  }
}

function isReasoningModel(model: string): boolean {
  return /reason|think|o[13]|deepseek[-_]?reasoner/i.test(model);
}

async function generateTitleWithAI(context: string, provider: AIProvider): Promise<string> {
  const chatUrl = buildChatUrl(provider.apiUrl);
  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        {
          role: "system",
          content:
            "请为以下对话生成一个简洁、准确的标题。标题应该：\n1. 不超过20个字符\n2. 准确概括对话的主要内容\n3. 使用中文（如果对话是中文）或英文（如果对话是英文）\n4. 不要包含引号或特殊符号\n5. 直接输出标题，不要其他解释\n\n对话内容：",
        },
        { role: "user", content: context },
      ],
      max_tokens: 100,
      temperature: 0.3,
      stream: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error("标题生成失败: " + text);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function buildTitleContext(messages: AIMessage[]): string {
  const maxMessages = 6;
  const sliced = messages.slice(0, maxMessages);
  let context = "";
  for (let i = 0; i < sliced.length; i += 2) {
    if (i + 1 < sliced.length) {
      const user =
        sliced[i].content.length > 200
          ? sliced[i].content.substring(0, 200) + "..."
          : sliced[i].content;
      const ai =
        sliced[i + 1].content.length > 200
          ? sliced[i + 1].content.substring(0, 200) + "..."
          : sliced[i + 1].content;
      context += `用户: ${user}\nAI: ${ai}\n\n`;
    }
  }
  return context.trim();
}

function getTitleProvider(providers: AIProvider[]): AIProvider | null {
  const nonReasoning = providers.filter((p) => p.apiKey && !isReasoningModel(p.model));
  if (nonReasoning.length === 0) return providers[0] || null;
  const fast = nonReasoning.find((p) =>
    /gpt-3\.5|deepseek-chat|claude-3-haiku|gemini.*flash/i.test(p.model),
  );
  return fast || nonReasoning[0];
}

interface AIStore {
  conversations: Conversation[];
  currentConversationId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  streamingConversationId: string | null;
  hydrateConversations: () => Promise<void>;
  createConversation: (firstMessage?: string) => Conversation;
  switchConversation: (id: string | null) => void;
  deleteConversation: (id: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  sendMessage: (
    message: string,
    callbacks?: {
      onContent?: (chunk: string) => void;
      onReasoning?: (chunk: string) => void;
      onDone?: () => void;
      onError?: (err: Error) => void;
    },
  ) => Promise<{ conversationId: string }>;
}

export const useAIStore = create<AIStore>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  isStreaming: false,
  streamingContent: "",
  streamingReasoning: "",
  streamingConversationId: null,

  hydrateConversations: async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY];
      if (Array.isArray(stored)) {
        set({ conversations: stored });
      }
    } catch (err) {
      console.error("加载对话历史失败:", err);
    }
  },

  createConversation: (_firstMessage?: string) => {
    const conv: Conversation = {
      id: generateId(),
      title: "新对话",
      messages: [],
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
    set((s) => ({ conversations: [conv, ...s.conversations], currentConversationId: conv.id }));
    return conv;
  },

  switchConversation: (id: string | null) => {
    set({ currentConversationId: id });
  },

  deleteConversation: async (id: string) => {
    const { conversations, currentConversationId } = get();
    const updated = conversations.filter((c) => c.id !== id);
    set({
      conversations: updated,
      currentConversationId: currentConversationId === id ? null : currentConversationId,
    });
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    } catch {}
  },

  clearAllConversations: async () => {
    set({ conversations: [], currentConversationId: null });
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: [] });
    } catch {}
  },

  sendMessage: async (message, callbacks) => {
    const { conversations, currentConversationId } = get();
    const settings = useAppSettings.getState();

    if (!settings.aiEnabled) {
      throw new Error("AI功能未启用");
    }

    const provider = settings.aiProviders[settings.aiCurrentProviderIndex];
    if (!provider || !provider.apiUrl || !provider.apiKey) {
      throw new Error("AI配置不完整，请检查API地址和密钥");
    }

    let conversation = conversations.find((c) => c.id === currentConversationId);
    let isNew = false;
    if (!conversation) {
      conversation = {
        id: generateId(),
        title: "新对话",
        messages: [],
        createdAt: Date.now(),
        lastUpdated: Date.now(),
      };
      isNew = true;
    }

    const userMsg: AIMessage = { role: "user", content: message, timestamp: Date.now() };
    const updatedMessages = [...conversation.messages, userMsg];

    const apiMessages = [
      { role: "system", content: settings.aiSystemPrompt },
      ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const chatUrl = buildChatUrl(provider.apiUrl);
    const isDeepSeekReasoner = provider.model === "deepseek-reasoner";
    const temperature = isDeepSeekReasoner ? undefined : 1.0;

    const requestBody = {
      model: provider.model,
      messages: apiMessages,
      max_tokens: isDeepSeekReasoner ? 32000 : 1000,
      stream: true,
      ...(temperature !== undefined ? { temperature } : {}),
    };

    set({
      isStreaming: true,
      streamingContent: "",
      streamingReasoning: "",
      streamingConversationId: conversation.id,
    });

    if (isNew) {
      set((s) => ({
        conversations: [conversation!, ...s.conversations],
        currentConversationId: conversation!.id,
      }));
    }

    let fullContent = "";
    let reasoning = "";

    try {
      const response = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(handleApiError(response.status, errorText));
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              callbacks?.onContent?.(delta.content);
            }

            if (delta?.reasoning_content) {
              reasoning += delta.reasoning_content;
              callbacks?.onReasoning?.(delta.reasoning_content);
            }
          } catch {}
        }
      }

      reader.releaseLock();

      const aiMsg: AIMessage = {
        role: "assistant",
        content: fullContent,
        timestamp: Date.now(),
        ...(reasoning ? { reasoning_content: reasoning } : {}),
      };

      const finalMessages = [...updatedMessages, aiMsg];
      const convId = conversation.id;

      let title = conversation.title;
      const roundCount = Math.floor(finalMessages.filter((m) => m.role === "user").length);

      if (roundCount === 1) {
        const titleCfg = settings;
        if (titleCfg.aiSystemPrompt) {
          try {
            const ctx = buildTitleContext(finalMessages.slice(0, 2));
            const titleProvider = getTitleProvider(settings.aiProviders);
            if (titleProvider) {
              const generated = await generateTitleWithAI(ctx, titleProvider);
              if (generated) title = generated;
            }
          } catch {
            title = message.length > 50 ? message.substring(0, 50) + "..." : message;
          }
        } else {
          title = message.length > 50 ? message.substring(0, 50) + "..." : message;
        }
      }

      const updatedConv: Conversation = {
        ...conversation,
        messages: finalMessages,
        title,
        lastUpdated: Date.now(),
      };

      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === convId ? updatedConv : c)),
        currentConversationId: convId,
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingConversationId: null,
      }));

      const allConvs = get().conversations;
      if (allConvs.length > MAX_CONVERSATIONS) {
        const sorted = [...allConvs]
          .sort((a, b) => b.lastUpdated - a.lastUpdated)
          .slice(0, MAX_CONVERSATIONS);
        set({ conversations: sorted });
      }

      try {
        await chrome.storage.local.set({ [STORAGE_KEY]: get().conversations });
      } catch {}

      callbacks?.onDone?.();

      return { conversationId: convId };
    } catch (err) {
      set({
        isStreaming: false,
        streamingContent: "",
        streamingReasoning: "",
        streamingConversationId: null,
      });
      callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  },
}));
