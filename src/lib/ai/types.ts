/**
 * AI 对话领域的核心类型。
 *
 * 这一层只放数据结构，不依赖 React / 浏览器扩展 API，方便其它层与单元测试复用。
 * 提供商的配置类型见 `@/lib/app-settings`（属于设置域，不在这里重复定义）。
 */

/** 对话消息角色。与 OpenAI 兼容接口的 role 取值保持一致。 */
export type AIRole = "user" | "assistant" | "system";

/** 一条对话消息。 */
export interface AIMessage {
  role: AIRole;
  content: string;
  timestamp: number;
  /** 推理模型的思维链内容；非推理模型或未开启思考时不存在。 */
  reasoning_content?: string;
}

/** 一个完整的对话（会话）。 */
export interface Conversation {
  id: string;
  title: string;
  messages: AIMessage[];
  createdAt: number;
  lastUpdated: number;
}

/** 流式响应过程中的增量回调。 */
export interface ChatStreamCallbacks {
  /** 正文增量。 */
  onContent?: (chunk: string) => void;
  /** 思维链增量。 */
  onReasoning?: (chunk: string) => void;
}

/** `sendMessage` 的调用方回调。 */
export interface SendMessageCallbacks extends ChatStreamCallbacks {
  onDone?: () => void;
  onError?: (err: Error) => void;
}

/** `sendMessage` 的完整可选参数。 */
export interface SendMessageOptions extends SendMessageCallbacks {
  /** 本次请求使用的模型；不传时用提供商配置里配置的 model。 */
  model?: string;
}
