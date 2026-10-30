import { useEffect, useState } from "react";

/**
 * 以固定间隔走动的当前时间。
 *
 * 相对时间文案（"5 分钟前"、"剩 2 小时"）必须随真实时间自行变化，因此在渲染期
 * 直接读 `Date.now()` 不够：没有任何状态变化触发重渲染，文案会停在首次渲染那一刻。
 *
 * @param intervalMs 刷新间隔（毫秒）。
 * @returns 当前时间戳，每 `intervalMs` 更新一次。
 */
export function useNow(intervalMs: number = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
