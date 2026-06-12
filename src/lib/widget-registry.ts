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
  if (registry.has(type)) {
    console.warn(`小部件类型 "${type}" 已注册，将被覆盖`);
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
