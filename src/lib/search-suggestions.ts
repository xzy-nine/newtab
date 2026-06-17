/**
 * 搜索建议模块
 * 从Chrome收藏夹获取搜索建议
 * @module searchSuggestions
 */

export interface SearchSuggestion {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

/**
 * 从收藏夹递归获取所有书签
 * @param bookmarkNodes - 书签节点
 * @param results - 结果数组
 */
function extractBookmarks(
  bookmarkNodes: chrome.bookmarks.BookmarkTreeNode[],
  results: chrome.bookmarks.BookmarkTreeNode[] = [],
): chrome.bookmarks.BookmarkTreeNode[] {
  for (const node of bookmarkNodes) {
    // 只收集有URL的书签（不是文件夹）
    if (node.url) {
      results.push(node);
    }
    // 递归处理子节点
    if (node.children) {
      extractBookmarks(node.children, results);
    }
  }
  return results;
}

/**
 * 获取所有收藏夹书签
 * @returns 所有书签数组
 */
export async function getAllBookmarks(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  try {
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks: chrome.bookmarks.BookmarkTreeNode[] = [];

    // 从根节点开始递归提取所有书签
    if (tree && tree[0]) {
      extractBookmarks(tree[0].children || [], allBookmarks);
    }

    return allBookmarks;
  } catch (error) {
    console.error("获取收藏夹失败:", error);
    return [];
  }
}

/**
 * 根据查询字符串过滤书签并获取搜索建议
 * @param query - 搜索查询字符串
 * @returns 搜索建议数组
 */
export async function getSearchSuggestions(query: string): Promise<SearchSuggestion[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const bookmarks = await getAllBookmarks();
    const lowerQuery = query.toLowerCase().trim();

    // 过滤并评分书签
    const scoredBookmarks = bookmarks
      .map((bookmark) => {
        const title = bookmark.title || "";
        const url = bookmark.url || "";

        // 计算匹配分数（标题匹配优先级更高）
        let score = 0;
        const titleLower = title.toLowerCase();
        const urlLower = url.toLowerCase();

        // 标题完全匹配
        if (titleLower === lowerQuery) {
          score += 100;
        }
        // 标题开头匹配
        else if (titleLower.startsWith(lowerQuery)) {
          score += 50;
        }
        // 标题包含匹配
        else if (titleLower.includes(lowerQuery)) {
          score += 30;
        }

        // URL匹配（优先级较低）
        if (urlLower.includes(lowerQuery)) {
          score += 10;
        }

        return { bookmark, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    // 转换为搜索建议格式
    return scoredBookmarks.map(({ bookmark }) => ({
      id: bookmark.id,
      title: bookmark.title || "未命名",
      url: bookmark.url || "",
      icon: undefined, // 图标由外部处理
    }));
  } catch (error) {
    console.error("获取搜索建议失败:", error);
    return [];
  }
}

/**
 * 获取网站图标
 * @param url - 网站URL
 * @returns 图标URL
 */
export function getFaviconUrl(url: string): string {
  try {
    const { origin } = new URL(url);
    return `${origin}/favicon.ico`;
  } catch {
    return "";
  }
}

/**
 * 根据URL生成初始字母图标
 * @param url - 网站URL
 * @returns 初始字母
 */
export function getInitialFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    const parts = domain.split(".");
    const name = parts[0] || "?";
    return name.charAt(0).toUpperCase();
  } catch {
    return "?";
  }
}
