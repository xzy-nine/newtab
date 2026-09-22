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
 * 读取缓存；不存在、已过期或解析失败时返回 null，并顺手清掉失效条目。
 */
export function readCache<T>(key: string, now = Date.now()): T | null {
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
    if (now - record.savedAt >= record.ttl) {
      store.removeItem(storageKey(key));
      return null;
    }
    return record.value;
  } catch {
    store.removeItem(storageKey(key));
    return null;
  }
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
 *
 * 同一 key 并发调用时会复用同一个进行中的 Promise，避免重复请求。
 */
const inflight = new Map<string, Promise<unknown>>();

export async function readThroughCache<T>(
  key: string,
  producer: () => Promise<T>,
  ttl = DEFAULT_CACHE_TTL_MS,
  validate?: (value: unknown) => boolean,
): Promise<T> {
  const cached = readCache<T>(key);
  if (cached !== null && (!validate || validate(cached))) return cached;
  // 结构不合法的缓存直接丢弃，避免反复命中坏数据。
  if (cached !== null) removeCache(key);

  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const task = (async () => {
    const value = await producer();
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
