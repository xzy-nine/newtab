import { describe, it, expect } from "vitest";
import {
  CONVERSATIONS_STORAGE_KEY,
  MAX_CONVERSATIONS,
  createConversationId,
  parseConversations,
  pruneConversations,
} from "./persistence";
import type { Conversation } from "./types";

function conversation(id: string, lastUpdated: number): Conversation {
  return { id, title: id, messages: [], createdAt: 0, lastUpdated };
}

describe("CONVERSATIONS_STORAGE_KEY", () => {
  it("stays at the legacy key so existing users keep their history", () => {
    // 改动这个键会让所有旧用户的对话历史"消失"。
    expect(CONVERSATIONS_STORAGE_KEY).toBe("aiConversations");
  });
});

describe("parseConversations", () => {
  it("accepts a well-formed conversation", () => {
    const input = [
      {
        id: "c1",
        title: "t",
        messages: [{ role: "user", content: "hi", timestamp: 1 }],
        createdAt: 0,
        lastUpdated: 1,
      },
    ];
    expect(parseConversations(input)).toHaveLength(1);
  });

  it("preserves reasoning content", () => {
    const input = [
      {
        id: "c1",
        title: "t",
        messages: [{ role: "assistant", content: "a", timestamp: 1, reasoning_content: "why" }],
        createdAt: 0,
        lastUpdated: 1,
      },
    ];
    expect(parseConversations(input)[0]!.messages[0]!.reasoning_content).toBe("why");
  });

  it("returns an empty array for non-arrays", () => {
    expect(parseConversations(null)).toEqual([]);
    expect(parseConversations(undefined)).toEqual([]);
    expect(parseConversations({})).toEqual([]);
    expect(parseConversations("nope")).toEqual([]);
  });

  it("drops corrupt entries but keeps valid ones", () => {
    const input = [
      { id: "good", title: "t", messages: [], createdAt: 0, lastUpdated: 1 },
      { id: "bad-messages", title: "t", messages: "not-an-array", createdAt: 0, lastUpdated: 1 },
      { title: "missing-id", messages: [], createdAt: 0, lastUpdated: 1 },
      null,
    ];
    const parsed = parseConversations(input);
    expect(parsed.map((c) => c.id)).toEqual(["good"]);
  });

  it("rejects an unknown message role", () => {
    const input = [
      {
        id: "c",
        title: "t",
        messages: [{ role: "wizard", content: "x", timestamp: 1 }],
        createdAt: 0,
        lastUpdated: 1,
      },
    ];
    expect(parseConversations(input)).toEqual([]);
  });
});

describe("pruneConversations", () => {
  it("returns the input unchanged when under the limit", () => {
    const list = [conversation("a", 1)];
    expect(pruneConversations(list)).toBe(list);
  });

  it("keeps the most recently updated conversations", () => {
    const list = Array.from({ length: MAX_CONVERSATIONS + 5 }, (_, i) => conversation(`c${i}`, i));
    const pruned = pruneConversations(list);
    expect(pruned).toHaveLength(MAX_CONVERSATIONS);
    // 最新的（lastUpdated 最大）应当保留
    expect(pruned[0]!.lastUpdated).toBe(MAX_CONVERSATIONS + 4);
  });
});

describe("createConversationId", () => {
  it("produces unique, prefixed ids", () => {
    const a = createConversationId();
    const b = createConversationId();
    expect(a).not.toBe(b);
    expect(a.startsWith("conv_")).toBe(true);
  });
});
