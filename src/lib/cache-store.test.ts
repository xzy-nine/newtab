import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DEFAULT_CACHE_TTL_MS,
  clearAllCaches,
  readCache,
  readThroughCache,
  removeCache,
  writeCache,
} from "./cache-store";

describe("cache-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a missing key", () => {
    expect(readCache("nope")).toBeNull();
  });

  it("round-trips a value", () => {
    writeCache("k", { a: 1 });
    expect(readCache<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("defaults to a 24 hour TTL", () => {
    writeCache("k", "v");
    const savedAt = JSON.parse(localStorage.getItem("newtab:cache:k")!).savedAt as number;
    expect(readCache("k", savedAt + DEFAULT_CACHE_TTL_MS - 1)).toBe("v");
    expect(readCache("k", savedAt + DEFAULT_CACHE_TTL_MS)).toBeNull();
  });

  it("honours a custom TTL", () => {
    writeCache("k", "v", 1000);
    const savedAt = JSON.parse(localStorage.getItem("newtab:cache:k")!).savedAt as number;
    expect(readCache("k", savedAt + 999)).toBe("v");
    expect(readCache("k", savedAt + 1000)).toBeNull();
  });

  it("drops the entry once it expires", () => {
    writeCache("k", "v", 10);
    const savedAt = JSON.parse(localStorage.getItem("newtab:cache:k")!).savedAt as number;
    expect(readCache("k", savedAt + 100)).toBeNull();
    // 过期条目应被顺手清掉
    expect(localStorage.getItem("newtab:cache:k")).toBeNull();
  });

  it("survives a browser restart, i.e. keeps data across module reloads", () => {
    writeCache("persist", "kept");
    // localStorage 本身是持久化的；模拟"重启"即重新读取
    vi.resetModules();
    expect(readCache("persist")).toBe("kept");
  });

  it("ignores and clears corrupted entries", () => {
    localStorage.setItem("newtab:cache:bad", "{not json");
    expect(readCache("bad")).toBeNull();
    expect(localStorage.getItem("newtab:cache:bad")).toBeNull();

    localStorage.setItem("newtab:cache:shape", JSON.stringify({ hello: "world" }));
    expect(readCache("shape")).toBeNull();
    expect(localStorage.getItem("newtab:cache:shape")).toBeNull();
  });

  it("removes a single entry", () => {
    writeCache("a", 1);
    removeCache("a");
    expect(readCache("a")).toBeNull();
  });

  it("keeps entries under distinct keys independent", () => {
    writeCache("a", 1);
    writeCache("b", 2);
    removeCache("a");
    expect(readCache("b")).toBe(2);
  });

  describe("readThroughCache", () => {
    it("calls the producer on a miss and caches the result", async () => {
      const producer = vi.fn(async () => ({ v: 42 }));
      expect(await readThroughCache("rt", producer)).toEqual({ v: 42 });
      expect(producer).toHaveBeenCalledTimes(1);

      // 第二次命中缓存，不再调用 producer
      expect(await readThroughCache("rt", producer)).toEqual({ v: 42 });
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it("shares one in-flight request between concurrent callers", async () => {
      let resolve!: (v: string) => void;
      const producer = vi.fn(
        () =>
          new Promise<string>((r) => {
            resolve = r;
          }),
      );

      const first = readThroughCache("conc", producer);
      const second = readThroughCache("conc", producer);
      resolve("done");

      expect(await first).toBe("done");
      expect(await second).toBe("done");
      expect(producer).toHaveBeenCalledTimes(1);
    });

    it("does not cache a rejected producer", async () => {
      const producer = vi.fn(async () => {
        throw new Error("boom");
      });
      await expect(readThroughCache("fail", producer)).rejects.toThrow("boom");
      expect(readCache("fail")).toBeNull();
      // 失败后可重试
      await expect(readThroughCache("fail", producer)).rejects.toThrow("boom");
      expect(producer).toHaveBeenCalledTimes(2);
    });

    it("ignores a cached value that fails validation and refetches", async () => {
      // 模拟旧版本/外部写入的畸形缓存
      writeCache("rt-validate", { wrong: true });
      const producer = vi.fn(async () => ({ hourly: [], daily: [] }));

      const value = await readThroughCache("rt-validate", producer, 1000, (v) =>
        Boolean(v && typeof v === "object" && "hourly" in v),
      );

      expect(value).toEqual({ hourly: [], daily: [] });
      expect(producer).toHaveBeenCalledTimes(1);
      // 坏缓存已被替换为合法值
      expect(readCache("rt-validate")).toEqual({ hourly: [], daily: [] });
    });

    it("uses a valid cached value without calling the producer", async () => {
      writeCache("rt-ok", { hourly: [1], daily: [] });
      const producer = vi.fn(async () => ({ hourly: [], daily: [] }));

      const value = await readThroughCache("rt-ok", producer, 1000, (v) =>
        Boolean(v && typeof v === "object" && "hourly" in v),
      );

      expect(value).toEqual({ hourly: [1], daily: [] });
      expect(producer).not.toHaveBeenCalled();
    });
  });

  describe("clearAllCaches", () => {
    it("removes only entries written by this module", () => {
      writeCache("a", 1);
      writeCache("b", 2);
      localStorage.setItem("unrelated", "keep");
      clearAllCaches();
      expect(readCache("a")).toBeNull();
      expect(readCache("b")).toBeNull();
      expect(localStorage.getItem("unrelated")).toBe("keep");
    });
  });
});
