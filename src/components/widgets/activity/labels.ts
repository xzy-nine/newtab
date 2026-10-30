/**
 * 活动剩余时间的展示文案。
 *
 * `remainingText` 只给出结构与数值，便于按语言本地化；本模块负责把结构
 * 翻成最终文案。磁贴与弹窗共用同一份文案，避免两处对同一状态给出不同措辞。
 *
 * @module components/widgets/activity/labels
 */

import { getMessage } from "@/lib/i18n";
import type { RemainingText } from "@/components/widgets/activity/activity";

/**
 * 剩余时间文案（`getMessage` 不做插值，故在此替换占位符）。
 * @param remaining 结构化剩余时间。
 * @returns 可直接展示的文案。
 */
export function remainingLabel(remaining: RemainingText): string {
  if (remaining.unit === "ended") return getMessage("hoyoActivityEnded", "已结束");
  if (remaining.unit === "hours") {
    return getMessage("hoyoActivityHoursLeft", "剩 {n} 小时").replace(
      "{n}",
      String(remaining.value),
    );
  }
  return getMessage("hoyoActivityDaysLeft", "剩 {n} 天").replace("{n}", String(remaining.value));
}
