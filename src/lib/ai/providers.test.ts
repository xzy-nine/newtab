import { describe, it, expect } from "vitest";
import type { AIProvider } from "@/lib/app-settings";
import {
  isDeepSeekProvider,
  isProviderReady,
  resolveBaseUrl,
  resolveReasoning,
  resolveTemperature,
} from "./providers";

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKey: "sk-test",
    isDefault: true,
    ...overrides,
  };
}

describe("resolveBaseUrl", () => {
  it("keeps a plain host unchanged", () => {
    expect(resolveBaseUrl("https://api.deepseek.com")).toBe("https://api.deepseek.com");
  });

  it("strips the /chat/completions suffix users paste in", () => {
    expect(resolveBaseUrl("https://api.openai.com/v1/chat/completions")).toBe(
      "https://api.openai.com/v1",
    );
  });

  it("preserves /v1 for OpenAI-compatible endpoints", () => {
    expect(resolveBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
  });

  it("strips /v1 only for DeepSeek, whose chat endpoint has no version segment", () => {
    expect(resolveBaseUrl("https://api.deepseek.com/v1")).toBe("https://api.deepseek.com");
  });

  it("removes trailing slashes", () => {
    expect(resolveBaseUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1");
  });

  it("trims surrounding whitespace", () => {
    expect(resolveBaseUrl("  https://api.deepseek.com  ")).toBe("https://api.deepseek.com");
  });

  it("returns empty string for empty input", () => {
    expect(resolveBaseUrl("")).toBe("");
  });
});

describe("isDeepSeekProvider", () => {
  it("matches on apiUrl or name", () => {
    expect(isDeepSeekProvider({ apiUrl: "https://api.deepseek.com", name: "x" })).toBe(true);
    expect(isDeepSeekProvider({ apiUrl: "https://x.com", name: "DeepSeek" })).toBe(true);
    expect(isDeepSeekProvider({ apiUrl: "https://api.openai.com", name: "OpenAI" })).toBe(false);
  });
});

describe("resolveReasoning", () => {
  it("returns undefined when thinking is off so no reasoning_effort is sent", () => {
    expect(
      resolveReasoning({ name: "DeepSeek", apiUrl: "https://api.deepseek.com" }),
    ).toBeUndefined();
    expect(
      resolveReasoning({
        name: "DeepSeek",
        apiUrl: "https://api.deepseek.com",
        thinkingMode: "disabled",
      }),
    ).toBeUndefined();
  });

  it("maps enabled to a concrete effort level for DeepSeek", () => {
    expect(
      resolveReasoning({
        name: "DeepSeek",
        apiUrl: "https://api.deepseek.com",
        thinkingMode: "enabled",
      }),
    ).toBe("high");
    expect(
      resolveReasoning({
        name: "DeepSeek",
        apiUrl: "https://api.deepseek.com",
        thinkingMode: "enabled",
        reasoningEffort: "max",
      }),
    ).toBe("xhigh");
  });

  it("never sends reasoning_effort to non-DeepSeek providers, even with thinking enabled", () => {
    // 旧实现只在 deepseek 分支写 reasoning_effort；发给不支持它的接口会 400。
    expect(
      resolveReasoning({
        name: "OpenAI",
        apiUrl: "https://api.openai.com/v1",
        thinkingMode: "enabled",
        reasoningEffort: "high",
      }),
    ).toBeUndefined();
  });
});

describe("resolveTemperature", () => {
  it("omits temperature when thinking is enabled", () => {
    expect(resolveTemperature(provider({ thinkingMode: "enabled" }))).toBeUndefined();
  });

  it("uses 1.0 when thinking is disabled", () => {
    expect(resolveTemperature(provider({ thinkingMode: "disabled" }))).toBe(1.0);
  });
});

describe("isProviderReady", () => {
  it("requires both apiUrl and apiKey", () => {
    expect(isProviderReady(provider())).toBe(true);
    expect(isProviderReady(provider({ apiKey: "" }))).toBe(false);
    expect(isProviderReady(provider({ apiKey: "   " }))).toBe(false);
    expect(isProviderReady(provider({ apiUrl: "" }))).toBe(false);
    expect(isProviderReady(undefined)).toBe(false);
  });
});
