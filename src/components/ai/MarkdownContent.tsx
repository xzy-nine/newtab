/**
 * Markdown 渲染。
 *
 * 用 `react-markdown` 取代 `marked` + `dangerouslySetInnerHTML`：不再把模型
 * 输出直接注入 DOM，避免 XSS；`remark-gfm` 补上表格/删除线/任务列表等 GFM 语法。
 */

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * 渲染 Markdown 内容。
 *
 * 外层加 `prose`：排版样式由 `@tailwindcss/typography` 提供，不再自己拼 CSS。
 */
export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownContentProps) {
  if (!content) return null;
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        "prose-p:my-1 prose-pre:my-2 prose-pre:bg-muted prose-pre:text-foreground",
        "prose-code:text-[0.85em] prose-code:before:content-none prose-code:after:content-none",
        "prose-table:text-xs",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
});
