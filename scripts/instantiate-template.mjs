#!/usr/bin/env node
/**
 * 在模板携带的槽位与本仓库真名之间双向替换，并同步重命名路径。
 *
 * `--export` 在开发模板时执行：具体名字换成槽位。
 * `--instantiate` 在从模板建仓后执行：槽位换成本仓库真名。
 * `--check` 只报告残留的槽位数量，供门禁调用；`--dry-run` 只打印计划，不写盘。
 *
 * 映射的唯一来源是仓库根目录的 `template.placeholders.json`，两个方向都由它推导，
 * 因此不会漂移。全部替换都是字面串，不做正则：槽位与具体名字都不含需要转义的
 * 元字符，而正则会让「某个名字恰好是另一个名字的前缀」变成顺序敏感的谜题。
 */

import {
  readFileSync,
  renameSync,
  readdirSync,
  statSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, dirname, basename } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mappingPath = join(root, "template.placeholders.json");

/** 参与替换的文件扩展名。 */
const TEXT_EXTENSIONS = [".md", ".ts", ".tsx", ".mjs", ".json", ".yaml", ".yml"];
/**
 * 替换永不进入的目录。
 *
 * 除依赖与版本库外，pnpm 的内容寻址存储与 WXT 的生成目录都不属于仓库散文，
 * 遍历它们只会把缓存里的无关文本当成待替换内容。
 */
const SKIP_DIRECTORIES = new Set(["node_modules", ".git", ".pnpm-store", ".output", ".wxt"]);
/**
 * 替换永不进入的文件。
 *
 * 映射表定义槽位本身；本脚本与槽位门禁的注释引用具体名字来说明取值，它们是声明而
 * 非引用，改动这些说明只会让代码与文档对不上。
 */
const SKIP_FILES = new Set([
  mappingPath,
  resolve(import.meta.dirname, "instantiate-template.mjs"),
  resolve(import.meta.dirname, "verify-template-placeholders.ts"),
]);

const entries = JSON.parse(readFileSync(mappingPath, "utf8")).placeholders;

/**
 * 按方向生成替换规则，全部为字面串，按源串长度降序。
 *
 * 长串必须先换：某个槽位若与另一个具体名字共享前缀，短串先换会把长标识符切碎，
 * 得到既不是槽位也不是真名的中间产物。降序排列由长度保证，不依赖映射表的书写顺序。
 */
function rulesFor(direction) {
  const rules = [];
  for (const entry of entries) {
    for (const form of [entry.example, ...(entry.aliases ?? [])]) {
      rules.push(
        direction === "export" ? { from: form, to: entry.key } : { from: entry.key, to: form },
      );
    }
  }
  return rules.sort((a, b) => b.from.length - a.from.length);
}

/** 递归列出参与替换的文本文件与候选重命名目录。 */
function walk(directory, files = [], directories = []) {
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      directories.push(absolute);
      walk(absolute, files, directories);
      continue;
    }
    if (TEXT_EXTENSIONS.some((extension) => entry.endsWith(extension))) files.push(absolute);
  }
  return { files, directories };
}

/** 槽位记号的前缀族；与门禁共用同一套形态。 */
const SLOT_FAMILIES = ["prompt-infra-slot-", "PROMPT_INFRA_SLOT_"];
/** 槽位记号可延续的字符，用来确定一段槽位覆盖到哪里。 */
const SLOT_CHARACTER = /[A-Za-z0-9_-]/;

/**
 * 把文本切成槽位段与非槽位段。
 *
 * 槽位名允许与后缀拼接（`<cli>-doc`、`<acronym>_SNAPSHOT`），因此槽位覆盖到下一个
 * 非标识符字符为止。这个切分是替换幂等的前提：槽位段原样保留，替换只作用于槽位
 * 之外的文本。否则 `--export` 会把已生成的槽位名里的 `doc-sync` 再换一次，得到
 * `...-cmd-prompt-infra-slot-cmd-doc-sync` 这种被套娃的垃圾。
 */
function slice(text) {
  const pieces = [];
  let cursor = 0;
  const starts = [];
  for (const family of SLOT_FAMILIES) {
    for (let start = text.indexOf(family); start !== -1; start = text.indexOf(family, start + 1))
      starts.push(start);
  }
  for (const start of starts.sort((a, b) => a - b)) {
    if (start < cursor) continue;
    let end = start;
    while (end < text.length && SLOT_CHARACTER.test(text[end] ?? "")) end += 1;
    if (start > cursor) pieces.push({ text: text.slice(cursor, start), slot: false });
    pieces.push({ text: text.slice(start, end), slot: true });
    cursor = end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), slot: false });
  return pieces;
}

/**
 * 施加一组替换规则，返回新文本与命中次数。
 *
 * 两个方向作用在互不相交的片段上，这是幂等性的来源：`export` 只改槽位之外的文本，
 * `instantiate` 只改槽位本身。若让 `export` 也改槽位内部，已生成的槽位名里的
 * `doc-sync` 会被再换一次，得到被套娃的 `...-cmd-prompt-infra-slot-cmd-doc-sync`。
 */
function apply(text, rules, direction) {
  let hits = 0;
  const out = slice(text)
    .map((piece) => {
      const editable = direction === "export" ? !piece.slot : piece.slot;
      if (!editable) return piece.text;
      let segment = piece.text;
      for (const { from, to } of rules) {
        if (!segment.includes(from)) continue;
        hits += segment.split(from).length - 1;
        segment = segment.split(from).join(to);
      }
      return segment;
    })
    .join("");
  return { out, hits };
}

/** 统计仍残留的占位符，供 `--check` 使用。 */
function countRemaining(files) {
  const counts = new Map();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const entry of entries) {
      const hits = text.split(entry.key).length - 1;
      if (hits > 0) counts.set(entry.key, (counts.get(entry.key) ?? 0) + hits);
    }
  }
  return counts;
}

const argv = process.argv.slice(2);
const mode = argv.find((arg) => arg.startsWith("--") && arg !== "--dry-run") ?? "--check";
const dryRun = argv.includes("--dry-run");

if (mode === "--check") {
  const { files } = walk(root);
  const remaining = countRemaining(files);
  const total = [...remaining.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    process.stdout.write(
      "instantiate-template: 0 placeholder occurrence(s) left; the repository carries only names.\n",
    );
    process.exit(0);
  }
  process.stdout.write(
    `instantiate-template: ${total} placeholder occurrence(s) across ${remaining.size} key(s) await instantiation:\n`,
  );
  for (const [key, hits] of remaining)
    process.stdout.write(`  ${String(hits).padStart(4)}  ${key}\n`);
  process.exit(0);
}

if (mode !== "--export" && mode !== "--instantiate") {
  process.stderr.write(
    `instantiate-template: unknown mode ${JSON.stringify(mode)}; use --check, --export, or --instantiate.\n`,
  );
  process.exit(1);
}

const direction = mode === "--export" ? "export" : "instantiate";
const rules = rulesFor(direction);
const { files, directories } = walk(root);

/**
 * 计划重命名：先文件后目录，目录按深度自底向上。
 *
 * 文件改名不动父目录，子目录改名不动祖先，因此两步都不会让待处理路径失效。
 */
function planRenames() {
  const plan = [];
  for (const absolute of files) {
    if (SKIP_FILES.has(absolute)) continue;
    const name = basename(absolute);
    const { out } = apply(name, rules, direction);
    if (out !== name) plan.push({ absolute, target: join(dirname(absolute), out) });
  }
  for (const absolute of [...directories].sort((a, b) => b.length - a.length)) {
    const name = basename(absolute);
    const { out } = apply(name, rules, direction);
    if (out !== name) plan.push({ absolute, target: join(dirname(absolute), out) });
  }
  return plan;
}

// 内容先写盘：重命名会让原路径失效，顺序反过来会丢写入。
let changedFiles = 0;
let totalHits = 0;
for (const file of files) {
  if (SKIP_FILES.has(file)) continue;
  const before = readFileSync(file, "utf8");
  const { out, hits } = apply(before, rules, direction);
  if (out === before) continue;
  changedFiles += 1;
  totalHits += hits;
  if (!dryRun) writeFileSync(file, out);
}

const renamePlan = planRenames();
const renamed = [];
for (const { absolute, target } of renamePlan) {
  if (!existsSync(absolute) || existsSync(target)) continue;
  if (!dryRun) renameSync(absolute, target);
  renamed.push(`${absolute} -> ${target}`);
}

const verb = dryRun ? "would rewrite" : "rewrote";
process.stdout.write(
  `instantiate-template: ${direction} ${verb} ${changedFiles} file(s) (${totalHits} replacement(s)) and ${dryRun ? "would rename" : "renamed"} ${renamed.length} path(s).\n`,
);
for (const line of renamed) process.stdout.write(`  ${line}\n`);
