import { useState, useEffect, useCallback } from "react";

type BNode = chrome.bookmarks.BookmarkTreeNode;

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
}

export interface FolderNode {
  id: string;
  title: string;
  children?: FolderNode[];
  hasUrlChildren: boolean;
}

const EXPANDED_KEY = "newtab:expandedFolders";

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

function buildFolderTree(nodes: BNode[]): FolderNode[] {
  const result: FolderNode[] = [];
  for (const node of nodes) {
    if (!node.title) continue;
    const hasUrlChildren = node.children ? node.children.some((c) => !!c.url) : false;
    const subFolders = node.children ? node.children.filter((c) => c.children) : [];
    const subTree = buildFolderTree(subFolders);
    result.push({
      id: node.id,
      title: node.title,
      children: subTree.length > 0 ? subTree : undefined,
      hasUrlChildren,
    });
  }
  return result;
}

function flattenFolderTree(tree: FolderNode[]): { id: string; title: string }[] {
  const list: { id: string; title: string }[] = [];
  const walk = (nodes: FolderNode[]) => {
    for (const node of nodes) {
      if (node.hasUrlChildren || (node.children && node.children.length > 0)) {
        list.push({ id: node.id, title: node.title });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return list;
}

export function useBookmarkFolders() {
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [folders, setFolders] = useState<{ id: string; title: string }[]>([]);
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(loadExpanded);

  useEffect(() => {
    saveExpanded(expandedFolders);
  }, [expandedFolders]);

  useEffect(() => {
    const load = async () => {
      try {
        const tree = await browser.bookmarks.getTree();
        const root = tree[0];
        const rootChildren = root.children || [];
        const treeData = buildFolderTree(rootChildren);
        setFolderTree(treeData);
        setFolders(flattenFolderTree(treeData));

        const saved = await chrome.storage.local.get("selectedFolder");
        const stored = saved.selectedFolder;
        setCurrentFolder(typeof stored === "string" ? stored : null);
      } catch (e) {
        console.error("加载书签失败:", e);
      }
    };
    load();
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const selectFolder = useCallback(async (folderId: string) => {
    setCurrentFolder(folderId);
    await chrome.storage.local.set({ selectedFolder: folderId });
  }, []);

  const getFolderBookmarks = useCallback(async (folderId: string): Promise<BookmarkItem[]> => {
    try {
      const [folder] = await browser.bookmarks.getSubTree(folderId);
      if (folder?.children) {
        return folder.children
          .filter((c): c is BNode & { url: string } => !!c.url)
          .map((c) => ({ id: c.id, title: c.title || c.url, url: c.url }));
      }
    } catch (e) {
      console.error("获取书签失败:", e);
    }
    return [];
  }, []);

  return {
    currentFolder,
    folders,
    folderTree,
    expandedFolders,
    toggleFolder,
    selectFolder,
    getFolderBookmarks,
  };
}
