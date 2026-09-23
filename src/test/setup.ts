import { expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

/**
 * jsdom 未实现 `Element.prototype.scrollIntoView`（属于"布局/滚动"能力，
 * jsdom 明确不提供）。AIChatPanel 里"新消息滚到底部"的 effect 会调用它，
 * 不补这个空实现就会让所有渲染该组件的测试直接抛 TypeError。
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});
