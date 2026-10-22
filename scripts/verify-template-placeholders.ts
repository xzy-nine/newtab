/**
 * 校验槽位映射与仓库现状一致，且槽位只出现在语法允许的位置上。
 *
 * 同一段文本里既有槽位也有具体名字，判定必须先划出槽位区间再检查其余位置，
 * 否则 `<cli>-doc-sync` 这类槽位后缀会被误报成残留的具体名字 `doc-sync`。
 *
 * 四条不变量，每条都对应一类会把模板做坏的失败：
 *
 * - 槽位记号必须以某个已声明键开头。槽位允许与后缀拼接（`<cli>-doc`、`<cli>Cache`），
 *   所以判定是最长已声明前缀而不是整词相等；拼错的槽位不会被 `--instantiate`
 *   替换，会在下游仓库里静默留下垃圾。
 * - 槽位区间之外不得残留任何具体名字。某个 `example` 值还在，说明该处漏了替换。
 * - 技能目录名必须匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`。技能加载器按该文法校验
 *   `name`，不合格的目录会让技能被静默忽略，且不出现在技能目录里。
 * - 仓库只允许两种状态：全部槽位待实例化，或全部已实例化。混合状态说明某次
 *   替换中途失败，仓库已半损坏。
 *
 * @module scripts/verify-template-placeholders
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { repoRoot } from "./doc-system.config.ts";

/** 技能加载器接受的名称文法。 */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** 槽位记号的前缀族；小写族可与后缀拼接，大写族是独立标识符。 */
const SLOT_FAMILIES = ["prompt-infra-slot-", "PROMPT_INFRA_SLOT_"];
/** 槽位记号可延续的字符；用来确定一个槽位覆盖到哪里。 */
const SLOT_CHARACTER = /[A-Za-z0-9_-]/;
/** 参与扫描的文件扩展名。 */
const TEXT_EXTENSIONS = [".md", ".ts", ".tsx", ".mjs", ".json", ".yaml", ".yml"];
/**
 * 遍历始终跳过的目录；与 `instantiate-template.mjs` 的替换跳过名单一致。
 *
 * pnpm 的内容寻址存储与 WXT 的生成目录属于缓存与派生物，不是本仓库声明身份
 * 的位置。
 */
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".pnpm-store", ".output", ".wxt"]);
/**
 * 声明槽位而非引用槽位的文件：映射表定义键，两个脚本的注释与前缀常量都属于声明。
 *
 * 它们必然包含槽位字面量与具体名字（用来解释取值），把声明当引用会得到自指的假报错。
 * 名单必须与 `instantiate-template.mjs` 的替换跳过名单一致，否则两个工具对同一仓库
 * 会给出相反结论。
 */
const DECLARATION_FILES = new Set([
  "template.placeholders.json",
  "scripts/instantiate-template.mjs",
  "scripts/verify-template-placeholders.ts",
]);
const MAPPING_RELATIVE = "template.placeholders.json";

interface Placeholder {
  key: string;
  example: string;
  aliases?: string[];
}

const placeholders = JSON.parse(readFileSync(resolve(repoRoot, MAPPING_RELATIVE), "utf8"))
  .placeholders as Placeholder[];
const keys = placeholders.map((entry) => entry.key);
/** 最长优先，保证 `<cli>-doc` 由更长键认领而不是被 `<cli>` 截断。 */
const keysLongestFirst = [...keys].sort((a, b) => b.length - a.length);

const errors: string[] = [];

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) walk(absolute, files);
      continue;
    }
    if (TEXT_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) files.push(absolute);
  }
  return files;
}

/** 一段文本中每个槽位记号的起止下标。 */
function slotSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const family of SLOT_FAMILIES) {
    for (let start = text.indexOf(family); start !== -1; start = text.indexOf(family, start + 1)) {
      let end = start;
      while (end < text.length && SLOT_CHARACTER.test(text[end] ?? "")) end += 1;
      spans.push({ start, end });
    }
  }
  return spans;
}

const present = new Set<string>();
const files = walk(repoRoot).filter(
  (file) => !DECLARATION_FILES.has(relative(repoRoot, file).replaceAll("\\", "/")),
);

// 一轮扫描先定状态：还有槽位就是模板态，槽位清零就是已实例化态。
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const span of slotSpans(text)) {
    const claimed = keysLongestFirst.find((key) => text.startsWith(key, span.start));
    if (claimed !== undefined) present.add(claimed);
  }
}
const isTemplate = present.size > 0;

for (const file of files) {
  const relativePath = relative(repoRoot, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const spans = slotSpans(text);

  for (const span of spans) {
    if (keysLongestFirst.some((key) => text.startsWith(key, span.start))) continue;
    errors.push(
      `${relativePath}: undeclared slot ${JSON.stringify(text.slice(span.start, span.end))}; add it to ${MAPPING_RELATIVE} or fix the spelling`,
    );
  }

  // 只有模板态才要求「槽位之外不得有具体名字」：实例化之后全仓都是真实名字，
  // 那正是目标状态，逐个报错只会把正确结果判成失败。
  if (isTemplate) {
    for (const entry of placeholders) {
      for (const form of [entry.example, ...(entry.aliases ?? [])]) {
        for (let index = text.indexOf(form); index !== -1; index = text.indexOf(form, index + 1)) {
          const insideSlot = spans.some(
            (span) => index >= span.start && index + form.length <= span.end,
          );
          if (insideSlot) continue;
          errors.push(
            `${relativePath}: concrete name ${JSON.stringify(form)} survives outside any slot; expected ${entry.key}`,
          );
        }
      }
    }
  }
}

const missing = keys.filter((key) => !present.has(key));
if (present.size > 0 && missing.length > 0) {
  errors.push(
    `declared but unused: ${missing.join(", ")} appear nowhere; remove them from ${MAPPING_RELATIVE} or use them. A template declares exactly the slots it uses, otherwise the mapping stops describing the repository.`,
  );
}

const skillsRoot = resolve(repoRoot, ".agents/skills");
for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  if (!SKILL_NAME.test(entry.name)) {
    errors.push(
      `.agents/skills/${entry.name}: directory name violates ${String(SKILL_NAME)}; the loader silently ignores such a skill`,
    );
  }
}

if (errors.length > 0) {
  process.stderr.write("verify-template-placeholders: violations found:\n");
  for (const error of errors) process.stderr.write(`  ${error}\n`);
  process.exit(1);
}

process.stdout.write(
  `verify-template-placeholders: ${keys.length} declared slot(s); repository is ${present.size === 0 ? "instantiated" : "a template"}.\n`,
);
