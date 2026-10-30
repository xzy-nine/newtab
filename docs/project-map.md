# 项目地图

本页描述 NewTab 的目录布局、模块职责与样式分层。跨模块约束、代码模式与扩展清单见[架构](architecture.md)，测试布局见[测试](testing.md)。

## 目录结构

```
src/
├── entrypoints/       # newtab, sidepanel, background
├── assets/
│   ├── global.css     # 全局样式入口，只转发到 styles/index.css
│   └── styles/        # 分层样式（index.css 是唯一聚合入口）
│       ├── foundation/  # theme(设计令牌) / glass(玻璃) / base / dark
│       ├── desktop/     # surface / folder-panel / home
│       ├── components/  # dock / dock-layer / folder-tree / folder-popup
│       └── widgets/     # clock / weather / activity / rss
├── components/
│   ├── ui/              # shadcn 基础组件
│   ├── ai/              # AI 助手 UI（AIAssistant / AIChatPanel / 子组件）
│   ├── widgets/         # 每个小部件一个子目录
│   │   ├── counter/     # CounterWidget.tsx
│   │   ├── timer/       # TimerWidget.tsx
│   │   ├── note/        # NoteWidget.tsx
│   │   ├── weather/     # WeatherWidget.tsx + weather.ts（数据与纯逻辑）
│   │   ├── activity/    # ActivityWidget.tsx + activity.ts（数据与纯逻辑）
│   │   └── rss/         # RssWidget.tsx + RssFeedPopup.tsx + rss.ts（数据与纯逻辑）
│   ├── shell/           # 页面外壳（NewTab / SidePanel / SidePanelHome）
│   ├── desktop/         # 桌面系统（DesktopWorkspace / HomeDesktop / DesktopGridView / DesktopItemViews）
│   ├── dock/            # Dock 栏与文件夹浮层（Dock / DockFolderLayer）
│   ├── folder/          # 文件夹树与弹窗（FolderTreeView / FolderPopup）
│   ├── background/      # 背景与背景设置（Background / BackgroundSettings）
│   ├── settings/        # 设置面板（SettingsPanel / UapiSettings）
│   ├── search/          # 搜索框（SearchBox）
│   ├── browser/         # 侧边栏浏览器视图（BrowserView）
│   ├── notification/    # 通知中心（NotificationCenter）
│   ├── clock/           # 时钟小组件（ClockWidget）
│   └── widget-system/   # 小部件注册与弹窗宿主（WidgetSystem / WidgetPopupHost）
├── hooks/             # useTheme, useBookmarkFolders, useDesktopGrid, useContextMenu
├── lib/
│   ├── app-settings.ts / app-settings-store.ts
│   ├── ai/            # AI 模块（见下）
│   ├── widget-registry.ts
│   ├── i18n.ts / icon-manager.ts / notification.ts
│   └── data-sync.ts / search-suggestions.ts / dialog-z-index.ts
└── test/              # 集中测试，目录层级镜像 src/（见测试页）
    ├── setup.ts       # Vitest setup（jsdom 补丁 + jest-dom matchers）
    ├── components/    # 对应 src/components 的层级
    └── lib/           # 对应 src/lib 的层级
```

## AI 模块分层

`src/lib/ai/` 自下而上分层，只通过 `index.ts` 对组件暴露最小接口。

| 文件               | 职责                                           |
| ------------------ | ---------------------------------------------- |
| `types.ts`         | 纯类型（消息、对话、回调）                     |
| `errors.ts`        | `APICallError` → 用户可读文案                  |
| `providers.ts`     | 提供商配置 → AI SDK 模型句柄（baseURL 收敛等） |
| `models.ts`        | 模型能力判定与 `/v1/models` 查询               |
| `persistence.ts`   | 对话历史读写 + zod 校验                        |
| `quick-prompts.ts` | 快捷提示词解析（纯文本 / JSON 字符串）         |
| `chat.ts`          | 流式对话、标题生成等用例编排                   |
| `store.ts`         | Zustand 状态编排                               |

`components/ai/AIAssistant` 通过 `lazy` + `Suspense` 懒加载整套 AI SDK，入口按钮 `hover`/`focus` 时用 `preloadAIChatPanel()` 预取，避免拖累新标签页首屏。

## 样式分层

`src/assets/styles/index.css` 是唯一的样式聚合入口，`global.css` 只转发到它：各层级文件的 `@import` 顺序即层叠优先级，必须沿用现有书写顺序（已非按目录分组），重排会静默改变样式。改动后比对构建产物 CSS 与改动前一致。
