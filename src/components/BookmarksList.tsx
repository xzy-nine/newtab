import { useState, useEffect, useCallback } from "react";
import { Folder, Bookmark, ChevronRight } from "lucide-react";
import { useContextMenu, type ContextMenuItem } from "@/hooks/useContextMenu";

interface BookmarkTreeNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkTreeNode[];
}

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
}

interface BookmarkFolder {
  id: string;
  title: string;
  children: BookmarkItem[];
}

const EXPANDED_KEY = "newtab:expanded-folders";

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveExpanded(set: Set<string>) {
  localStorage.setItem(EXPANDED_KEY, JSON.stringify([...set]));
}

export function BookmarksList() {
  const [bookmarks, setBookmarks] = useState<BookmarkFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(loadExpanded);
  const { show, hide, menuRef, state: menuState } = useContextMenu();

  useEffect(() => {
    saveExpanded(expandedFolders);
  }, [expandedFolders]);

  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const tree = await browser.bookmarks.getTree();
        const folders: BookmarkFolder[] = [];

        const processNode = (node: BookmarkTreeNode, parentTitle?: string): void => {
          if (node.children) {
            const folderTitle = parentTitle ? `${parentTitle} / ${node.title}` : node.title;

            if (node.title && node.children.some((c) => c.url)) {
              const items: BookmarkItem[] = node.children
                .filter((c): c is BookmarkTreeNode & { url: string } => !!c.url)
                .map((c) => ({
                  id: c.id,
                  title: c.title || c.url,
                  url: c.url,
                }));

              if (items.length > 0) {
                folders.push({ id: node.id, title: folderTitle, children: items });
              }
            }

            node.children.forEach((child) => processNode(child, folderTitle));
          }
        };

        tree.forEach((root) => processNode(root));
        setBookmarks(folders);
      } catch (error) {
        console.error("Failed to load bookmarks:", error);
      }
    };

    loadBookmarks();
  }, []);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, folderId: string) => {
      const items: ContextMenuItem[] = [
        { label: "新建书签", onSelect: () => console.log("新建书签", folderId) },
        { label: "新建文件夹", onSelect: () => console.log("新建文件夹", folderId) },
        {
          label: "删除文件夹",
          onSelect: () => console.log("删除文件夹", folderId),
          className: "text-red-500",
        },
      ];
      show(e.nativeEvent, items);
    },
    [show],
  );

  if (bookmarks.length === 0) {
    return (
      <div className="text-center text-white/60 py-8">
        <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>暂无书签</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bookmarks.map((folder) => (
        <div key={folder.id} className="bg-white/10 backdrop-blur-sm rounded-lg overflow-hidden">
          <button
            onClick={() => toggleFolder(folder.id)}
            onContextMenu={(e) => handleContextMenu(e, folder.id)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/10 transition-colors"
          >
            <Folder className="w-4 h-4 text-white/70" />
            <span className="flex-1 text-white text-sm font-medium truncate">{folder.title}</span>
            <ChevronRight
              className={`w-4 h-4 text-white/50 transition-transform ${expandedFolders.has(folder.id) ? "rotate-90" : ""}`}
            />
          </button>

          {expandedFolders.has(folder.id) && (
            <div className="border-t border-white/10">
              {folder.children.map((bookmark) => (
                <a
                  key={bookmark.id}
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 text-left hover:bg-white/10 transition-colors group"
                >
                  <Bookmark className="w-4 h-4 text-white/50 group-hover:text-white/70" />
                  <span className="flex-1 text-white/80 text-sm truncate group-hover:text-white">
                    {bookmark.title}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      {menuState.isOpen && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 shadow-md"
          style={{ left: menuState.x, top: menuState.y }}
        >
          {menuState.items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="my-1 h-px bg-border" />;
            }
            return (
              <button
                key={item.id || i}
                className={`flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground ${
                  item.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                } ${item.className || ""}`}
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect?.();
                  hide();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
