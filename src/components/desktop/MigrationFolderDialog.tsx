import { useState } from "react";
import { Folder, PinOff } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getMessage } from "@/lib/i18n";
import { fetchFolderBookmarks } from "@/lib/desktop-storage";
import { DEFAULT_ITEM_NAME, type BookmarkLike } from "@/lib/desktop-items";

interface MigrationFolderDialogProps {
  /** 待选的固定文件夹 id 列表。 */
  candidateFolderIds: string[];
  /** 文件夹 id → 标题（由主桌面组件从当前书签树派生）。 */
  folderTitles: Record<string, string>;
  /** 用户选定释放某个文件夹：调用方负责释放书签并取消固定。 */
  onRelease: (folderId: string, bookmarks: BookmarkLike[]) => void;
  /** 跳过选择，保留全部固定文件夹图标。 */
  onDismiss: () => void;
}

/**
 * 一次性迁移对话框。
 *
 * 从旧版升级且原有多个固定文件夹时弹出：让用户挑一个文件夹，
 * 把它的书签直接释放到主桌面（变成快捷方式），并取消该文件夹的固定，
 * 其余文件夹仍以图标形式固定。跳过则保留全部图标。
 */
export function MigrationFolderDialog({
  candidateFolderIds,
  folderTitles,
  onRelease,
  onDismiss,
}: MigrationFolderDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const handleConfirm = async () => {
    if (!selectedId || releasing) return;
    setReleasing(true);
    try {
      const bookmarks = await fetchFolderBookmarks(selectedId);
      onRelease(selectedId, bookmarks);
    } finally {
      setReleasing(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !releasing) onDismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogTitle>
          {getMessage("migrationChooseFolderTitle", "选择一个文件夹释放到主桌面")}
        </DialogTitle>
        <p className="text-sm text-muted-foreground mt-2">
          {getMessage(
            "migrationChooseFolderDesc",
            "升级后主桌面独立于文件夹。请选择一个固定文件夹，将其书签直接释放到主桌面并取消固定，其余文件夹仍保持固定。",
          )}
        </p>
        <div className="flex flex-col gap-1 mt-3 max-h-[50vh] overflow-y-auto">
          {candidateFolderIds.map((folderId) => {
            const selected = folderId === selectedId;
            return (
              <button
                key={folderId}
                type="button"
                disabled={releasing}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                } disabled:opacity-50`}
                onClick={() => setSelectedId(folderId)}
              >
                <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">
                  {folderTitles[folderId] || DEFAULT_ITEM_NAME}
                </span>
                {selected && <PinOff className="w-3.5 h-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm" disabled={releasing} onClick={onDismiss}>
            {getMessage("migrationSkip", "跳过")}
          </Button>
          <Button size="sm" disabled={!selectedId || releasing} onClick={handleConfirm}>
            <PinOff className="w-3.5 h-3.5 mr-1" />
            {getMessage("migrationRelease", "释放到主桌面")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
