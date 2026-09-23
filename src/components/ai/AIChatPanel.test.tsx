/**
 * AIChatPanel 的装配测试。
 *
 * 重点钉住"打开面板即加载历史对话"这条连线：面板通过 lazy 懒加载，一旦有人
 * 把 hydrate 调用漏掉，已保存的对话就会静默消失，而类型检查与纯逻辑单测都
 * 发现不了。因此这里用 mock 隔离 store 与子组件，只断言这根连线存在。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const hydrateConversations = vi.fn(async () => {});

vi.mock("@/lib/ai", () => ({
  useAIStore: () => ({
    conversations: [],
    currentConversationId: null,
    isStreaming: false,
    streamingContent: "",
    streamingReasoning: "",
    streamingConversationId: null,
    hydrateConversations,
    createConversation: vi.fn(),
    switchConversation: vi.fn(),
    deleteConversation: vi.fn(),
    clearAllConversations: vi.fn(),
    stopStreaming: vi.fn(),
    sendMessage: vi.fn(),
  }),
  parseQuickPrompts: () => [],
}));

vi.mock("@/lib/app-settings-store", () => ({
  useAppSettings: () => ({
    aiProviders: [],
    aiCurrentProviderIndex: 0,
    setAiCurrentProviderIndex: vi.fn(),
    setAiProviders: vi.fn(),
    aiQuickPrompts: [],
  }),
}));

vi.mock("./useModelCatalog", () => ({
  useModelCatalog: () => ({ models: [], loading: false, refresh: vi.fn() }),
}));

// 子组件与面板本身的渲染无关，替换为空实现以隔离被测连线。
vi.mock("./ChatComposer", () => ({ ChatComposer: () => null }));
vi.mock("./ConversationSidebar", () => ({ ConversationSidebar: () => null }));
vi.mock("./MessageBubble", () => ({ MessageBubble: () => null }));

import { AIChatPanel } from "./AIChatPanel";

describe("AIChatPanel", () => {
  beforeEach(() => {
    hydrateConversations.mockClear();
  });

  it("loads saved conversations on mount", () => {
    render(<AIChatPanel onClose={() => {}} />);
    expect(hydrateConversations).toHaveBeenCalledTimes(1);
  });
});
