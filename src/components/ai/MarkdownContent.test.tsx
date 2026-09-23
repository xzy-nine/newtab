/**
 * Markdown 渲染测试。
 *
 * 这一层从 `marked` + `dangerouslySetInnerHTML` 换成了 `react-markdown`，
 * 渲染结果与安全性都属于用户可见行为，因此单独钉住。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("returns nothing for empty content", () => {
    const { container } = render(<MarkdownContent content="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders plain text", () => {
    render(<MarkdownContent content="你好" />);
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("renders headings", () => {
    render(<MarkdownContent content={"# 标题"} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("标题");
  });

  it("renders emphasis and inline code", () => {
    render(<MarkdownContent content={"**粗** 和 `code`"} />);
    expect(screen.getByText("粗").tagName).toBe("STRONG");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });

  it("renders GFM tables (provided by remark-gfm)", () => {
    const table = ["| a | b |", "| - | - |", "| 1 | 2 |"].join("\n");
    render(<MarkdownContent content={table} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "a" })).toBeInTheDocument();
  });

  it("renders fenced code blocks", () => {
    render(<MarkdownContent content={"```js\nconst a = 1\n```"} />);
    expect(screen.getByText(/const a = 1/)).toBeInTheDocument();
  });

  it("does not execute or inject raw HTML from model output", () => {
    // 模型输出不可信：旧实现走 dangerouslySetInnerHTML，会执行注入的 HTML。
    const { container } = render(
      <MarkdownContent content={'<img src="x" onerror="window.__pwned=1" />'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it("does not render injected script tags", () => {
    const { container } = render(<MarkdownContent content={"<script>window.__bad=1</script>"} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("keeps the prose wrapper for typography styling", () => {
    const { container } = render(<MarkdownContent content="hi" />);
    expect(container.firstElementChild?.className).toContain("prose");
  });
});
