import { afterEach, beforeEach, vi } from "vitest";

/**
 * 需要替换全局 `fetch` 并清空本地存储的测试共用的夹具。
 *
 * 每个小部件都在挂载时联网并读写 `localStorage` 缓存，用例之间不隔离就会
 * 互相污染：上一个用例写入的缓存会让下一个用例跳过请求，残留的 `fetch` 桩
 * 又会接住本该发往真实全局的调用。
 *
 * 夹具在调用处注册 `beforeEach`/`afterEach`，因此必须在 `describe` 体内调用，
 * 与它要隔离的用例处于同一作用域。
 */

/** 一个 `fetch` 桩的类型。 */
export type FetchMock = ReturnType<typeof vi.fn>;

/**
 * 安装可重置的 `fetch` 桩。
 * @param makeMock 构造桩的方式；需要自定义响应逻辑时传入，缺省为无行为的 `vi.fn()`。
 * @returns 每个用例之间被重置的 `fetch` 桩。
 */
export function useFetchStub(makeMock: () => FetchMock = vi.fn): { fetchMock: FetchMock } {
  const fetchMock = makeMock();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  return { fetchMock };
}
