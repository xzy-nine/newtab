/**
 * 用 jscpd 扫描 `src/`，出现基线之外的克隆即失败。
 *
 * 基线记录已接受的重复：文件对、片段行数与片段内容摘要构成指纹，指纹不含行号，
 * 因此无关改动与检出时的换行风格都不会让它失效。
 *
 * 指纹按出现次数比对而非存在与否：jscpd 把一处重复按相邻窗口拆成多条克隆，
 * 只比对存在与否会让基线随首处重复的克隆条数变化而误判。
 *
 * 基线只允许调低。确需保留的重复用 `--update` 调高，并在提交信息里说明理由。
 *
 * @module scripts/verify-duplication
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectClones } from "jscpd";
import { repoRoot } from "./doc-system.config.ts";

/** 扫描下限；改动会让既有基线整体失效。 */
const MIN_LINES = 5;
const MIN_TOKENS = 50;

/** 被扫描的相对仓库目录。 */
const SCAN_DIRECTORY = "src";

/**
 * 扫描格式。
 *
 * `.tsx` 不在 `typescript` 格式内：只列前者时组件文件整体不参与比对。
 */
const SCAN_FORMATS = ["typescript", "tsx"];

/** 基线文件相对仓库的路径。 */
const BASELINE_PATH = "duplication-baseline.json";

/** 基线文件的形状。 */
interface Baseline {
  minLines: number;
  minTokens: number;
  count: number;
  fingerprints: string[];
}

/** 一处克隆的一侧。 */
interface CloneSide {
  /** jscpd 给出的绝对路径。 */
  sourceId: string;
  start: { line: number };
  end: { line: number };
  /** 片段源码。 */
  fragment?: string;
}

/** 一处克隆。 */
interface Clone {
  duplicationA: CloneSide;
  duplicationB: CloneSide;
}

/**
 * 扫描 `src/` 下的克隆。
 *
 * 路径统一为正斜杠：jscpd 对 Windows 反斜杠绝对路径返回空列表而不报错。
 * @returns 克隆列表。
 */
async function scanClones(): Promise<Clone[]> {
  const target = join(repoRoot, SCAN_DIRECTORY).split("\\").join("/");
  return (await detectClones({
    path: [target],
    minLines: MIN_LINES,
    minTokens: MIN_TOKENS,
    format: SCAN_FORMATS,
    silent: true,
    reporters: [],
  })) as unknown as Clone[];
}

/**
 * 计算片段内容摘要。
 *
 * 先归一化行尾再摘要：同一片段在 CRLF 与 LF 检出上文本不同。两侧片段按字节序
 * 排序后拼接，使摘要与哪一侧是 `duplicationA` 无关。
 * @param a - 第一侧片段文本。
 * @param b - 第二侧片段文本。
 * @returns 摘要的前 16 位十六进制。
 */
function fragmentDigest(a: string, b: string): string {
  const normalize = (text: string): string => text.replace(/\r\n?/g, "\n");
  const first = normalize(a);
  const second = normalize(b);
  const [head, tail] = first <= second ? [first, second] : [second, first];
  return createHash("sha256").update(`${head}\u0000${tail}`).digest("hex").slice(0, 16);
}

/**
 * 一处克隆占用的行数。
 *
 * 取两侧中较小者；jscpd 对跨嵌套结构的克隆会给出两端倒置的行号，故取绝对值。
 * @param clone - 克隆。
 * @returns 片段行数。
 */
function cloneLines(clone: Clone): number {
  const span = (side: CloneSide): number => Math.abs(side.end.line - side.start.line) + 1;
  return Math.min(span(clone.duplicationA), span(clone.duplicationB));
}

/**
 * 计算克隆指纹：文件对、行数与片段摘要。文件对按字典序拼接，与 A/B 归属无关。
 * @param clone - 克隆。
 * @param root - 仓库绝对根路径，用于把 `sourceId` 折成相对路径。
 * @returns 指纹。
 */ function cloneFingerprint(clone: Clone, root: string = repoRoot): string {
  const pair = [clone.duplicationA.sourceId, clone.duplicationB.sourceId]
    .map((name) => name.slice(root.length + 1).replaceAll("\\", "/"))
    .sort()
    .join("|");
  const digest = fragmentDigest(
    clone.duplicationA.fragment ?? "",
    clone.duplicationB.fragment ?? "",
  );
  return `${pair}|${cloneLines(clone)}|${digest}`;
}

/**
 * 统计指纹出现次数。
 * @param list - 指纹数组。
 * @returns 指纹到次数的映射。
 */
function countByFingerprint(list: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of list) counts.set(item, (counts.get(item) ?? 0) + 1);
  return counts;
}

/**
 * 列出相对基线新增的指纹。
 *
 * 同一指纹当前次数超出基线次数时，超出的部分逐条计为新增。
 * @param current - 当前指纹。
 * @param baseline - 已接受的指纹。
 * @returns 新增指纹，按超出的次数重复列出。
 */
function addedFingerprints(current: readonly string[], baseline: readonly string[]): string[] {
  const known = countByFingerprint(baseline);
  const added: string[] = [];
  for (const [item, times] of countByFingerprint(current)) {
    for (let index = known.get(item) ?? 0; index < times; index += 1) added.push(item);
  }
  return added;
}

/**
 * 读取并校验基线。
 *
 * 扫描参数与脚本不一致时基线整体失效，须按当前参数重写，因此这里直接判失败。
 * @returns 基线；文件缺失时为 null。
 */
function readBaseline(): Baseline | null {
  const path = join(repoRoot, BASELINE_PATH);
  if (!existsSync(path)) return null;
  const baseline = JSON.parse(readFileSync(path, "utf8")) as Baseline;
  if (baseline.minLines !== MIN_LINES || baseline.minTokens !== MIN_TOKENS) {
    console.error(
      `[duplication] 基线的扫描参数与脚本不一致（基线 ${baseline.minLines}/${baseline.minTokens}，脚本 ${MIN_LINES}/${MIN_TOKENS}）；按当前参数执行 --update 重写基线`,
    );
    process.exit(1);
  }
  return baseline;
}

/** 按当前扫描结果重写基线。 */
function writeBaseline(fingerprints: readonly string[]): void {
  writeFileSync(
    join(repoRoot, BASELINE_PATH),
    `${JSON.stringify(
      {
        note: "当前已接受的重复；只允许调低。调高须先确认无法消除，并在提交信息里说明理由。",
        minLines: MIN_LINES,
        minTokens: MIN_TOKENS,
        count: fingerprints.length,
        fingerprints,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const current = (await scanClones()).map((clone) => cloneFingerprint(clone)).sort();

  if (process.argv.includes("--update")) {
    writeBaseline(current);
    console.log(`[duplication] 基线已更新：${current.length} 处`);
    process.exit(0);
  }

  const baseline = readBaseline();
  if (baseline === null) {
    console.error(
      `[duplication] 缺少基线文件 ${join(repoRoot, BASELINE_PATH)}；先执行 pnpm run verify-duplication -- --update`,
    );
    process.exit(1);
  }

  const added = addedFingerprints(current, baseline.fingerprints ?? []);
  if (added.length > 0) {
    console.error(
      `[duplication] 新增 ${added.length} 处重复（基线 ${baseline.count} 处，当前 ${current.length} 处）：`,
    );
    for (const item of added) console.error(`  - ${item}`);
    console.error("消除重复后重试；确需保留时用 --update 调高基线并说明理由。");
    process.exit(1);
  }

  console.log(`[duplication] 通过：${current.length} 处，未超出基线 ${baseline.count} 处`);
}
