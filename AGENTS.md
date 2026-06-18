# AGENTS.md

文档地图：`AGENTS.md`（本文，HOW）· `README.md`（面向用户）· `src/lib/app-settings.ts`（设置项默认值）

## Project Overview

newtab 是一个浏览器新标签页扩展，提供自定义桌面、AI 助手、书签管理、时钟小组件、搜索引擎、主题管理等功能。使用 WXT、React 19、TypeScript、Tailwind CSS 4、shadcn/ui、Zustand 和 `@reactuses/core` 构建。

## 开发者命令

```bash
bun run dev           # Start dev server (Chrome)
bun run dev:edge      # Start dev server (Edge)
bun run dev:firefox   # Start dev server (Firefox)
bun run build         # Build for Chrome/Chromium
bun run build:edge    # Build for Edge
bun run build:firefox # Build for Firefox
bun run test:unit     # Run unit tests (Vitest + jsdom)
bun run test:watch    # Run tests in watch mode
bun run compile       # TypeScript type check only
bun run lint          # Format + lint with oxfmt/oxlint
bun run knip          # Find unused files/exports/dependencies
bun run zip           # Package as .zip (Chrome)
bun run zip:edge      # Package as .zip (Edge)
bun run zip:firefox   # Package as .zip (Firefox)
```

- 包管理器使用 **bun**（项目已配置 `only-allow bun`）

## 验证顺序

lint → typecheck → test → build

## 项目结构

```
src/
├── entrypoints/       # newtab, sidepanel, background
├── components/
│   ├── ui/            # shadcn
│   └── widgets/       # CounterWidget, NoteWidget, TimerWidget
├── hooks/             # useTheme, useBookmarkFolders, useDesktopGrid, useContextMenu
├── lib/
│   ├── app-settings.ts / app-settings-store.ts
│   ├── ai-store.ts
│   ├── widget-store.ts / widget-registry.ts
│   ├── i18n.ts / icon-manager.ts / notification.ts
│   └── data-sync.ts / search-suggestions.ts / dialog-z-index.ts
└── test/
```

## 架构注意事项

- **Extension Pages**: WXT 构建的新标签页和侧边栏页面
- **Settings Store**: `app-settings-store.ts` → `browser.storage.local`; 调用 `hydrate()` 后使用
- **Widget System**: `widget-registry.ts` + `widget-store.ts` → 动态小组件注册和状态管理
- **AI Assistant**: `ai-store.ts` → AI 提供商配置和对话历史
- **Bookmark Management**: `useBookmarkFolders` hook → 书签文件夹树和固定功能
- **Theme System**: `useTheme` hook → 亮色/暗色/系统主题切换
- **Desktop Grid**: `useDesktopGrid` hook → 桌面图标网格布局

## 关键模式

- **Hooks**: 优先使用 `@reactuses/core` 而非重新实现通用 hooks
- **Components**: 主要组件包括 `NewTab`、`SidePanel`、`DesktopSystem`、`Dock`、`NotificationCenter`
- **Widgets**: 小组件系统支持动态注册，包括计时器、笔记、计数器等
- **Background**: Bing 每日壁纸、自定义图片、默认背景三种模式
- **Search**: 多搜索引擎支持，可自定义添加
- **AI**: 支持多个 AI 提供商（DeepSeek、OpenAI 等），可配置 API 和模型

## Code Patterns

### Settings

`useAppSettings` 选择性订阅；开关与默认值以 `app-settings.ts` 为准。

```typescript
const theme = useAppSettings((s) => s.theme)
const setTheme = useAppSettings((s) => s.setTheme)

// 使用前需要 hydrate
useEffect(() => {
  hydrate()
}, [hydrate])
```

### Widget Registration

小组件通过 `widget-registry.ts` 注册，使用 `useWidgetRegistration` hook 初始化。

```typescript
// 在组件中注册小组件
useWidgetRegistration()
```

### Theme Management

使用 `useTheme` hook 管理主题，自动响应系统主题变化。

```typescript
useTheme() // 在根组件中调用
```

### Bookmark Folders

书签文件夹使用 `useBookmarkFolders` hook 管理，支持文件夹树、展开/折叠、固定等功能。

```typescript
const {
  currentFolder,
  folders,
  folderTree,
  expandedFolders,
  pinnedFolders,
  toggleFolder,
  selectFolder,
  pinFolder,
  unpinFolder,
} = useBookmarkFolders()
```

## 测试

- Vitest + `jsdom`; setup: `src/test/setup.ts`
- Tests: `*.test.ts` / `*.spec.ts` alongside source; components use `@testing-library/react`

## 代码质量

- **Linter**: oxlint (typescript, unicorn, oxc, react, react-perf plugins)
- **Formatter**: oxfmt (no semicolons, single quotes, trailing comma es5)
- **TypeScript**: extends `.wxt/tsconfig.json`

## 浏览器扩展说明

- Manifest v3 (WXT)
- Permissions: `storage`, `bookmarks`, `activeTab`, `tabs`, `sidePanel`, `declarativeNetRequestWithHostAccess`
- Host permissions: `https://*/*`, `http://*/*`
- Default locale: `zh_CN`
- Entry points:
  - `newtab.html` - 新标签页
  - `sidepanel.html` - 侧边栏
  - `background.ts` - 后台脚本

## 国际化说明

- 支持中文（zh_CN）和英文（en）
- 扩展本身的 UI 文本需要在 `_locales/` 中添加键值
- 业务逻辑中的中文文本可以直接使用，无需添加到 messages.json
- 使用 `getMessage()` 函数获取国际化文本

## AI 提示词建议

- 代码需兼容 Chromium 浏览器扩展环境
- 保持模块化，优先复用已有工具函数
- UI 需适配暗色/亮色主题，遵循响应式设计
- 新增功能需支持国际化（i18n），文本请用 `lib/i18n.ts` 相关方法处理
- 交互逻辑尽量解耦，便于后续维护和扩展
- 代码注释请用中文使用 JSDoc 格式，便于辨认
