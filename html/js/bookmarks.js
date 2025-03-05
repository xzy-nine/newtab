export async function loadBookmarks() {
    try {
        const bookmarks = await chrome.bookmarks.getTree();
        // 处理书签数据
    } catch (error) {
        console.error('Failed to load bookmarks:', error);
    }
}