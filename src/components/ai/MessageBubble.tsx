/**
 * 单条消息气泡。
 *
 * 纯展示组件：只负责样式与交互回调，不直接依赖 store。
 */

import { useState } from "react";
import { Eye, EyeOff, MessageSquare, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AIMessage } from "@/lib/ai";
import { MarkdownContent } from "./MarkdownContent";

/** 把时间戳格式化为 HH:mm。 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface MessageBubbleProps {
  message: AIMessage;
  /** 是否是最后一条 AI 消息（决定是否显示"重新生成"）。 */
  isLatestAi?: boolean;
  onRegenerate?: () => void;
  onNewChat?: () => void;
  /** 流式进行中时展示光标。 */
  streaming?: boolean;
}

export function MessageBubble({
  message,
  isLatestAi,
  onRegenerate,
  onNewChat,
  streaming,
}: MessageBubbleProps) {
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
              onClick={() => setShowReasoning((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showReasoning ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showReasoning ? "隐藏思维过程" : "查看思维过程"}
            </button>
            {showReasoning && (
              <div className="mt-2 p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground border-l-2 border-primary/30">
                <MarkdownContent content={message.reasoning_content} />
              </div>
            )}
          </div>
        )}

        {isUser ? (
          <span className="whitespace-pre-wrap break-words">{message.content}</span>
        ) : (
          <div className="text-sm">
            <MarkdownContent content={message.content} />
            {streaming && (
              <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse ml-0.5" />
            )}
          </div>
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
