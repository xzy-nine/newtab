/**
 * git hook 的分级门禁。
 *
 * 提交与推送执行同一份门禁清单的两个级别：提交只跑秒级检查，推送跑完整校验。
 * 分级让高频动作保持快，同时保证被拦下的问题与 CI 一致——两级合起来覆盖
 * `test.yml` 的全部阻断点，因此本地能过的东西不会在 CI 才红。
 *
 * 用 `.mjs` 而非 `scripts/` 下的 `.ts`：hook 在 `pnpm install` 完成前也可能被调用，
 * 不该依赖 tsx 加载器。
 *
 * 用法：node scripts/run-hooks.mjs <pre-commit|pre-push>
 *   退出码 1 表示该级别有门禁失败，调用方据此中止 git 操作。
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 一个级别的门禁清单；顺序即执行顺序。 */
const LEVELS = {
  "pre-commit": [
    { name: "oxlint", args: ["exec", "oxlint", "."], purpose: "规则违规" },
    { name: "knip", args: ["run", "knip"], purpose: "未使用的文件、导出与依赖" },
  ],
  "pre-push": [
    { name: "compile", args: ["run", "compile"], purpose: "类型错误" },
    {
      name: "verify-all",
      args: ["run", "verify-all"],
      purpose: "文档、Agent Note、技能与重复代码",
    },
    { name: "test:unit", args: ["run", "test:unit"], purpose: "单元测试失败" },
  ],
};

const level = process.argv[2];
const gates = LEVELS[level];

if (gates === undefined) {
  console.error(
    `run-hooks: 未知级别 ${level ?? "<空>"}；可用级别：${Object.keys(LEVELS).join(", ")}`,
  );
  process.exit(1);
}

const failures = [];

for (const gate of gates) {
  console.log(`[${level}] ${gate.name}：检查${gate.purpose}…`);
  const result = spawnSync("pnpm", gate.args, {
    cwd: root,
    encoding: "utf8",
    // Windows 下 pnpm 是 .cmd 垫片，必须经 shell 才能解析。
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failures.push({ gate, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() });
  }
}

if (failures.length === 0) {
  console.log(`[${level}] 通过：${gates.length} 项门禁`);
  process.exit(0);
}

console.error(`\n[${level}] ${failures.length} 项门禁失败：`);
for (const { gate, output } of failures) {
  console.error(`\n── ${gate.name}（${gate.purpose}）`);
  if (output !== "") {
    for (const line of output.split("\n")) console.error(`   ${line}`);
  }
}
console.error("\n修复后重试；确需跳过时用 --no-verify。");
process.exit(1);
