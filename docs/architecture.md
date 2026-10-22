# 架构

本页记录跨模块的结构约束、状态归属与代码模式。目录布局与样式分层见[项目地图](project-map.md)，测试布局见[测试](testing.md)。

## 状态与子系统

| 子系统   | 归属                                                            | 契约                                                                               |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 设置     | `lib/app-settings-store.ts`（Zustand）→ `browser.storage.local` | 必须先 `hydrate()` 再读；默认值与开关以 `app-settings.ts` 为准                     |
| 小部件   | `lib/widget-registry.ts` + `widget-store.ts`                    | 动态注册；组件内用 `useWidgetRegistration()` 初始化，弹窗由 `WidgetPopupHost` 承载 |
| AI 助手  | `lib/ai/store.ts`                                               | 提供商配置与对话历史；分层与懒加载见[项目地图](project-map.md#ai-模块分层)         |
| 书签     | `hooks/useBookmarkFolders`                                      | 文件夹树、展开/折叠、固定状态；只读浏览器书签，不写回                              |
| 主题     | `hooks/useTheme`                                                | 亮色/暗色/跟随系统，响应系统主题变化                                               |
| 桌面网格 | `hooks/useDesktopGrid`                                          | 桌面图标布局与拖拽排序                                                             |
| 背景     | `components/background`                                         | Bing 每日壁纸、自定义图片、默认背景三种模式                                        |

扩展页面由 WXT 构建：`newtab.html`（新标签页）、`sidepanel.html`（侧边栏）、`background.ts`（后台脚本）。侧边栏复用同一套主桌面组件，窄列下自动内部滚动。

## 代码模式

### 设置

`useAppSettings` 选择性订阅，避免整表重渲染；开关与默认值以 `app-settings.ts` 为准。

```typescript
const theme = useAppSettings((s) => s.theme);
const setTheme = useAppSettings((s) => s.setTheme);

// 使用前需要 hydrate
useEffect(() => {
  hydrate();
}, [hydrate]);
```

### 小部件注册与主题

```typescript
useWidgetRegistration(); // 在组件中注册小组件
useTheme(); // 在根组件中调用，自动跟随系统主题
```

### 书签文件夹

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
} = useBookmarkFolders();
```

## 依赖与库选择

- **AI 一律复用成熟库，不手写协议。** `ai` + `@ai-sdk/openai-compatible` 负责请求构造、SSE 流式解析、`reasoning_content` 与错误体；`zod` 校验存储、接口响应与设置项；`react-markdown` + `remark-gfm` 渲染 Markdown（不用 `dangerouslySetInnerHTML`）；`react-textarea-autosize` 自适应输入框高度。
- **通用 hooks 用 `@reactuses/core`**（如 `useClickOutside`、`useAsyncEffect`），不重复实现。
- **代码需兼容 Chromium 扩展环境**：没有 Node 运行时，受限的 CSP，后台脚本按 Manifest v3 service worker 语义运行。

## 国际化

- 扩展 UI 文本写入 `_locales/` 的 `messages.json`（`zh_CN` 与 `en`），用 `lib/i18n.ts` 的 `getMessage()` 取用；默认语言是 `zh_CN`。
- 业务逻辑中的中文文本可以直接书写，无需进入 `messages.json`。
- 新增可见文案要同时补两种语言，并检查无障碍名称、tooltip 与 placeholder。

## 扩展清单

Manifest v3（WXT 生成）。权限：`storage`、`bookmarks`、`activeTab`、`tabs`、`sidePanel`、`declarativeNetRequestWithHostAccess`；host 权限为 `https://*/*` 与 `http://*/*`。新增权限需要同时说明它换来的能力，因为每次安装都会向用户展示。
