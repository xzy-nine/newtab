/**
 * 地址拼接收敛的回归测试。
 *
 * 地址拼接是最容易"看起来正常、实际请求错地址"的地方，一旦改坏只会在运行时
 * 表现为 404/400。这里把新旧两套规则的期望值都钉死。
 */

import { describe, it, expect } from "vitest";
import { resolveBaseUrl } from "./providers";

/** 旧实现 buildChatUrl 的规则：已含 /chat/completions 原样返回；deepseek 去 /v1；否则追加。 */
function legacyChatUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim();
  if (trimmed.includes("/chat/completions")) return trimmed;
  const base = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  if (/deepseek/i.test(base)) return base.replace(/\/v1$/, "") + "/chat/completions";
  return base + "/chat/completions";
}

/** 新实现：SDK 会在 baseURL 后拼 /chat/completions，因此 resolveBaseUrl + 该后缀应等于旧结果。 */
function newChatUrl(apiUrl: string): string {
  return resolveBaseUrl(apiUrl) + "/chat/completions";
}

const CASES = [
  "https://api.deepseek.com",
  "https://api.deepseek.com/v1",
  "https://api.openai.com/v1",
  "https://api.openai.com/v1/chat/completions",
  "https://api.moonshot.cn/v1",
  "https://open.bigmodel.cn/api/paas/v4",
  "https://api.siliconflow.cn/v1",
];

describe("chat URL parity with the legacy implementation", () => {
  for (const apiUrl of CASES) {
    it(`matches for ${apiUrl}`, () => {
      expect(newChatUrl(apiUrl)).toBe(legacyChatUrl(apiUrl));
    });
  }

  it("documents the known difference for a DeepSeek URL with an explicit path", () => {
    // 旧实现见到 /chat/completions 就原样返回；新实现先剥离再交给 SDK 拼回，
    // 结果一致。
    expect(newChatUrl("https://api.deepseek.com/v1/chat/completions")).toBe(
      "https://api.deepseek.com/v1/chat/completions",
    );
  });
});
