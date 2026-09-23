import { ChevronRight, ChevronDown, Folder, Pin } from "lucide-react";
import type { FolderNode } from "@/hooks/useBookmarkFolders";
import { getMessage } from "@/lib/i18n";

export interface FolderTreeViewProps {
  nodes: FolderNode[];
  currentFolder: string | null;
  expandedFolders: Set<string>;
  pinnedFolders: string[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  level?: number;
}

export function FolderTreeView({
  nodes,
  currentFolder,
  expandedFolders,
  pinnedFolders,
  onSelect,
  onToggle,
  onPin,
  onUnpin,
  level = 0,
}: FolderTreeViewProps) {
  return (
    <div className="folder-tree-list">
      {nodes.map((node) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedFolders.has(node.id);
        const isSelected = node.id === currentFolder;
        const isPinned = pinnedFolders.includes(node.id);
        const canSelect =
          node.hasUrlChildren ||
          (hasChildren &&
            node.children!.some((c) => c.hasUrlChildren || (c.children && c.children.length > 0)));

        return (
          <div key={node.id} className="folder-tree-item-wrapper">
            <div
              className={`folder-tree-item ${isSelected ? "selected" : ""} ${canSelect ? "selectable" : ""}`}
              style={{ paddingLeft: `${12 + level * 20}px` }}
              onClick={() => canSelect && onSelect(node.id)}
            >
              {hasChildren ? (
                <button
                  className="folder-tree-arrow"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(node.id);
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>
              ) : (
                <span className="folder-tree-arrow-placeholder" />
              )}
              <Folder className="w-3.5 h-3.5 folder-tree-icon" />
              <span className="folder-tree-name">{node.title}</span>
              {canSelect && (
                <button
                  className="ml-auto p-0.5 rounded hover:bg-foreground/10 text-muted-foreground hover:text-foreground flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isPinned) onUnpin(node.id);
                    else onPin(node.id);
                  }}
                  title={
                    isPinned
                      ? getMessage("unpinFolder", "取消固定")
                      : getMessage("pinFolder", "固定文件夹")
                  }
                >
                  <Pin
                    className={`w-3 h-3 ${isPinned ? "fill-foreground/60 text-foreground/60" : ""}`}
                  />
                </button>
              )}
            </div>
            {hasChildren && isExpanded && (
              <FolderTreeView
                nodes={node.children!}
                currentFolder={currentFolder}
                expandedFolders={expandedFolders}
                pinnedFolders={pinnedFolders}
                onSelect={onSelect}
                onToggle={onToggle}
                onPin={onPin}
                onUnpin={onUnpin}
                level={level + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
