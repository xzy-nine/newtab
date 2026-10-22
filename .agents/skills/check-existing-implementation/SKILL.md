---
name: "check-existing-implementation"
description: "在创建新 API、模块或组件前检查 src/lib、src/components 与 src/hooks 是否已有实现，避免重复造轮子。当计划新增模块、工具函数或组件时调用。"
---

# 检查现有实现

在写新文件之前，先确认这个能力是否已经有家。NewTab 的分层是 `src/lib`（数据与纯逻辑）、`src/hooks`（跨组件状态）、`src/components`（UI），同一种职责通常已经有归属者。

## 使用场景

- 计划新增 API、模块、hook 或组件
- 怀疑某功能与现有实现重叠
- 需要确认某个工具函数应该扩展还是新建

## 使用方法

1. 按职责定位候选目录：数据、协议与持久化在 `src/lib`（AI 在 `src/lib/ai/`，越界接口只经 `index.ts`）；共享状态与浏览器能力封装在 `src/hooks`；UI 在 `src/components`，小部件在 `src/components/widgets/<name>/`。
2. 先搜符号再搜路径：用 `rg` 搜函数名、设置项键、`widget-registry.ts` 里的注册项与 `app-settings.ts` 的默认值，再列出目标目录确认命名与分层。
3. 命中时优先扩展拥有者：把新行为加进已有模块或 hook，并保持它对组件的导出面不变；不要为相似逻辑再开一个平行模块。
4. 未命中时才新建，并遵循现有分层与命名：纯逻辑与数据放 `src/lib`，跨组件状态放 `src/hooks`，UI 放 `src/components`；测试位置按[测试约定](../../../docs/testing.md)。
5. 新增外部依赖前先确认既有依赖是否已覆盖该职责，AI 相关一律复用 `ai`、`@ai-sdk/openai-compatible`、`zod` 等成熟库。

## 判定证据

复用的是行为，不是文件名。确认候选实现覆盖所需语义（默认值、失败处理、持久化边界）后再决定扩展；语义不同就写新模块，并在提交说明里指出两者的差别。
