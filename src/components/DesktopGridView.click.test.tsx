import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DesktopGridView } from "@/components/DesktopGridView";
import { registerWidget } from "@/lib/widget-registry";
import type { WidgetItemData } from "@/lib/desktop-items";

/**
 * 磁贴点击与内部控件的关系。
 *
 * 需求：点击小部件的"非控件区域"打开弹窗；点击地点等控件时只走控件自身，
 * 不弹窗。拖拽排序刚结束时也不能顺带弹窗。
 */

const widget: WidgetItemData = {
  id: "w1",
  type: "widget",
  widgetType: "test-widget",
  title: "test",
  data: {},
  w: 2,
  h: 2,
};

/** 含"控件区 + 非控件区"的测试用小部件。 */
function FakeWidget() {
  return (
    <div className="fake-widget">
      <button data-testid="ctrl">地点</button>
      <div data-testid="plain">温度 27°</div>
    </div>
  );
}

describe("DesktopGridView 磁贴点击", () => {
  const onItemClick = vi.fn();

  beforeAll(() => {
    registerWidget("test-widget", {
      meta: { type: "test-widget", name: "test", description: "", icon: "test" },
      config: {
        defaultWidth: 200,
        defaultHeight: 150,
        minWidth: 100,
        minHeight: 100,
        maxWidth: 400,
        maxHeight: 400,
      },
      component: FakeWidget,
    });
  });

  beforeEach(() => {
    onItemClick.mockReset();
    // jsdom 没有 ResizeObserver
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderGrid = () =>
    render(<DesktopGridView items={[widget]} onMove={() => {}} onItemClick={onItemClick} />);

  it("fires the item click when the non-control area is clicked", () => {
    renderGrid();
    fireEvent.click(screen.getByTestId("plain"));
    expect(onItemClick).toHaveBeenCalledTimes(1);
    expect(onItemClick.mock.calls[0]![0]).toMatchObject({ id: "w1" });
  });

  it("does not fire the item click when a control is clicked", () => {
    renderGrid();
    fireEvent.click(screen.getByTestId("ctrl"));
    expect(onItemClick).not.toHaveBeenCalled();
  });

  it("does not fire after a drag ends", () => {
    const { container } = renderGrid();
    const tile = container.querySelector<HTMLElement>(".desktop-item")!;

    fireEvent.dragEnd(tile);
    fireEvent.click(tile);

    expect(onItemClick).not.toHaveBeenCalled();
  });
});
