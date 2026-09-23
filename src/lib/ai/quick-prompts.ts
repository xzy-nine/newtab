/**
 * 快捷提示词的解析。
 *
 * 设置里既可能是纯文本，也可能是"JSON 字符串"（旧版设置面板写入的形式）。
 * 用 zod 做一次判别式解析，取代原先层层 `typeof` 判断 + 手写 JSON.parse。
 */

import { z } from "zod";

/** 一条快捷提示词。 */
export interface QuickPrompt {
  text: string;
  temperature: number;
  category: string;
}

/** 预设分类的中文名。 */
const CATEGORY_NAMES: Record<string, string> = {
  code: "代码",
  math: "数学",
  analysis: "分析",
  general: "通用",
  translation: "翻译",
  creative: "创意",
};

/** 对象形态的快捷提示词（宽松：缺省字段回填默认值）。 */
const quickPromptObjectSchema = z.object({
  text: z.string(),
  temperature: z.number().optional(),
  category: z.string().optional(),
});

/** 默认温度，与旧实现一致。 */
const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_CATEGORY = "general";

/**
 * 解析单条快捷提示词。
 *
 * - 对象：直接取字段。
 * - JSON 字符串：解析为对象后再取字段。
 * - 普通字符串：按纯文本处理。
 * - 空文本：丢弃。
 */
export function parseQuickPrompt(raw: string | QuickPrompt): QuickPrompt | null {
  if (typeof raw === "object") {
    return { ...raw, text: raw.text.trim() } satisfies QuickPrompt;
  }

  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = quickPromptObjectSchema.safeParse(JSON.parse(trimmed));
      if (parsed.success) {
        return {
          text: parsed.data.text,
          temperature: parsed.data.temperature ?? DEFAULT_TEMPERATURE,
          category: parsed.data.category || DEFAULT_CATEGORY,
        };
      }
    } catch {
      // 不是合法 JSON，按纯文本处理。
    }
  }

  return { text: raw, temperature: DEFAULT_TEMPERATURE, category: DEFAULT_CATEGORY };
}

/** 批量解析并过滤掉空文本。 */
export function parseQuickPrompts(prompts: (string | QuickPrompt)[]): QuickPrompt[] {
  const result: QuickPrompt[] = [];
  for (const prompt of prompts) {
    const parsed = parseQuickPrompt(prompt);
    if (parsed && parsed.text !== "") result.push(parsed);
  }
  return result;
}

/** 分类显示名。 */
export function getCategoryName(category: string): string {
  return CATEGORY_NAMES[category] ?? category;
}
