/**
 * 针对 AI SDK 集成的契约测试。
 *
 * 这里刻意使用真实的 `streamText` / `generateText` 与真实的
 * `@ai-sdk/openai-compatible` 适配器，只把 fetch 换成假实现，用来钉住集成
 * 契约：请求地址与请求体、流式事件字段名、错误状态码映射。这些点一旦被
 * 上游升级改掉，测试会立刻失败。
 */

import { describe, it, expect } from "vitest";
import type { AIProvider } from "@/lib/app-settings";
import { createProvider, resolveModel } from "@/lib/ai/providers";
import { generateTitle, streamChat } from "@/lib/ai/chat";
import type { AIMessage } from "@/lib/ai/types";

/** 构造一个 SSE 假响应。 */
function sseResponse(chunks: string[]): Response {
  const body = chunks.map((c) => `data: ${c}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/**
 * 构造一个只含一条正文增量的合法流式响应。
 *
 * 必须带 `finish_reason`：SDK 在流结束而没有 finish reason 时会判定为
 * 传输被截断并抛错（这正是需要显式覆盖的行为）。
 */
function simpleStream(content = "ok"): Response {
  return sseResponse([
    JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] }),
  ]);
}

/** 构造一个非流式（JSON）假响应。 */
function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

/** 记录请求并返回给定响应的假 fetch。 */
function captureFetch(response: () => Response): {
  fetch: typeof fetch;
  calls: CapturedRequest[];
} {
  const calls: CapturedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return response();
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function provider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    apiKey: "sk-test",
    isDefault: true,
    thinkingMode: "enabled",
    reasoningEffort: "high",
    ...overrides,
  };
}

const userMessage = (content: string): AIMessage => ({ role: "user", content, timestamp: 1 });

describe("streamChat", () => {
  it("accumulates text and reasoning deltas and reports them incrementally", async () => {
    const { fetch } = captureFetch(() =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: "think" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "Hello" } }] }),
        JSON.stringify({ choices: [{ delta: { content: " world" }, finish_reason: "stop" }] }),
      ]),
    );

    const textChunks: string[] = [];
    const reasoningChunks: string[] = [];

    const result = await streamChat({
      model: resolveModel(provider(), undefined, { fetch }),
      provider: provider(),
      messages: [userMessage("hi")],
      systemPrompt: "你是助手",
      callbacks: {
        onContent: (chunk) => textChunks.push(chunk),
        onReasoning: (chunk) => reasoningChunks.push(chunk),
      },
    });

    expect(result.content).toBe("Hello world");
    expect(result.reasoning).toBe("think");
    expect(textChunks).toEqual(["Hello", " world"]);
    expect(reasoningChunks).toEqual(["think"]);
  });

  it("posts to /chat/completions on the resolved baseURL with auth and the thinking field", async () => {
    const { fetch, calls } = captureFetch(() => simpleStream());

    await streamChat({
      model: resolveModel(provider(), undefined, { fetch }),
      provider: provider(),
      messages: [userMessage("hi")],
      systemPrompt: "SYS",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.deepseek.com/chat/completions");
    const body = calls[0]!.body;
    expect(body.model).toBe("deepseek-v4-flash");
    expect(body.stream).toBe(true);
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.reasoning_effort).toBe("high");
    // 思考模式不发送 temperature，交给厂商默认值
    expect(body.temperature).toBeUndefined();
    // 系统提示词作为独立消息置顶
    expect(body.messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
    ]);
  });

  it("sends thinking disabled, temperature 1.0 and no reasoning_effort when thinking is off", async () => {
    const { fetch, calls } = captureFetch(() => simpleStream());
    const off = provider({ thinkingMode: "disabled" });

    await streamChat({
      model: resolveModel(off, undefined, { fetch }),
      provider: off,
      messages: [userMessage("hi")],
      systemPrompt: "SYS",
    });

    const body = calls[0]!.body;
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBe(1.0);
  });

  it("does not send DeepSeek-specific fields to other providers", async () => {
    const { fetch, calls } = captureFetch(() => simpleStream());
    const openai = provider({
      name: "OpenAI",
      apiUrl: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4o",
      thinkingMode: "disabled",
    });

    await streamChat({
      model: resolveModel(openai, undefined, { fetch }),
      provider: openai,
      messages: [userMessage("hi")],
      systemPrompt: "SYS",
    });

    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const body = calls[0]!.body;
    expect(body.thinking).toBeUndefined();
    expect(body.model).toBe("gpt-4o");
  });

  it("sends no reasoning_effort to a non-DeepSeek provider even with thinking enabled", async () => {
    // 回归防护：旧实现只在 deepseek 分支写 reasoning_effort。
    // 若把它发给不支持该参数的接口，会得到 400 Unsupported parameter。
    const { fetch, calls } = captureFetch(() => simpleStream());
    const openai = provider({
      name: "OpenAI",
      apiUrl: "https://api.openai.com/v1",
      model: "gpt-4o",
      thinkingMode: "enabled",
      reasoningEffort: "high",
    });

    await streamChat({
      model: resolveModel(openai, undefined, { fetch }),
      provider: openai,
      messages: [userMessage("hi")],
      systemPrompt: "SYS",
    });

    const body = calls[0]!.body;
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    // 思考模式下旧实现不发 temperature
    expect(body.temperature).toBeUndefined();
  });

  it("honours a model override", async () => {
    const { fetch, calls } = captureFetch(() => simpleStream());

    await streamChat({
      model: resolveModel(provider(), "deepseek-v4-pro", { fetch }),
      provider: provider(),
      messages: [userMessage("hi")],
      systemPrompt: "",
    });

    expect(calls[0]!.body.model).toBe("deepseek-v4-pro");
  });

  it("turns an HTTP error into a readable Chinese message", async () => {
    const { fetch } = captureFetch(
      () =>
        new Response(JSON.stringify({ error: { message: "Invalid API key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );

    await expect(
      streamChat({
        model: resolveModel(provider(), undefined, { fetch }),
        provider: provider(),
        messages: [userMessage("hi")],
        systemPrompt: "",
      }),
    ).rejects.toThrow(/API密钥认证失败.*Invalid API key/s);
  });

  it("surfaces a 402 balance error", async () => {
    const { fetch } = captureFetch(
      () => new Response(JSON.stringify({ error: { message: "no funds" } }), { status: 402 }),
    );

    await expect(
      streamChat({
        model: resolveModel(provider(), undefined, { fetch }),
        provider: provider(),
        messages: [userMessage("hi")],
        systemPrompt: "",
      }),
    ).rejects.toThrow(/余额不足/);
  });

  it("propagates an in-stream error part", async () => {
    const { fetch } = captureFetch(() =>
      sseResponse([JSON.stringify({ error: { message: "模型内部错误" } })]),
    );

    await expect(
      streamChat({
        model: resolveModel(provider(), undefined, { fetch }),
        provider: provider(),
        messages: [userMessage("hi")],
        systemPrompt: "",
      }),
    ).rejects.toThrow(/模型内部错误/);
  });

  it("rejects when the response stream ends without a finish reason", async () => {
    // SDK 会把"没有 finish_reason 就结束"的流判为被截断，而不是静默返回半截内容。
    const { fetch } = captureFetch(() =>
      sseResponse([JSON.stringify({ choices: [{ delta: { content: "partial" } }] })]),
    );

    await expect(
      streamChat({
        model: resolveModel(provider(), undefined, { fetch }),
        provider: provider(),
        messages: [userMessage("hi")],
        systemPrompt: "",
      }),
    ).rejects.toThrow(/finish reason/i);
  });
});

describe("generateTitle", () => {
  it("uses a non-streaming completion and returns the trimmed text", async () => {
    const { fetch, calls } = captureFetch(() =>
      jsonResponse({ choices: [{ message: { role: "assistant", content: "  对话标题  " } }] }),
    );

    const title = await generateTitle(
      "用户: 你好\nAI: 你好",
      provider(),
      resolveModel(provider(), undefined, { fetch }),
    );

    expect(title).toBe("对话标题");
    const body = calls[0]!.body;
    // 非流式请求：SDK 不发送 stream（旧实现显式发送 stream: false，语义一致）
    expect(body.stream).not.toBe(true);
    expect(body.max_tokens).toBe(100);
    expect(body.temperature).toBe(0.3);
  });

  it("wraps failures with a title-specific prefix", async () => {
    const { fetch } = captureFetch(
      () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 }),
    );

    await expect(
      generateTitle("ctx", provider(), resolveModel(provider(), undefined, { fetch })),
    ).rejects.toThrow(/标题生成失败/);
  });
});

describe("createProvider", () => {
  it("adds a bearer token header derived from the API key", async () => {
    const seen: Record<string, string> = {};
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.authorization = headers.get("authorization") ?? "";
      return simpleStream();
    }) as typeof fetch;

    const instance = createProvider(provider(), { fetch: fetchImpl });
    await streamChat({
      model: instance("deepseek-v4-flash"),
      provider: provider(),
      messages: [userMessage("hi")],
      systemPrompt: "",
    });

    expect(seen.authorization).toBe("Bearer sk-test");
  });
});
