import { describe, it, expect } from "vitest";
import {
  buildTitleContext,
  fallbackTitle,
  isTitleTriggerRound,
  pickTitleProvider,
  toApiMessages,
} from "@/lib/ai/chat";
import type { AIMessage } from "@/lib/ai/types";
import type { AIProvider } from "@/lib/app-settings";

function msg(role: AIMessage["role"], content: string): AIMessage {
  return { role, content, timestamp: 1 };
}

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: "p",
    apiUrl: "https://api.example.com",
    model: "gpt-4o",
    apiKey: "k",
    isDefault: false,
    ...overrides,
  };
}

describe("toApiMessages", () => {
  it("drops the timestamp and keeps role/content", () => {
    expect(toApiMessages([msg("user", "hi")])).toEqual([{ role: "user", content: "hi" }]);
  });

  it("filters out system messages so the system prompt is not duplicated", () => {
    const result = toApiMessages([msg("system", "sys"), msg("user", "hi")]);
    expect(result).toEqual([{ role: "user", content: "hi" }]);
  });

  it("preserves order", () => {
    const result = toApiMessages([msg("user", "a"), msg("assistant", "b"), msg("user", "c")]);
    expect(result.map((m) => m.content)).toEqual(["a", "b", "c"]);
  });
});

describe("isTitleTriggerRound", () => {
  it("triggers on the sparse n^2-n+1 sequence", () => {
    const triggered = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].filter(isTitleTriggerRound);
    expect(triggered).toEqual([1, 3, 7, 13]);
  });
});

describe("buildTitleContext", () => {
  it("pairs user and assistant turns", () => {
    const context = buildTitleContext([msg("user", "问题"), msg("assistant", "回答")]);
    expect(context).toContain("用户: 问题");
    expect(context).toContain("AI: 回答");
  });

  it("truncates long messages", () => {
    const long = "x".repeat(500);
    const context = buildTitleContext([msg("user", long), msg("assistant", long)]);
    expect(context).toContain("...");
    expect(context.length).toBeLessThan(600);
  });

  it("returns empty string when there is nothing to summarize", () => {
    expect(buildTitleContext([])).toBe("");
    expect(buildTitleContext([msg("system", "sys")])).toBe("");
  });
});

describe("pickTitleProvider", () => {
  it("returns null when no provider has a key", () => {
    expect(pickTitleProvider([provider({ apiKey: "" })])).toBeNull();
    expect(pickTitleProvider([])).toBeNull();
  });

  it("prefers a fast non-reasoning model", () => {
    const chosen = pickTitleProvider([
      provider({ name: "r", model: "o1-mini" }),
      provider({ name: "fast", model: "deepseek-v4-flash" }),
    ]);
    expect(chosen?.name).toBe("fast");
  });

  it("skips providers without a key", () => {
    const chosen = pickTitleProvider([
      provider({ name: "nokey", apiKey: "" }),
      provider({ name: "ok", apiKey: "k" }),
    ]);
    expect(chosen?.name).toBe("ok");
  });

  it("falls back to a reasoning provider when that is all there is", () => {
    const chosen = pickTitleProvider([provider({ name: "only", model: "o1-mini" })]);
    expect(chosen?.name).toBe("only");
  });
});

describe("fallbackTitle", () => {
  it("keeps short messages intact", () => {
    expect(fallbackTitle("hello")).toBe("hello");
  });

  it("truncates long messages to 50 characters plus an ellipsis", () => {
    const title = fallbackTitle("a".repeat(80));
    expect(title).toBe("a".repeat(50) + "...");
  });
});
