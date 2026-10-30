# 测试

测试运行在 Vitest + jsdom 上，全局 setup 在 `src/test/setup.ts`（jsdom 补丁 + jest-dom matchers）。

## 布局

- 测试文件全部集中在 `src/test/` 下，不与被测源码同目录；目录层级镜像 `src/`，便于按模块定位（如 `src/test/lib/ai/chat.test.ts` ↔ `src/lib/ai/chat.ts`）。
- 文件名用 `*.test.ts` 或 `*.spec.ts`。
- 测试内一律用 `@/` 别名引用源码与被 mock 模块，不用 `./`、`../` 相对路径。
- 组件测试用 `@testing-library/react`；纯逻辑测试不渲染组件。
- `tsconfig.json` 不排除 `src/test`，因此 `pnpm run compile` 会一并类型检查测试代码。

## 运行

`pnpm run test:unit` 跑一次性全量（带 `--passWithNoTests`），`pnpm run test:watch` 进入监听模式。全量校验顺序是 lint → compile → test:unit → build；局部改动按根 [AGENTS.md](../AGENTS.md#校验)的表格选择最小充分证据。

<a id="git-hooks"></a>

## git hook

`scripts/run-hooks.mjs` 分级执行门禁，与 `.github/workflows/test.yml` 的阻断点一一对应：

| 级别         | 门禁                                 | 耗时     |
| ------------ | ------------------------------------ | -------- |
| `pre-commit` | `oxlint`、`knip`                     | 约 3 秒  |
| `pre-push`   | `compile`、`verify-all`、`test:unit` | 约 22 秒 |

提交级只跑秒级检查，推送级补齐 CI 的全部阻断点，因此本地通过的东西不会在 CI 才红。级别失败即中止 git 操作，`--no-verify` 可跳过。
