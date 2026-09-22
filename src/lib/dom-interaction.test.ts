import { describe, it, expect } from "vitest";
import { isInteractiveTarget } from "./dom-interaction";

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

  it("honours an explicit data-no-drag opt-out", () => {
    const host = build("<div id='nd' data-no-drag><em id='inner'>x</em></div>");
    expect(isInteractiveTarget(host.querySelector("#nd"))).toBe(true);
    expect(isInteractiveTarget(host.querySelector("#inner"))).toBe(true);
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
