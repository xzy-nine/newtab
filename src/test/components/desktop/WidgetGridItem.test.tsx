import { describe, it, expect, beforeAll, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopGridView } from "@/components/desktop/DesktopGridView";
import { registerWidget } from "@/lib/widget-registry";
import { WIDGET_TILE_HEIGHT } from "@/lib/widget-layout";
import type { WidgetItemData } from "@/lib/desktop-items";

/**
 * 小部件磁贴高度的回归测试。
 *
 * 需求：桌面上所有小部件磁贴采用统一高度，且传给组件的 containerHeight
 * 必须与真实外显高度一致——否则组件内部基于高度的高度模式判定会失真。
 */

/**
 * 探针小部件：把收到的尺寸写进 DOM，供断言读取。
 *
 * 不用模块级变量记录 props——渲染期写外部变量属于副作用，会被 lint 拦截。
 */
function ProbeWidget(props: { containerWidth?: number; containerHeight?: number }) {
  return (
    <div
      data-testid="probe"
      data-width={String(props.containerWidth)}
      data-height={String(props.containerHeight)}
    >
      probe
    </div>
  );
}

const item: WidgetItemData = {
  id: "w1",
  type: "widget",
  widgetType: "layout-probe-widget",
  title: "probe",
  data: {},
  w: 2,
  h: 2,
};

describe("WidgetGridItem 磁贴高度", () => {
  /** jsdom 无布局，clientWidth 恒为 0；这里给容器一个真实宽度让列数换算生效。 */
  const STUB_CONTAINER_WIDTH = 800;

  beforeAll(() => {
    registerWidget("layout-probe-widget", {
      meta: { type: "layout-probe-widget", name: "probe", description: "", icon: "probe" },
      config: {
        defaultWidth: 200,
        defaultHeight: 150,
        minWidth: 100,
        minHeight: 100,
        maxWidth: 400,
        maxHeight: 400,
      },
      component: ProbeWidget,
    });
    // jsdom 没有 ResizeObserver
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => STUB_CONTAINER_WIDTH,
    });
  });

  it("gives every widget the same tile height and passes it down", () => {
    const { container } = render(<DesktopGridView items={[item]} onMove={() => {}} />);

    const tile = container.querySelector<HTMLElement>(".widget-tile");
    expect(tile).not.toBeNull();
    // 磁贴外显高度 = 统一基准
    expect(tile!.style.height).toBe(`${WIDGET_TILE_HEIGHT}px`);

    const probe = screen.getByTestId("probe");
    // 传给组件的 containerHeight 必须与磁贴高度同源，紧凑判定才可信
    expect(probe.dataset.height).toBe(String(WIDGET_TILE_HEIGHT));

    // 宽度仍按列数换算：cols=8, unit=(800-14*7)/8=87.75,
    // cellW = 2*87.75 + 14 - 8 = 181.5（与高度基准互不影响）
    expect(Number(probe.dataset.width)).toBeCloseTo(181.5, 5);
  });
});
