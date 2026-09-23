/**
 * 模型选择面板。
 *
 * 用 `@reactuses/core` 的 `useClickOutside` 处理"点击面板外关闭"，替代原来
 * 手写的全屏透明遮罩 `<div className="fixed inset-0 z-40" />`（那层遮罩
 * 会挡住页面滚动并额外参与层级计算）。
 */

import { useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useClickOutside } from "@reactuses/core";
import { cn } from "@/lib/utils";
import { isReasoningModelName } from "@/lib/ai";

export interface ModelPickerProps {
  /** 当前生效的模型名（用于按钮文案）。 */
  currentModel: string;
  /** 用户手动选中的模型；为空表示跟随提供商配置。 */
  selectedModel: string;
  onSelectModel: (model: string) => void;
  availableModels: string[];
  onRefresh: () => void;
  loading?: boolean;
}

export function ModelPicker({
  currentModel,
  selectedModel,
  onSelectModel,
  availableModels,
  onRefresh,
  loading,
}: ModelPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const displayModel = selectedModel || currentModel;
  const filtered = search
    ? availableModels.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
    : availableModels;

  const commit = (model: string) => {
    onSelectModel(model);
    setIsOpen(false);
    setSearch("");
  };

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      // 展开后聚焦搜索框，键盘用户可以直接输入筛选。
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={toggle}
        className="flex items-center gap-1 px-2 py-1.5 text-[10px] rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="切换AI模型"
      >
        {displayModel ? (
          <>
            <span className="truncate max-w-[60px]">{displayModel}</span>
            <ChevronDown className="w-2.5 h-2.5" />
          </>
        ) : (
          "选择模型"
        )}
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="flex items-center gap-1">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索或输入模型ID..."
                className="flex-1 h-8 px-2 text-xs bg-transparent border border-input rounded-md outline-none focus:border-ring"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && search.trim()) commit(search.trim());
                }}
              />
              {search.trim() && (
                <button
                  onClick={() => commit(search.trim())}
                  className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
                >
                  使用
                </button>
              )}
              <button
                onClick={onRefresh}
                className="text-muted-foreground hover:text-foreground p-1"
                title="刷新模型列表"
              >
                <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length > 0 ? (
              filtered.map((model) => (
                <button
                  key={model}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs rounded hover:bg-muted transition-colors flex items-center gap-2",
                    model === selectedModel && "bg-primary/10 text-primary",
                  )}
                  onClick={() => commit(model)}
                >
                  <span className="flex-1 truncate">{model}</span>
                  {isReasoningModelName(model) && (
                    <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
                      推理
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                {search ? "回车使用输入的模型" : "无可用模型"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
