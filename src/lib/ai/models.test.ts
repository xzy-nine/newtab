import { describe, it, expect } from "vitest";
import { buildModelsUrl, isReasoningModel, isReasoningModelName } from "./models";

describe("buildModelsUrl", () => {
  it("appends /v1/models to a plain host", () => {
    expect(buildModelsUrl("https://api.deepseek.com")).toBe("https://api.deepseek.com/v1/models");
  });

  it("does not duplicate an existing version segment", () => {
    expect(buildModelsUrl("https://api.deepseek.com/v1")).toBe(
      "https://api.deepseek.com/v1/models",
    );
  });

  it("drops the chat/completions suffix before appending", () => {
    expect(buildModelsUrl("https://api.openai.com/v1/chat/completions")).toBe(
      "https://api.openai.com/v1/models",
    );
  });

  it("keeps non-v1 path prefixes intact", () => {
    expect(buildModelsUrl("https://gateway.example.com/openai")).toBe(
      "https://gateway.example.com/openai/v1/models",
    );
  });

  it("returns empty string for empty input", () => {
    expect(buildModelsUrl("")).toBe("");
  });
});

describe("isReasoningModelName", () => {
  it("flags reasoning-style model ids", () => {
    for (const id of [
      "deepseek-reasoner",
      "deepseek-v4",
      "o1-preview",
      "o3-mini",
      "claude-3-7-thinking",
      "qwq-reasoning",
    ]) {
      expect(isReasoningModelName(id), id).toBe(true);
    }
  });

  it("does not flag ordinary models", () => {
    for (const id of ["gpt-4o", "deepseek-chat", "gemini-2.0-flash"]) {
      expect(isReasoningModelName(id), id).toBe(false);
    }
  });
});

describe("isReasoningModel", () => {
  it("always treats name-based reasoning models as reasoning", () => {
    expect(isReasoningModel("o1-mini")).toBe(true);
  });

  it("treats deepseek v4 as reasoning only when thinking is enabled", () => {
    expect(isReasoningModel("deepseek-v4-flash", { thinkingMode: "enabled" })).toBe(true);
    expect(isReasoningModel("deepseek-v4-flash", { thinkingMode: "disabled" })).toBe(false);
    expect(isReasoningModel("deepseek-v4-flash")).toBe(false);
  });
});
