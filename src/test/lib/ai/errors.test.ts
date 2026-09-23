import { describe, it, expect } from "vitest";
import { APICallError } from "ai";
import { describeApiError, toChatError } from "@/lib/ai/errors";

/** 构造一个带状态码与响应体的 APICallError，与 openai-compatible 抛出的形态一致。 */
function apiError(statusCode: number | undefined, responseBody?: string): APICallError {
  return new APICallError({
    message: "Response error",
    url: "https://api.example.com/chat/completions",
    requestBodyValues: {},
    statusCode,
    responseBody,
  });
}

describe("describeApiError", () => {
  it("explains an authentication failure", () => {
    const text = describeApiError(apiError(401, JSON.stringify({ error: { message: "bad key" } })));
    expect(text).toContain("API密钥认证失败");
    expect(text).toContain("bad key");
  });

  it("explains insufficient balance", () => {
    expect(describeApiError(apiError(402, "{}"))).toContain("余额不足");
  });

  it("explains rate limiting", () => {
    expect(describeApiError(apiError(429, "{}"))).toContain("速率达到上限");
  });

  it("reads a top-level message field as well as error.message", () => {
    const text = describeApiError(apiError(500, JSON.stringify({ message: "boom" })));
    expect(text).toContain("服务器内部故障");
    expect(text).toContain("boom");
  });

  it("still describes the status when the body is not JSON", () => {
    const text = describeApiError(apiError(503, "<html>oops</html>"));
    expect(text).toContain("服务器繁忙");
    expect(text).not.toContain("undefined");
  });

  it("falls back to a generic message for unknown status codes", () => {
    const text = describeApiError(apiError(418, JSON.stringify({ error: { message: "teapot" } })));
    expect(text).toContain("418");
    expect(text).toContain("teapot");
  });

  it("surfaces network failures instead of an undefined status", () => {
    // SDK 在网络不可达时抛出没有 statusCode 的 APICallError。
    expect(describeApiError(apiError(undefined))).toBe("Response error");
  });

  it("passes through plain Error messages", () => {
    expect(describeApiError(new Error("AI配置不完整，请检查API地址和密钥"))).toBe(
      "AI配置不完整，请检查API地址和密钥",
    );
  });

  it("stringifies non-Error values", () => {
    expect(describeApiError("oops")).toBe("oops");
  });
});

describe("toChatError", () => {
  it("returns Error instances unchanged", () => {
    const err = new Error("x");
    expect(toChatError(err)).toBe(err);
  });

  it("translates an APICallError rather than leaking the provider's raw message", () => {
    const translated = toChatError(
      apiError(401, JSON.stringify({ error: { message: "bad key" } })),
    );
    expect(translated.message).toContain("API密钥认证失败");
    expect(translated.message).toContain("bad key");
  });

  it("wraps non-Error values", () => {
    const wrapped = toChatError({ nope: true });
    expect(wrapped).toBeInstanceOf(Error);
  });
});
