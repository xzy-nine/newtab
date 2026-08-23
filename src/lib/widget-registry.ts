import type { ComponentType } from "react";

export interface WidgetMeta {
  type: string;
  name: string;
  description: string;
  icon: string;
}

export interface WidgetConfig {
  defaultWidth: number;
  defaultHeight: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

export interface WidgetComponentProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

export interface WidgetDefinition {
  meta: WidgetMeta;
  config: WidgetConfig;
  component: ComponentType<WidgetComponentProps>;
}

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(type: string, def: WidgetDefinition) {
  // 幂等注册：同一类型已注册则直接跳过，避免 StrictMode 双调用或页面间重复
  // 注册时反复触发"已注册"警告并覆盖定义。相同类型使用同一实现，无覆盖必要。
  if (registry.has(type)) return;
  registry.set(type, def);
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

export function getAllTypes(): WidgetMeta[] {
  return Array.from(registry.values()).map((d) => d.meta);
}

export function getWidgetConfig(type: string): WidgetConfig | undefined {
  return registry.get(type)?.config;
}

export function hasWidget(type: string): boolean {
  return registry.has(type);
}
