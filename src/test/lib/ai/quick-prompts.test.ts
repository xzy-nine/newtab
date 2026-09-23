import { describe, it, expect } from "vitest";
import { getCategoryName, parseQuickPrompt, parseQuickPrompts } from "@/lib/ai/quick-prompts";

describe("parseQuickPrompt", () => {
  it("treats a plain string as general with the default temperature", () => {
    expect(parseQuickPrompt("总结一下")).toEqual({
      text: "总结一下",
      temperature: 1.0,
      category: "general",
    });
  });

  it("parses the JSON-encoded form written by the settings panel", () => {
    const raw = JSON.stringify({ text: "写代码", temperature: 0.2, category: "code" });
    expect(parseQuickPrompt(raw)).toEqual({
      text: "写代码",
      temperature: 0.2,
      category: "code",
    });
  });

  it("fills defaults for missing JSON fields", () => {
    expect(parseQuickPrompt(JSON.stringify({ text: "hi" }))).toEqual({
      text: "hi",
      temperature: 1.0,
      category: "general",
    });
  });

  it("falls back to plain text when the JSON has the wrong shape", () => {
    const raw = JSON.stringify({ nope: 1 });
    expect(parseQuickPrompt(raw)).toEqual({
      text: raw,
      temperature: 1.0,
      category: "general",
    });
  });

  it("falls back to plain text for malformed JSON", () => {
    expect(parseQuickPrompt("{not json")).toEqual({
      text: "{not json",
      temperature: 1.0,
      category: "general",
    });
  });

  it("drops empty and whitespace-only strings", () => {
    expect(parseQuickPrompt("")).toBeNull();
    expect(parseQuickPrompt("   ")).toBeNull();
  });

  it("passes through an already-parsed object", () => {
    expect(parseQuickPrompt({ text: "hi", temperature: 0.5, category: "math" })).toEqual({
      text: "hi",
      temperature: 0.5,
      category: "math",
    });
  });
});

describe("parseQuickPrompts", () => {
  it("filters out blanks while keeping order", () => {
    const result = parseQuickPrompts(["a", "", "  ", "b"]);
    expect(result.map((p) => p.text)).toEqual(["a", "b"]);
  });

  it("drops JSON entries whose text is empty", () => {
    const result = parseQuickPrompts([JSON.stringify({ text: "", temperature: 0.1 })]);
    expect(result).toEqual([]);
  });
});

describe("getCategoryName", () => {
  it("translates known categories", () => {
    expect(getCategoryName("code")).toBe("代码");
    expect(getCategoryName("translation")).toBe("翻译");
  });

  it("passes unknown categories through", () => {
    expect(getCategoryName("custom")).toBe("custom");
  });
});
