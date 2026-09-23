/**
 * 输入区（含思考模式开关、模型选择、快捷提示词）。
 */

import { useEffect, useRef } from "react";
import { Send, Sparkles, Square } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCategoryName, type QuickPrompt } from "@/lib/ai";
import { ModelPicker } from "./ModelPicker";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onStop: () => void;
  quickPrompts: QuickPrompt[];
  activePromptIndex: number | null;
  onQuickPrompt: (prompt: QuickPrompt, index: number) => void;
  thinkingEnabled: boolean;
  onToggleThinking: () => void;
  currentModel: string;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  availableModels: string[];
  onRefreshModels: () => void;
  modelsLoading?: boolean;
  /** 暴露聚焦输入框的能力，供父组件在选中提示词后调用。 */
  focusRef?: React.RefObject<(() => void) | null>;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  quickPrompts,
  activePromptIndex,
  onQuickPrompt,
  thinkingEnabled,
  onToggleThinking,
  currentModel,
  selectedModel,
  onSelectModel,
  availableModels,
  onRefreshModels,
  modelsLoading,
  focusRef,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 把聚焦能力交给父组件：选中快捷提示词后需要把光标放回输入框。
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => textareaRef.current?.focus();
    return () => {
      focusRef.current = null;
    };
  }, [focusRef]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="px-4 py-3 border-t border-border bg-card/50">
      {quickPrompts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {quickPrompts.map((prompt, index) => (
            <button
              key={index}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                activePromptIndex === index
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
              )}
              title={`温度: ${prompt.temperature} | ${getCategoryName(prompt.category)}`}
              onClick={() => onQuickPrompt(prompt, index)}
            >
              <span className="truncate max-w-[80px]">{prompt.text}</span>
              <span className="opacity-50">{prompt.temperature}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={onToggleThinking}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 text-[10px] rounded-md border transition-colors",
            thinkingEnabled
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
          )}
          title="思考模式"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {thinkingEnabled ? "思考" : "快速"}
        </button>

        <ModelPicker
          currentModel={currentModel}
          selectedModel={selectedModel}
          onSelectModel={onSelectModel}
          availableModels={availableModels}
          onRefresh={onRefreshModels}
          loading={modelsLoading}
        />

        <div className="flex-1 flex items-end gap-2 bg-background border border-input rounded-xl px-3 py-1.5 focus-within:border-ring transition-colors">
          <TextareaAutosize
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入您的问题..."
            minRows={1}
            maxRows={5}
            className="flex-1 bg-transparent outline-none text-sm resize-none placeholder:text-muted-foreground"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            className="w-8 h-8 rounded-full flex-shrink-0"
            disabled={!isStreaming && !value.trim()}
            onClick={isStreaming ? onStop : onSend}
            title={isStreaming ? "停止生成" : "发送"}
          >
            {isStreaming ? <Square className="w-4 h-4" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
