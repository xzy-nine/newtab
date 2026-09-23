/**
 * AI 助手主面板。
 *
 * 只负责把各子组件与 store / 设置组装起来；具体逻辑分别在
 * `src/lib/ai/*`（数据与请求）和 `src/components/ai/*`（展示）中。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, MessageSquare, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSettings } from "@/lib/app-settings-store";
import { parseQuickPrompts, useAIStore, type AIMessage, type QuickPrompt } from "@/lib/ai";
import { cn } from "@/lib/utils";
import { ChatComposer } from "./ChatComposer";
import { ConversationSidebar } from "./ConversationSidebar";
import { MessageBubble } from "./MessageBubble";
import { useModelCatalog } from "./useModelCatalog";

export interface AIChatPanelProps {
  initialMessage?: string;
  onClose: () => void;
}

/** 空对话时展示的引导提示词数量。 */
const GUIDE_PROMPT_LIMIT = 4;

/** 稳定的空数组：避免 `?? []` 每次渲染都产生新引用，破坏下游 memo 依赖。 */
const NO_MESSAGES: AIMessage[] = [];

export function AIChatPanel({ initialMessage, onClose }: AIChatPanelProps) {
  const {
    conversations,
    currentConversationId,
    isStreaming,
    streamingContent,
    streamingReasoning,
    streamingConversationId,
    createConversation,
    switchConversation,
    deleteConversation,
    clearAllConversations,
    hydrateConversations,
    stopStreaming,
    sendMessage,
  } = useAIStore();

  const {
    aiProviders,
    aiCurrentProviderIndex,
    setAiCurrentProviderIndex,
    setAiProviders,
    aiQuickPrompts,
  } = useAppSettings();

  const [inputValue, setInputValue] = useState(initialMessage ?? "");
  const [activePromptIndex, setActivePromptIndex] = useState<number | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  // 由 ChatComposer 注入的"聚焦输入框"函数。
  const composerFocusRef = useRef<(() => void) | null>(null);
  // 流式消息的时间戳：渲染期间不能调用 Date.now()（不纯），用 state 在
  // 开始流式输出时记录一次即可。
  const [streamStartedAt, setStreamStartedAt] = useState(0);

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = currentConversation?.messages ?? NO_MESSAGES;
  const quickPrompts = useMemo(() => parseQuickPrompts(aiQuickPrompts), [aiQuickPrompts]);

  const currentProvider = aiProviders[aiCurrentProviderIndex] ?? aiProviders[0];
  const {
    models,
    loading: modelsLoading,
    refresh: refreshModels,
  } = useModelCatalog(currentProvider);

  // 保留提供商在全量数组中的真实索引：过滤掉没有 API Key 的项后，索引会错位。
  // 若当前选中的提供商恰好没有 Key，仍把它展示出来，避免下拉显示空白。
  const validProviders = useMemo(() => {
    const withKey = aiProviders
      .map((provider, index) => ({ provider, index }))
      .filter(({ provider }) => provider.apiKey.trim() !== "");
    const selected = aiProviders[aiCurrentProviderIndex];
    if (
      withKey.length > 0 &&
      selected &&
      !withKey.some((v) => v.index === aiCurrentProviderIndex)
    ) {
      return [...withKey, { provider: selected, index: aiCurrentProviderIndex }];
    }
    return withKey;
  }, [aiProviders, aiCurrentProviderIndex]);

  // 打开面板时加载历史对话（面板是懒加载的，打开即挂载，等价于旧的
  // "每次 open 时 hydrate"）。
  useEffect(() => {
    void hydrateConversations();
  }, [hydrateConversations]);

  // 新消息或流式增量到达时滚到底部。
  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, streamingReasoning]);

  // 发送与重新生成都会开启一轮流式输出，在此记录起始时间供占位气泡展示。
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue("");
    setActivePromptIndex(null);
    setError(null);
    setStreamStartedAt(Date.now());

    try {
      await sendMessage(text, {
        model: selectedModel || undefined,
        onError: (err) => setError(err.message || "发送消息失败"),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送消息失败");
    }
  }, [inputValue, isStreaming, selectedModel, sendMessage]);

  const handleRegenerate = useCallback(async () => {
    if (isStreaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setStreamStartedAt(Date.now());
    try {
      await sendMessage(lastUser.content, {
        model: selectedModel || undefined,
        onError: (err) => setError(err.message || "重新生成失败"),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "重新生成失败");
    }
  }, [messages, isStreaming, selectedModel, sendMessage]);

  const handleNewConversation = useCallback(() => {
    const conv = createConversation();
    switchConversation(conv.id);
    setSelectedModel("");
  }, [createConversation, switchConversation]);

  const handleQuickPrompt = (prompt: QuickPrompt, index: number) => {
    if (activePromptIndex === index) {
      setActivePromptIndex(null);
      setInputValue(inputValue === prompt.text ? "" : inputValue);
    } else {
      setActivePromptIndex(index);
      setInputValue(inputValue.trim() ? `${prompt.text}: ${inputValue}` : prompt.text);
    }
    // 选择提示词后把焦点交回输入框，便于直接补充内容后回车发送。
    composerFocusRef.current?.();
  };

  const toggleThinking = () => {
    if (!currentProvider) return;
    const updated = [...aiProviders];
    updated[aiCurrentProviderIndex] = {
      ...currentProvider,
      thinkingMode: currentProvider.thinkingMode === "enabled" ? "disabled" : "enabled",
    };
    setAiProviders(updated);
  };

  const latestAiMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );

  return (
    <div className="flex h-[80vh] max-h-[800px] bg-background rounded-xl overflow-hidden border">
      {showSidebar && (
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onSelect={switchConversation}
          onCreate={handleNewConversation}
          onDelete={deleteConversation}
          onClearAll={async () => {
            if (confirm("确定要清空所有对话历史吗？此操作不可撤销。")) {
              await clearAllConversations();
            }
          }}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="切换对话历史"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-semibold truncate max-w-[200px]">
              {currentConversation?.title || "AI助手"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {validProviders.length > 0 && (
              <Select
                value={String(aiCurrentProviderIndex)}
                onValueChange={(v) => setAiCurrentProviderIndex(Number(v))}
              >
                <SelectTrigger className="h-7 text-xs w-28 border-none bg-muted/50 hover:bg-muted">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {validProviders.map(({ provider, index }) => (
                    <SelectItem key={provider.name} value={String(index)} className="text-xs">
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages.length === 0 && !isStreaming ? (
            <EmptyState quickPrompts={quickPrompts} onPick={setInputValue} />
          ) : (
            <>
              {messages.map((msg, index) => (
                <MessageBubble
                  key={index}
                  message={msg}
                  isLatestAi={msg === latestAiMessage}
                  onRegenerate={msg === latestAiMessage ? handleRegenerate : undefined}
                  onNewChat={msg.role === "assistant" ? handleNewConversation : undefined}
                />
              ))}
              {isStreaming && streamingConversationId && (
                <MessageBubble
                  message={{
                    role: "assistant",
                    content: streamingContent,
                    timestamp: streamStartedAt,
                    ...(streamingReasoning ? { reasoning_content: streamingReasoning } : {}),
                  }}
                  streaming
                />
              )}
            </>
          )}
          {error && <ErrorNotice message={error} />}
          <div ref={scrollAnchorRef} />
        </div>

        <ChatComposer
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={stopStreaming}
          quickPrompts={quickPrompts}
          activePromptIndex={activePromptIndex}
          onQuickPrompt={handleQuickPrompt}
          thinkingEnabled={currentProvider?.thinkingMode === "enabled"}
          onToggleThinking={toggleThinking}
          currentModel={currentProvider?.model ?? ""}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          availableModels={models}
          onRefreshModels={refreshModels}
          modelsLoading={modelsLoading}
          focusRef={composerFocusRef}
        />
      </div>
    </div>
  );
}

/** 空对话时的引导区。 */
function EmptyState({
  quickPrompts,
  onPick,
}: {
  quickPrompts: QuickPrompt[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <Bot className="w-12 h-12 mb-3 opacity-30" />
      <p className="text-sm">有什么可以帮助你的？</p>
      {quickPrompts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
          {quickPrompts.slice(0, GUIDE_PROMPT_LIMIT).map((prompt, index) => (
            <button
              key={index}
              className={cn(
                "px-3 py-1.5 text-xs rounded-full border transition-colors",
                "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onPick(prompt.text)}
            >
              {prompt.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 发送失败提示。 */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex mb-4 justify-center">
      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-destructive/10 border border-destructive/30 text-destructive text-sm">
        <p className="text-xs font-medium mb-0.5">发送失败</p>
        <p className="text-xs opacity-80">{message}</p>
      </div>
    </div>
  );
}
