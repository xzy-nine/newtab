import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSettings } from "@/lib/app-settings-store";
import { useAIStore, type AIMessage } from "@/lib/ai-store";
import { cn } from "@/lib/utils";
import { marked } from "marked";
import {
  Bot,
  Send,
  Plus,
  Trash2,
  RotateCcw,
  ChevronDown,
  Sparkles,
  X,
  MessageSquare,
  Square,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";

function RenderMarkdown({ content }: { content: string }) {
  if (!content) return null;
  try {
    const html = marked.parse(content, { async: false }) as string;
    return (
      <div
        className="prose prose-sm dark:prose-invert max-w-none break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return <span className="whitespace-pre-wrap break-words">{content}</span>;
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

interface MessageBubbleProps {
  message: AIMessage;
  isLatestAi: boolean;
  onRegenerate?: () => void;
  onNewChat?: () => void;
}

function MessageBubble({ message, isLatestAi, onRegenerate, onNewChat }: MessageBubbleProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  if (message.role === "system") return null;

  const isUser = message.role === "user";

  return (
    <div className={cn("flex mb-4", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-card text-card-foreground border border-border rounded-bl-sm",
        )}
      >
        {message.reasoning_content && (
          <div className="mb-2">
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showReasoning ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showReasoning ? "隐藏思维过程" : "查看思维过程"}
            </button>
            {showReasoning && (
              <div className="mt-2 p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground border-l-2 border-primary/30">
                <RenderMarkdown content={message.reasoning_content} />
              </div>
            )}
          </div>
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        ) : (
          <RenderMarkdown content={message.content} />
        )}
        <div
          className={cn(
            "flex items-center gap-2 mt-1.5",
            isUser ? "justify-start" : "justify-between",
          )}
        >
          <span
            className={cn(
              "text-[10px] opacity-60",
              isUser ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {formatTime(message.timestamp)}
          </span>
          {!isUser && (
            <div className="flex items-center gap-1">
              {isLatestAi && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  title="重新生成回答"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              {onNewChat && (
                <button
                  onClick={onNewChat}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  title="基于此消息另起新对话"
                >
                  <MessageSquare className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface QuickPrompt {
  text: string;
  temperature: number;
  category: string;
}

function normalizeQuickPrompts(prompts: (string | QuickPrompt)[]): QuickPrompt[] {
  return prompts.map((p) => {
    if (typeof p === "string") return { text: p, temperature: 1.0, category: "general" };
    return p;
  });
}

interface AIModalContentProps {
  initialMessage?: string;
  onClose: () => void;
}

function AIModalContent({ initialMessage, onClose }: AIModalContentProps) {
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
    sendMessage,
  } = useAIStore();

  const { aiProviders, aiCurrentProviderIndex, setAiCurrentProviderIndex, aiQuickPrompts } =
    useAppSettings();

  const [inputValue, setInputValue] = useState(initialMessage || "");
  const [activePromptId, setActivePromptId] = useState<number | null>(null);
  const [isModelPanelOpen, setIsModelPanelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedTemperature, setSelectedTemperature] = useState(1.0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelSearchRef = useRef<HTMLInputElement>(null);

  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = useMemo(() => currentConversation?.messages || [], [currentConversation]);
  const validProviders = aiProviders.filter((p) => p.apiKey && p.apiKey.trim() !== "");
  const currentProvider = aiProviders[aiCurrentProviderIndex] || aiProviders[0];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, streamingReasoning, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
    }
  }, [inputValue]);

  useEffect(() => {
    if (isModelPanelOpen) {
      modelSearchRef.current?.focus();
    }
  }, [isModelPanelOpen]);

  useEffect(() => {
    setSelectedModel(currentProvider?.model || "");
  }, [currentProvider]);

  const refreshModels = useCallback(async () => {
    if (!currentProvider?.apiUrl || !currentProvider?.apiKey) return;
    try {
      const baseUrl = new URL(currentProvider.apiUrl);
      const modelsUrl = new URL("/v1/models", baseUrl.origin);
      const res = await fetch(modelsUrl.toString(), {
        headers: { Authorization: `Bearer ${currentProvider.apiKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.data)) {
          setAvailableModels(data.data.map((m: { id: string }) => m.id));
        }
      }
    } catch {}
  }, [currentProvider]);

  useEffect(() => {
    refreshModels();
  }, [refreshModels]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue("");
    setActivePromptId(null);

    try {
      if (!currentConversationId) {
        createConversation(text);
      }

      await sendMessage(text, {
        onError: (err) => {
          console.error("发送消息失败:", err);
        },
      });
    } catch (err) {
      console.error("发送消息失败:", err);
    }
  }, [inputValue, isStreaming, currentConversationId, createConversation, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRegenerate = useCallback(async () => {
    if (!currentConversation || currentConversation.messages.length < 2 || isStreaming) return;
    const lastAiIndex = currentConversation.messages.length - 1;
    const lastAi = currentConversation.messages[lastAiIndex];
    if (lastAi.role !== "assistant") return;

    const lastUserMsg = [...currentConversation.messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    try {
      await sendMessage(lastUserMsg.content, {
        onError: (err) => console.error("重新生成失败:", err),
      });
    } catch (err) {
      console.error("重新生成失败:", err);
    }
  }, [currentConversation, isStreaming, sendMessage]);

  const handleNewChatFromMessage = useCallback(
    (_message: AIMessage) => {
      const conv = createConversation();
      switchConversation(conv.id);
    },
    [createConversation, switchConversation],
  );

  const quickPrompts = normalizeQuickPrompts(aiQuickPrompts);

  const handleQuickPrompt = (prompt: QuickPrompt, index: number) => {
    if (activePromptId === index) {
      setActivePromptId(null);
      setSelectedTemperature(1.0);
      if (
        inputValue === prompt.text ||
        (!inputValue.startsWith(prompt.text) && inputValue === "")
      ) {
        setInputValue(inputValue === prompt.text ? "" : inputValue);
      }
    } else {
      setActivePromptId(index);
      setSelectedTemperature(prompt.temperature);
      if (inputValue.trim()) {
        setInputValue(prompt.text + ": " + inputValue);
      } else {
        setInputValue(prompt.text);
      }
    }
    textareaRef.current?.focus();
  };

  const filteredModels = modelSearch
    ? availableModels.filter((m) => m.toLowerCase().includes(modelSearch.toLowerCase()))
    : availableModels;

  const getCategoryName = (cat: string) => {
    const names: Record<string, string> = {
      code: "代码",
      math: "数学",
      analysis: "分析",
      general: "通用",
      translation: "翻译",
      creative: "创意",
    };
    return names[cat] || cat;
  };

  return (
    <div className="flex h-[80vh] max-h-[800px] bg-background rounded-xl overflow-hidden border">
      {showSidebar && (
        <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="text-sm font-medium">对话历史</h3>
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={() => {
                const conv = createConversation();
                switchConversation(conv.id);
              }}
              title="新对话"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">暂无对话历史</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                    conv.id === currentConversationId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground",
                  )}
                  onClick={() => switchConversation(conv.id)}
                >
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 truncate">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    title="删除对话"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-destructive"
              onClick={async () => {
                if (confirm("确定要清空所有对话历史吗？此操作不可撤销。")) {
                  await clearAllConversations();
                }
              }}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              清空全部
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-muted-foreground hover:text-foreground transition-colors lg:hidden"
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
                  {validProviders.map((p, i) => (
                    <SelectItem key={p.name} value={String(i)} className="text-xs">
                      {p.name}
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
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollBehavior: "smooth" }}>
          {messages.length === 0 && !isStreaming ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">有什么可以帮助你的？</p>
              {quickPrompts.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
                  {quickPrompts.slice(0, 4).map((p, i) => (
                    <button
                      key={i}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded-full border transition-colors",
                        activePromptId === i
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
                      )}
                      onClick={() => {
                        setInputValue(p.text);
                        textareaRef.current?.focus();
                      }}
                    >
                      {p.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => {
                const aiMessages = messages.filter((m) => m.role === "assistant");
                const isLatestAi =
                  msg.role === "assistant" && msg === aiMessages[aiMessages.length - 1];
                return (
                  <MessageBubble
                    key={idx}
                    message={msg}
                    isLatestAi={isLatestAi}
                    onRegenerate={isLatestAi ? handleRegenerate : undefined}
                    onNewChat={() => handleNewChatFromMessage(msg)}
                  />
                );
              })}
              {isStreaming && streamingConversationId && (
                <div className="flex mb-4 justify-start">
                  <div className="max-w-[85%] rounded-2xl px-4 py-2.5 bg-card border border-border rounded-bl-sm">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Sparkles className="w-3 h-3" />
                      正在思考
                    </div>
                    {streamingReasoning && (
                      <div className="mb-2 p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground border-l-2 border-primary/30">
                        <RenderMarkdown content={streamingReasoning} />
                      </div>
                    )}
                    <div className="text-sm">
                      <RenderMarkdown content={streamingContent} />
                      <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-4 py-3 border-t border-border bg-card/50">
          {quickPrompts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickPrompts.map((p, i) => (
                <button
                  key={i}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                    activePromptId === i
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                  title={`温度: ${p.temperature} | ${getCategoryName(p.category)}`}
                  onClick={() => handleQuickPrompt(p, i)}
                >
                  <span className="truncate max-w-[80px]">{p.text}</span>
                  <span className="opacity-50">{p.temperature}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <div className="relative">
              <button
                onClick={() => setIsModelPanelOpen(!isModelPanelOpen)}
                className="flex items-center gap-1 px-2 py-1.5 text-[10px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="切换AI模型"
              >
                {selectedModel ? (
                  <>
                    <span className="truncate max-w-[60px]">{selectedModel}</span>
                    <ChevronDown className="w-2.5 h-2.5" />
                  </>
                ) : (
                  "选择模型"
                )}
              </button>
              {isModelPanelOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsModelPanelOpen(false)} />
                  <div className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-border">
                      <div className="flex items-center gap-1">
                        <input
                          ref={modelSearchRef}
                          type="text"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          placeholder="搜索或输入模型ID..."
                          className="flex-1 h-8 px-2 text-xs bg-transparent border border-input rounded-md outline-none focus:border-ring"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && modelSearch.trim()) {
                              setSelectedModel(modelSearch.trim());
                              setIsModelPanelOpen(false);
                              setModelSearch("");
                            }
                          }}
                        />
                        {modelSearch.trim() && (
                          <button
                            onClick={() => {
                              setSelectedModel(modelSearch.trim());
                              setIsModelPanelOpen(false);
                              setModelSearch("");
                            }}
                            className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
                          >
                            使用
                          </button>
                        )}
                        <button
                          onClick={() => {
                            refreshModels();
                          }}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="刷新模型列表"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                      {filteredModels.length > 0 ? (
                        filteredModels.map((m) => (
                          <button
                            key={m}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors flex items-center gap-2",
                              m === selectedModel && "bg-primary/10 text-primary",
                            )}
                            onClick={() => {
                              setSelectedModel(m);
                              setIsModelPanelOpen(false);
                            }}
                          >
                            <span className="flex-1 truncate">{m}</span>
                            {/reason|think|o3|deepseek-reasoner/i.test(m) && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                                推理
                              </span>
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {modelSearch ? "回车使用输入的模型" : "无可用模型"}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 flex items-end gap-2 bg-background border border-input rounded-xl px-3 py-1.5 focus-within:border-ring transition-colors">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入您的问题..."
                rows={1}
                className="flex-1 bg-transparent outline-none text-sm resize-none max-h-[120px] placeholder:text-muted-foreground"
                disabled={isStreaming}
              />
              <Button
                size="icon"
                className="w-8 h-8 rounded-full flex-shrink-0"
                disabled={!inputValue.trim() || isStreaming}
                onClick={handleSend}
                title="发送"
              >
                {isStreaming ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface AIAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMessage?: string;
}

export function AIAssistant({ open, onOpenChange, initialMessage }: AIAssistantProps) {
  const { hydrateConversations } = useAIStore();

  useEffect(() => {
    if (open) {
      hydrateConversations();
    }
  }, [open, hydrateConversations]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden rounded-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">AI助手</DialogTitle>
        <AIModalContent initialMessage={initialMessage} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
