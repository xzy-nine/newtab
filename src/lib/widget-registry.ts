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

/**
 * 小部件可选的"展开弹窗"能力。
 *
 * 适合纯展示型、但带有大量附加数据的接口类小部件：磁贴上只放摘要，
 * 展开后才去拉取/展示扩展数据（例如天气的逐小时与逐天预报），
 * 以节省免费 API 配额。
 *
 * 组件在弹窗内挂载时才应发起这类按需请求。
 */
export interface WidgetPopup {
  /** 弹窗标题；缺省用 meta.name。 */
  title?: string;
  /** 弹窗内容组件，仅在弹窗打开时挂载。 */
  content: ComponentType<WidgetComponentProps>;
  /** 弹窗宽度类名（Tailwind），缺省 max-w-lg。 */
  contentClassName?: string;
}

export interface WidgetDefinition {
  meta: WidgetMeta;
  config: WidgetConfig;
  component: ComponentType<WidgetComponentProps>;
  /**
   * 提供后，小部件磁贴会出现"展开"入口，点击弹出该内容。
   * 未提供即不支持展开。
   */
  popup?: WidgetPopup;
}

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(type: string, def: WidgetDefinition) {
  if (registry.has(type)) {
    console.warn(`小部件 "${type}" 已注册，将被覆盖`);
  }
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

/** 取小部件的展开弹窗定义；未声明时返回 undefined。 */
export function getWidgetPopup(type: string): WidgetPopup | undefined {
  return registry.get(type)?.popup;
}

/** 小部件是否支持展开弹窗。 */
export function hasWidgetPopup(type: string): boolean {
  return Boolean(registry.get(type)?.popup);
}
