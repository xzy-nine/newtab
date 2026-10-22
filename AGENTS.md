# AGENTS.md

本文件是 NewTab 对 agent 的常驻指令：只放**每个会话都需要在上下文里的命令**，每条一到三行，并链接它的正家。文档地图：本文（HOW）· [README.md](README.md)（面向用户）· [docs/](docs/AGENTS.md)（当前状态的参考页）· [.agents/notes/](.agents/notes/README.md)（决策记录）。

## 分层

指令分三层：常驻指令（本文件与各子树 `AGENTS.md`）、技能（[.agents/skills/](.agents/skills/)，按场景加载）、文档（[docs/](docs/AGENTS.md)，当前状态的事实）。各层放什么、一个事实归谁，见[层级分类](docs/AGENTS.md#the-tier-taxonomy-one-home-per-fact)。

## 项目

NewTab 是浏览器新标签页扩展：WXT + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + Zustand + `@reactuses/core`，Manifest v3。仓库文档、注释与提示词只用中文；扩展对外文案另有 `en` locale，走[国际化约定](docs/architecture.md#国际化)。目录与模块职责见[项目地图](docs/project-map.md)，架构约束与代码模式见[架构](docs/architecture.md)，测试布局见[测试](docs/testing.md)，设置项默认值以 `src/lib/app-settings.ts` 为准。

## 命令

```sh
pnpm install        # 安装依赖
pnpm run dev        # 开发服务器（Chrome）；dev:edge / dev:firefox 换目标浏览器
pnpm run build      # 构建（Chrome）；build:edge / build:firefox 换目标浏览器
pnpm run compile    # 仅类型检查
pnpm run test:unit  # 单元测试（Vitest + jsdom）
pnpm run knip       # 未使用文件、导出与依赖检查
pnpm run lint       # oxfmt 格式化 + oxlint 修复
pnpm run verify-all # 全部门禁（文档、Agent Note、技能、槽位）
pnpm run zip        # 打包 .zip；zip:edge / zip:firefox 换目标浏览器
```

## 不可协商的规则

- **文档、Agent Note 与技能遵守[文档标准](docs/AGENTS.md#writing-rules)。** 新增或修改任何文档前先读它，散文判断细则见[散文标准](.agents/skills/newtab-prose-standard/SKILL.md)。
- **决策留痕。** 影响长期维护的判断写入 [Agent Note](.agents/notes/README.md#何时需要写一份)；豁免情形也在那里。
- **规则必须可执行。** 新增一条被评审强制的规则时，同时给出它能变红的门禁；只靠人记的规则会被忘掉。
- **改代码就改它拥有的文档。** 配置、默认值、错误、对外行为在同一变更里更新对应 README 与 JSDoc。
- **共享状态必须有归属者。** 模块级缓存、单例、全局注册表都要挂到服务、实例或显式作用域上。
- **失败要结构化。** 定义失败类型、处理归属、遏制方式与失败后仍然成立的保证；只打日志不算恢复。
- **包管理器只用 pnpm。** 清单里的 `preinstall` 用 `only-allow pnpm` 拒绝其他包管理器。
- **注释与 UI 文案用中文。** UI 文本一律走[国际化约定](docs/architecture.md#国际化)，不在组件里硬编码展示文案。
- **UI 同时适配亮色、暗色与窄列布局。** 主题状态由 `useTheme` 统一驱动，不硬编码颜色。
- **样式层级顺序是契约。** 改样式前读[样式分层](docs/project-map.md#样式分层)。

## 校验

提交前按改动面选择最小充分证据，不要反射性地跑全量。CI 拥有穷尽矩阵。

| 改动                   | 最小证据                                        |
| ---------------------- | ----------------------------------------------- |
| 文档、Agent Note、技能 | `pnpm run verify-all`                           |
| 门禁脚本本身           | 该脚本的单元测试，加上一次故意违规的负向验证    |
| 组件、hooks、`src/lib` | `pnpm run compile` 与 `pnpm run test:unit`      |
| 样式分层               | `pnpm run build`，比对构建产物 CSS 与改动前一致 |
| 扩展清单、入口、权限   | `pnpm run build`，确认 manifest 与入口产物      |

**新增门禁必须自证**：写一个非法用例，看它变红，再回退。只证明它能通过，等于没证明它有用。
