/**
 * 带 TTL 的本地缓存。
 *
 * 用 `localStorage` 而非 `chrome.storage`：
 * - 浏览器重启后仍然保留（localStorage 是持久化的）；
 * - 不参与扩展的云同步（同步只上传 `chrome.storage.sync` 里的设置数据）。
 *
 * 适合缓存"体积大、更新慢、丢了也无所谓"的接口数据（如天气预报），
 * 避免频繁占用免费 API 配额。
 */

/** 默认 TTL：24 小时。 */
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** 键名前缀，便于整体清理与避免与业务键冲突。 */
const PREFIX = "newtab:cache:";

interface CacheRecord<T> {
  /** 写入时间戳（毫秒）。 */
  savedAt: number;
  /** 该条目的有效期（毫秒）。 */
  ttl: number;
  value: T;
}

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

/** localStorage 是否可用（隐私模式等场景可能抛错）。 */
function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * 读取**原始**缓存记录：不做 TTL 判断，也不因过期而清理。
 *
 * 供两类调用方使用：
 * - `readCache` 在此之上叠加 TTL 语义；
 * - 「远端未返回时保持当前过期数据」的兜底逻辑，需要拿到已过期的值。
 *
 * 只有结构损坏（非法 JSON / 缺字段）才会被清理并返回 null。
 */
function readCacheRecord<T>(key: string): CacheRecord<T> | null {
  const store = safeStorage();
  if (!store) return null;
  const raw = store.getItem(storageKey(key));
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as CacheRecord<T>;
    if (
      typeof record !== "object" ||
      record === null ||
      typeof record.savedAt !== "number" ||
      typeof record.ttl !== "number"
    ) {
      store.removeItem(storageKey(key));
      return null;
    }
    return record;
  } catch {
    store.removeItem(storageKey(key));
    return null;
  }
}

/**
 * 读取缓存；不存在、已过期或解析失败时返回 null，并顺手清掉失效条目。
 */
export function readCache<T>(key: string, now = Date.now()): T | null {
  const record = readCacheRecord<T>(key);
  if (!record) return null;
  if (now - record.savedAt >= record.ttl) {
    removeCache(key);
    return null;
  }
  return record.value;
}

/**
 * 读取缓存的值，**忽略 TTL**（已过期也返回）。
 *
 * 用于「网络请求失败时保持当前过期数据」：过期不代表不可用，
 * 只是不够新鲜；把它继续显示给用户远好过清空。
 */
export function readStaleCache<T>(key: string): T | null {
  const record = readCacheRecord<T>(key);
  return record ? record.value : null;
}

/**
 * 读取**仍在有效期内**的缓存值；过期返回 null，但**不删除**条目。
 *
 * 与 `readCache` 的关键区别：`readCache` 会把过期条目顺手清理掉，
 * 而这里刻意保留——因为过期值正是「远端拿不到数据时」的兜底来源。
 * 读穿透缓存（`readThroughCache`）必须用这个，否则一次失败的刷新
 * 会把仅有的旧数据也一起清掉。
 */
export function readFreshCache<T>(key: string, now = Date.now()): T | null {
  const record = readCacheRecord<T>(key);
  if (!record) return null;
  if (now - record.savedAt >= record.ttl) return null;
  return record.value;
}

/** 写入缓存；`ttl` 缺省为 24 小时。 */
export function writeCache<T>(key: string, value: T, ttl = DEFAULT_CACHE_TTL_MS): void {
  const store = safeStorage();
  if (!store) return;
  const record: CacheRecord<T> = { savedAt: Date.now(), ttl, value };
  try {
    store.setItem(storageKey(key), JSON.stringify(record));
  } catch {
    // 超出配额等情况：缓存失败不应影响主流程。
  }
}

/** 删除单个缓存条目。 */
export function removeCache(key: string): void {
  safeStorage()?.removeItem(storageKey(key));
}

/**
 * 读取缓存，未命中时调用 `producer` 生成并写入（写入使用默认 TTL）。
 *
 * @param validate 可选校验：返回 false 视为缓存不可用，会改为调用 producer。
 *   用于防御旧版本或外部写入导致的畸形缓存（直接使用会渲染时崩溃）。
 * @param options.force 为 true 时跳过缓存直接取新数据（供「主动刷新」使用）。
 *   注意：**不会**先删除旧条目，因此失败时仍能回落到过期数据。
 *
 * 同一 key 并发调用时会复用同一个进行中的 Promise，避免重复请求。
 *
 * **失败时保持过期数据**：若 producer 抛错，而本地存在（可能已过期的）旧值，
 * 则返回该旧值而不是抛错——过期只代表不够新，远好过把界面清空。
 */
const inflight = new Map<string, Promise<unknown>>();

export async function readThroughCache<T>(
  key: string,
  producer: () => Promise<T>,
  ttl = DEFAULT_CACHE_TTL_MS,
  validate?: (value: unknown) => boolean,
  options: { force?: boolean } = {},
): Promise<T> {
  if (!options.force) {
    // 用 readFreshCache 而非 readCache：后者会删除过期条目，
    // 而那份过期数据正是下面失败兜底要用到的。
    const cached = readFreshCache<T>(key);
    if (cached !== null) {
      if (!validate || validate(cached)) return cached;
      // 结构不合法（旧版本/损坏）的缓存直接丢弃，避免反复命中坏数据
      removeCache(key);
    }
  }

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = (async () => {
    let value: T;
    try {
      value = await producer();
    } catch (error) {
      // 联网失败：有旧值就继续用旧值，避免把已有数据清空
      const stale = readStaleCache<T>(key);
      if (stale !== null && (!validate || validate(stale))) return stale;
      throw error;
    }
    writeCache(key, value, ttl);
    return value;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/** 清空本模块写入的所有缓存条目（测试与"清除缓存"入口使用）。 */
export function clearAllCaches(): void {
  const store = safeStorage();
  if (!store) return;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX)) keys.push(k);
  }
  keys.forEach((k) => store.removeItem(k));
}
