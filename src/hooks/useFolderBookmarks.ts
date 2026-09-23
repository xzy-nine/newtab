import { useEffect, useState } from "react";
import type { BookmarkLike } from "@/lib/desktop-items";

/**
 * 读取某个书签文件夹内的书签。
 *
 * 主桌面的文件夹图标弹窗与拉伸块都要展示文件夹内容，这里统一取数与缓存，
 * 避免同一个文件夹被重复查询。
 *
 * @param folderId 书签文件夹 id；为空时不查询。
 * @returns 书签列表与加载状态。
 */
export function useFolderBookmarks(folderId: string | null | undefined): {
  bookmarks: BookmarkLike[];
  loading: boolean;
} {
  const [state, setState] = useState<{ key: string; items: BookmarkLike[] } | null>(null);
  const key = folderId ?? "";

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      let items: BookmarkLike[] = [];
      try {
        const [folder] = await browser.bookmarks.getSubTree(key);
        if (folder?.children) {
          items = folder.children
            .filter((c): c is chrome.bookmarks.BookmarkTreeNode & { url: string } => !!c.url)
            .map((c) => ({ id: c.id, title: c.title || c.url, url: c.url }));
        }
      } catch (e) {
        console.error("获取书签失败:", e);
      }
      if (!cancelled) setState({ key, items });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  // 结果与当前 folderId 不匹配时视为加载中，避免闪现上一个文件夹的内容。
  const loading = Boolean(key) && state?.key !== key;
  return { bookmarks: state?.key === key ? state.items : [], loading };
}
