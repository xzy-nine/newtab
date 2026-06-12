import { useState, useEffect } from 'react'
import { Folder, Bookmark, ChevronRight } from 'lucide-react'

interface BookmarkItem {
  id: string
  title: string
  url: string
  icon?: string
}

interface BookmarkFolder {
  id: string
  title: string
  children: BookmarkItem[]
}

export function BookmarksList() {
  const [bookmarks, setBookmarks] = useState<BookmarkFolder[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const tree = await browser.bookmarks.getTree()
        const folders: BookmarkFolder[] = []
        
        const processNode = (node: chrome.bookmarks.BookmarkTreeNode, parentTitle?: string): void => {
          if (node.children) {
            const folderTitle = parentTitle ? `${parentTitle} / ${node.title}` : node.title
            
            if (node.title && node.children.some(c => c.url)) {
              const items: BookmarkItem[] = node.children
                .filter((c): c is chrome.bookmarks.BookmarkTreeNode & { url: string } => !!c.url)
                .map(c => ({
                  id: c.id,
                  title: c.title || c.url,
                  url: c.url,
                }))
            
              if (items.length > 0) {
                folders.push({
                  id: node.id,
                  title: folderTitle,
                  children: items,
                })
              }
            }
            
            node.children.forEach(child => processNode(child, folderTitle))
          }
        }
        
        tree.forEach(root => processNode(root))
        setBookmarks(folders.slice(0, 3))
      } catch (error) {
        console.error('Failed to load bookmarks:', error)
      }
    }

    loadBookmarks()
  }, [])

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  if (bookmarks.length === 0) {
    return (
      <div className="text-center text-white/60 py-8">
        <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>暂无书签</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {bookmarks.map(folder => (
        <div key={folder.id} className="bg-white/10 backdrop-blur-sm rounded-lg overflow-hidden">
          <button
            onClick={() => toggleFolder(folder.id)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/10 transition-colors"
          >
            <Folder className="w-4 h-4 text-white/70" />
            <span className="flex-1 text-white text-sm font-medium truncate">{folder.title}</span>
            <ChevronRight 
              className={`w-4 h-4 text-white/50 transition-transform ${expandedFolders.has(folder.id) ? 'rotate-90' : ''}`}
            />
          </button>
          
          {expandedFolders.has(folder.id) && (
            <div className="border-t border-white/10">
              {folder.children.slice(0, 5).map(bookmark => (
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
    </div>
  )
}
