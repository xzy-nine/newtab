import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  WIDGET_COMPACT_HEIGHT,
  WIDGET_COMPACT_WIDTH,
  WIDGET_PADDING_COMPACT,
  WIDGET_PADDING_REGULAR,
  WIDGET_TILE_HEIGHT,
  isCompactSize,
  resolveWidgetSizeMode,
  widgetPadding,
} from "@/lib/widget-layout";

/**
 * 按 index.css 的导入顺序读取全部层级样式，拼成等效于拆分前 global.css 的文本。
 * 层级化后样式不再集中在一个文件，测试若只读单个文件会在下次拆分时静默失效。
 */
function readLayerCss(): string {
  const stylesDir = resolve(process.cwd(), "src/assets/styles");
  const index = readFileSync(join(stylesDir, "index.css"), "utf8");
  const files = [...index.matchAll(/@import\s+"\.\/([^"]+\.css)"/g)].map((m) => m[1]);
  if (files.length === 0) throw new Error("styles/index.css 未导入任何层级文件");
  return files.map((file) => readFileSync(join(stylesDir, file), "utf8")).join("\n");
}

/**
 * 小部件统一高度模式的回归测试。
 *
 * 需求：计时器、计数器、便签这三个旧组件与新组件（天气、活动）共用
 * 同一套高度判定；旧组件不能再各自写死阈值，也不能完全忽略传入尺寸；
 * 桌面小部件磁贴还要与文件夹磁贴等高（第二行 = 第三行）。
 */

describe("resolveWidgetSizeMode", () => {
  it("treats a tile at the unified height as regular", () => {
    // 桌面磁贴统一按 WIDGET_TILE_HEIGHT 渲染，常规宽度下必须是常规模式
    expect(resolveWidgetSizeMode({ width: 200, height: WIDGET_TILE_HEIGHT })).toBe("regular");
  });

  it("is compact when the width is below the shared threshold", () => {
    expect(resolveWidgetSizeMode({ width: WIDGET_COMPACT_WIDTH - 1, height: 300 })).toBe("compact");
    // 阈值本身算常规
    expect(resolveWidgetSizeMode({ width: WIDGET_COMPACT_WIDTH, height: 300 })).toBe("regular");
  });

  it("is compact when the height is below the shared threshold", () => {
    // 旧计时器只看宽，这里按统一规则必须也考虑高度
    expect(resolveWidgetSizeMode({ width: 300, height: WIDGET_COMPACT_HEIGHT - 1 })).toBe(
      "compact",
    );
    expect(resolveWidgetSizeMode({ width: 300, height: WIDGET_COMPACT_HEIGHT })).toBe("regular");
  });

  it("falls back to regular when the size is unknown", () => {
    // 缺省渲染（如弹窗内未传尺寸）不该被误判为紧凑
    expect(resolveWidgetSizeMode()).toBe("regular");
    expect(resolveWidgetSizeMode({})).toBe("regular");
  });

  it("ignores non-numeric dimensions", () => {
    expect(isCompactSize({ width: undefined, height: undefined })).toBe(false);
    expect(isCompactSize({ width: 120, height: Number.NaN })).toBe(true);
  });
});

describe("widgetPadding", () => {
  it("uses the compact padding only in compact mode", () => {
    expect(widgetPadding("compact")).toBe(`${WIDGET_PADDING_COMPACT}px`);
    expect(widgetPadding("regular")).toBe(`${WIDGET_PADDING_REGULAR}px`);
  });

  it("keeps the regular padding larger than the compact one", () => {
    // 两个值一旦写反，常规磁贴会比紧凑磁贴还挤
    expect(WIDGET_PADDING_REGULAR).toBeGreaterThan(WIDGET_PADDING_COMPACT);
  });
});

describe("WIDGET_TILE_HEIGHT", () => {
  it("is a usable pixel height and not a compact height", () => {
    // 磁贴基准高度必须大于紧凑阈值，否则桌面上所有小部件都会退化成紧凑模式
    expect(WIDGET_TILE_HEIGHT).toBeGreaterThan(WIDGET_COMPACT_HEIGHT);
    expect(WIDGET_TILE_HEIGHT).toBeGreaterThan(0);
  });

  it("matches the CSS tile-height variable the folder row uses", () => {
    // 桌面第三行（小部件）必须与第二行（文件夹磁贴）等高：
    // CSS 里 --desktop-tile-height 同时被文件夹面板与小部件磁贴引用，
    // 一旦只改一边，两行就会再次错位。
    // jsdom 环境下 import.meta.url 不是 file: URL，因此按 cwd（项目根）定位样式文件。
    // 样式已按层级拆分到 src/assets/styles/ 下，这里读取全部层级文件拼接后的文本，
    // 使得后续再拆分/挪动文件时该回归测试依然有效。
    const css = readLayerCss();
    const declared = css.match(/--desktop-tile-height:\s*(\d+)px/);
    expect(declared).not.toBeNull();
    expect(Number(declared![1])).toBe(WIDGET_TILE_HEIGHT);

    // 文件夹面板与预览态都必须引用变量，而不是各自写死像素值
    const panel = css.match(/\.desktop-folder-panel\s*\{[^}]*height:\s*([^;]+);/);
    expect(panel?.[1].trim()).toBe("var(--desktop-tile-height)");
    const preview = css.match(/\.desktop-item\.is-folder-preview\s*\{[^}]*height:\s*([^;]+);/);
    expect(preview?.[1].trim()).toBe("var(--desktop-tile-height)");
  });
});
