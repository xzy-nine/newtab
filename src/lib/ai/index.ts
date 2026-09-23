/**
 * AI 模块对组件层的唯一入口。
 *
 * 分层结构（自下而上）：
 * - `types`        纯类型
 * - `errors`       SDK 异常 → 用户可读文案
 * - `providers`    设置里的提供商配置 → AI SDK 模型句柄
 * - `models`       模型能力判定与模型列表查询
 * - `persistence`  对话历史的读写与校验
 * - `quick-prompts` 快捷提示词解析
 * - `chat`         流式对话、标题生成等用例编排
 * - `store`        Zustand 状态编排
 *
 * 这里只导出组件层真正需要的东西；其余函数属于模块内部实现，由
 * `src/test/lib/ai/` 下的测试通过 `@/lib/ai/*` 直接引用，避免内部细节从入口泄漏出去。
 */

export type { AIMessage, Conversation } from "./types";

export { isProviderReady, type ProviderCredentials } from "./providers";

export { isReasoningModelName, listModels } from "./models";

export { getCategoryName, parseQuickPrompts, type QuickPrompt } from "./quick-prompts";

export { useAIStore } from "./store";
