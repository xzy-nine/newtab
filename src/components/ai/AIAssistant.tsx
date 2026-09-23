/**
 * AI 助手弹窗容器（懒加载入口）。
 *
 * AI SDK 体积较大，而 AI 助手只在用户点击时才打开，因此这里用 `lazy` +
 * `Suspense` 把它切成独立 chunk：不打开 AI 助手时，新标签页首屏完全不需要
 * 下载这部分代码。`preloadAIChatPanel()` 供入口按钮在 hover/focus 时提前触发
 * 下载，兼顾"首屏体积"与"打开时基本已就绪"。
 */

import { Suspense, lazy } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const AIChatPanel = lazy(async () => {
  const mod = await import("./AIChatPanel");
  return { default: mod.AIChatPanel };
});

/** 预加载 AI 助手面板（幂等；供入口按钮的 hover/focus 调用）。 */
export function preloadAIChatPanel(): void {
  void import("./AIChatPanel");
}

export interface AIAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时预填到输入框的内容（如搜索框里输入的文本）。 */
  initialMessage?: string;
}

export function AIAssistant({ open, onOpenChange, initialMessage }: AIAssistantProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[95vw] p-0 gap-0 overflow-hidden rounded-xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        hideCloseButton
      >
        <DialogTitle className="sr-only">AI助手</DialogTitle>
        {open && (
          <Suspense fallback={<AILoadingPlaceholder />}>
            <AIChatPanel initialMessage={initialMessage} onClose={() => onOpenChange(false)} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** 加载中占位：尺寸与面板一致，避免弹窗出现跳动。 */
function AILoadingPlaceholder() {
  return (
    <div className="flex h-[80vh] max-h-[800px] items-center justify-center text-sm text-muted-foreground">
      正在加载 AI 助手...
    </div>
  );
}
