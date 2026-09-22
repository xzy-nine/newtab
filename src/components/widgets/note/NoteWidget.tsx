import { useState, useRef, useCallback, useEffect } from "react";
import { getMessage } from "@/lib/i18n";
import { marked } from "marked";

interface NoteWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

function htmlToPlainText(html: string): string {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const block = ["div", "p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote"];
  block.forEach((tag) => {
    tmp.querySelectorAll(tag).forEach((el) => {
      if (!(el as HTMLElement).dataset.appended) {
        el.appendChild(document.createTextNode("\n"));
        (el as HTMLElement).dataset.appended = "true";
      }
    });
  });
  let text = tmp.textContent || "";
  text = text.replace(/\r\n/g, "\n").replace(/\u00A0/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.replace(/\n+$/g, "");
}

function plainTextToHtml(text: string): string {
  const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\n/g, "<br>");
}

function adjustPreviewFont(el: HTMLElement | null) {
  if (!el) return;
  const min = 1,
    max = 18,
    step = 0.25;
  const computed = window.getComputedStyle(el);
  const base = parseFloat(computed.fontSize) || 14;
  let size = Math.min(Math.max(base, min), max);
  el.style.fontSize = `${size}px`;
  let iter = 0;
  const maxIter = Math.ceil((size - min) / step) + 2;
  while (el.scrollHeight > el.clientHeight && iter < maxIter) {
    size = Math.max(min, +(size - step).toFixed(2));
    el.style.fontSize = `${size}px`;
    iter++;
    if (iter > 1 && el.scrollHeight === el.clientHeight) break;
  }
}

function renderMarkdown(content: string): string {
  if (!content) return "";
  try {
    const html = marked.parse(content, { breaks: true, gfm: true });
    return typeof html === "string" ? html : (html as Promise<string> as unknown as string);
  } catch {
    return content.replace(/\n/g, "<br>");
  }
}

export function NoteWidget({
  data,
  onDataChange,
  containerWidth: _containerWidth,
  containerHeight: _containerHeight,
}: NoteWidgetProps) {
  const [content, setContent] = useState<string>((data?.content as string) ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  const prevContentRef = useRef(content);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const saveData = useCallback(
    (text: string) => {
      setContent(text);
      contentRef.current = text;
      if (onDataChange) onDataChange({ content: text });
    },
    [onDataChange],
  );

  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return;
    const text = htmlToPlainText(editorRef.current.innerHTML || "");
    contentRef.current = text;
    setContent(text);
    if (onDataChange) onDataChange({ content: text });
  }, [onDataChange]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("a, button, .note-editor")) return;
      if (!isEditing) {
        setIsEditing(true);
        requestAnimationFrame(() => {
          if (editorRef.current) {
            editorRef.current.innerHTML = plainTextToHtml(contentRef.current);
            editorRef.current.focus();
            const range = document.createRange();
            range.selectNodeContents(editorRef.current);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        });
      }
    },
    [isEditing],
  );

  const handleEditorBlur = useCallback(() => {
    const text = editorRef.current
      ? htmlToPlainText(editorRef.current.innerHTML || "")
      : contentRef.current;
    saveData(text);
    setIsEditing(false);
  }, [saveData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      editorRef.current?.blur();
    }
  }, []);

  useEffect(() => {
    if (previewRef.current && !isEditing) {
      adjustPreviewFont(previewRef.current);
    }
  }, [content, isEditing]);

  useEffect(() => {
    if (isEditing && editorRef.current) {
      prevContentRef.current = contentRef.current;
      editorRef.current.innerHTML = plainTextToHtml(contentRef.current);
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [isEditing]);

  const previewHtml = renderMarkdown(content);

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden cursor-pointer"
      style={{ justifyContent: "flex-start", alignItems: "flex-start", textAlign: "left" }}
      onClick={handleContainerClick}
    >
      {isEditing ? (
        <div
          ref={editorRef}
          className="note-editor flex-1 w-full p-3 overflow-y-auto outline-none"
          contentEditable
          suppressContentEditableWarning
          style={{
            fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
            fontSize: "14px",
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            wordWrap: "break-word",
            textAlign: "left",
          }}
          onInput={handleEditorInput}
          onBlur={handleEditorBlur}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <div
          ref={previewRef}
          className="note-preview flex-1 w-full p-3 overflow-y-auto"
          style={{
            fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
            fontSize: "14px",
            lineHeight: 1.4,
            textAlign: "left",
          }}
          dangerouslySetInnerHTML={
            previewHtml
              ? { __html: previewHtml }
              : {
                  __html: `<div class="text-white/40">${getMessage("widgetNoteEmpty", "无内容")}</div>`,
                }
          }
        />
      )}
    </div>
  );
}
