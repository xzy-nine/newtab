import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  DEFAULT_CACHE_TTL_MS,
  clearAllCaches,
  readCache,
  readFreshCache,
  readStaleCache,
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

  describe("readStaleCache / readFreshCache", () => {
    it("readStaleCache returns a value after its TTL has expired", () => {
      // 远端拿不到数据时要能继续用这份（已过期的）数据。
      // 注意用 readFreshCache 判定过期：readCache 会顺手删掉条目。
      writeCache("stale", "kept", 10);
      const savedAt = JSON.parse(localStorage.getItem("newtab:cache:stale")!).savedAt as number;
      expect(readFreshCache("stale", savedAt + 100)).toBeNull();
      expect(readStaleCache("stale")).toBe("kept");
    });

    it("readFreshCache drops an expired value but keeps the entry on disk", () => {
      // 关键：必须保留条目，否则失败兜底就拿不到旧数据了
      writeCache("fresh", "kept", 10);
      const savedAt = JSON.parse(localStorage.getItem("newtab:cache:fresh")!).savedAt as number;
      expect(readFreshCache("fresh", savedAt + 100)).toBeNull();
      expect(localStorage.getItem("newtab:cache:fresh")).not.toBeNull();
      expect(readStaleCache("fresh")).toBe("kept");
    });

    it("readFreshCache returns an unexpired value", () => {
      writeCache("fresh-ok", "v", 1000);
      const savedAt = JSON.parse(localStorage.getItem("newtab:cache:fresh-ok")!).savedAt as number;
      expect(readFreshCache("fresh-ok", savedAt + 999)).toBe("v");
      expect(readFreshCache("fresh-ok", savedAt + 1000)).toBeNull();
    });

    it("returns null for a missing key", () => {
      expect(readStaleCache("missing")).toBeNull();
      expect(readFreshCache("missing")).toBeNull();
    });

    it("still rejects corrupted entries", () => {
      localStorage.setItem("newtab:cache:corrupt", "{not json");
      expect(readStaleCache("corrupt")).toBeNull();
      expect(localStorage.getItem("newtab:cache:corrupt")).toBeNull();
    });
  });

  describe("readThroughCache force and stale fallback", () => {
    it("ignores the cache when force is set", async () => {
      writeCache("force", "old");
      const producer = vi.fn(async () => "new");

      // options.force 需要显式传入第 5 个参数
      const value = await readThroughCache("force", producer, DEFAULT_CACHE_TTL_MS, undefined, {
        force: true,
      });

      expect(value).toBe("new");
      expect(producer).toHaveBeenCalledTimes(1);
      // 新值已写回
      expect(readCache("force")).toBe("new");
    });

    it("still serves the cached value when force is not set", async () => {
      writeCache("noforce", "old");
      const producer = vi.fn(async () => "new");

      expect(await readThroughCache("noforce", producer)).toBe("old");
      expect(producer).not.toHaveBeenCalled();
    });

    it("falls back to the stale value when the producer fails", async () => {
      // 主动刷新失败时不应把已展示的数据清空
      writeCache("fallback", "previous", 10);
      const producer = vi.fn(async () => {
        throw new Error("offline");
      });

      await expect(
        readThroughCache("fallback", producer, DEFAULT_CACHE_TTL_MS, undefined, { force: true }),
      ).resolves.toBe("previous");
    });

    it("falls back to a stale value even when it is validated", async () => {
      writeCache("fallback-valid", { hourly: [], daily: [] }, 10);
      const producer = vi.fn(async () => {
        throw new Error("offline");
      });

      const value = await readThroughCache(
        "fallback-valid",
        producer,
        DEFAULT_CACHE_TTL_MS,
        (v): boolean => Boolean(v && typeof v === "object" && "hourly" in v),
        { force: true },
      );
      expect(value).toEqual({ hourly: [], daily: [] });
    });

    it("rethrows when the producer fails and there is nothing cached", async () => {
      const producer = vi.fn(async () => {
        throw new Error("offline");
      });

      await expect(readThroughCache("empty-fallback", producer)).rejects.toThrow("offline");
    });

    it("rethrows rather than serving structurally invalid stale data", async () => {
      writeCache("bad-stale", { wrong: true }, 10);
      const producer = vi.fn(async () => {
        throw new Error("offline");
      });

      await expect(
        readThroughCache("bad-stale", producer, DEFAULT_CACHE_TTL_MS, (v) =>
          Boolean(v && typeof v === "object" && "hourly" in v),
        ),
      ).rejects.toThrow("offline");
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
