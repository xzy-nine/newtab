import { describe, it, expect } from "vitest";
import { isDragBlockedTarget, isInteractiveTarget } from "@/lib/dom-interaction";

/**
 * 磁贴拖拽与内部控件的冲突判定。
 *
 * 磁贴本身可拖拽（排序用）；若在内部输入框上按下时仍允许拖拽，
 * 浏览器会把它当作拖拽起点，导致输入框无法获得焦点——这正是
 * 「手动修改地点无用」的成因。
 */
describe("isInteractiveTarget", () => {
  const build = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  };

  it("detects a bare input / textarea / select", () => {
    const host = build("<input id='i'><textarea id='t'></textarea><select id='s'></select>");
    for (const id of ["i", "t", "s"]) {
      expect(isInteractiveTarget(host.querySelector(`#${id}`))).toBe(true);
    }
  });

  it("detects buttons and links", () => {
    const host = build("<button id='b'>x</button><a href='https://a.com' id='a'>y</a>");
    expect(isInteractiveTarget(host.querySelector("#b"))).toBe(true);
    expect(isInteractiveTarget(host.querySelector("#a"))).toBe(true);
  });

  it("detects controls nested inside a label or span", () => {
    const host = build("<label><span><input id='nested'></span></label>");
    expect(isInteractiveTarget(host.querySelector("#nested"))).toBe(true);
  });

  it("does not treat a data-no-drag region as a control", () => {
    // 关键区分：滚动列表标了 data-no-drag 只代表"别拖磁贴"，
    // 它仍不是控件——否则在列表空白处点击无法展开弹窗。
    const host = build("<div id='nd' data-no-drag><em id='inner'>x</em></div>");
    expect(isInteractiveTarget(host.querySelector("#nd"))).toBe(false);
    expect(isInteractiveTarget(host.querySelector("#inner"))).toBe(false);
  });

  it("returns false for plain non-interactive content", () => {
    const host = build("<div id='d'><span id='sp'>文字</span></div>");
    expect(isInteractiveTarget(host.querySelector("#d"))).toBe(false);
    expect(isInteractiveTarget(host.querySelector("#sp"))).toBe(false);
  });

  it("returns false for null or non-element targets", () => {
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget(undefined)).toBe(false);
    expect(isInteractiveTarget({} as EventTarget)).toBe(false);
  });
});

/**
 * 拖拽让位判定。
 *
 * 与 `isInteractiveTarget` 的差别只在 `data-no-drag`：磁贴内的可滚动列表
 * 既要"别被当成拖拽起点"，又要"点击仍能展开弹窗"，因此不能简单
 * 把它并进控件选择器里。
 */
describe("isDragBlockedTarget", () => {
  const build = (html: string) => {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  };

  it("covers every interactive control", () => {
    // id 刻意与上面的 describe 不重名：jsdom 里作用域内的
    // `querySelector("#id")` 会退化成文档级查找，同 id 会命中旧节点。
    const host = build("<button id='btn2'>x</button><input id='in2'><div id='dv2'>文字</div>");
    expect(isDragBlockedTarget(host.querySelector("#btn2"))).toBe(true);
    expect(isDragBlockedTarget(host.querySelector("#in2"))).toBe(true);
    expect(isDragBlockedTarget(host.querySelector("#dv2"))).toBe(false);
  });

  it("covers a data-no-drag scroll region and its descendants", () => {
    const host = build("<div id='list2' data-no-drag><div id='row2'>活动 A</div></div>");
    expect(isDragBlockedTarget(host.querySelector("#list2"))).toBe(true);
    expect(isDragBlockedTarget(host.querySelector("#row2"))).toBe(true);
  });

  it("returns false for null or non-element targets", () => {
    expect(isDragBlockedTarget(null)).toBe(false);
    expect(isDragBlockedTarget(undefined)).toBe(false);
    expect(isDragBlockedTarget({} as EventTarget)).toBe(false);
  });
});
