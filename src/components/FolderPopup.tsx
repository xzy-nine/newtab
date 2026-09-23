import { Folder } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ShortcutIcon } from "@/components/DesktopItemViews";
import { useFolderBookmarks } from "@/hooks/useFolderBookmarks";
import { getMessage } from "@/lib/i18n";
import { openUrl } from "@/lib/open-url";

interface FolderPopupProps {
  /** 要展示的书签文件夹 id；为 null 时不显示。 */
  folderId: string | null;
  /** 文件夹标题。 */
  title?: string;
  onClose: () => void;
}

/**
 * 主桌面文件夹图标的弹窗。
 *
 * 只展示该文件夹内的书签，点击即打开——不会固定任何东西。
 */
export function FolderPopup({ folderId, title, onClose }: FolderPopupProps) {
  const { bookmarks, loading } = useFolderBookmarks(folderId);

  return (
    <Dialog open={folderId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="flex items-center gap-2 pr-6">
          <Folder className="w-4 h-4 text-muted-foreground" />
          <span className="truncate">{title || getMessage("folder", "文件夹")}</span>
        </DialogTitle>

        <div className="max-h-[420px] min-h-[120px] overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {getMessage("loading", "加载中...")}
            </p>
          ) : bookmarks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {getMessage("emptyFolder", "该文件夹内没有书签")}
            </p>
          ) : (
            <div className="folder-popup-grid">
              {bookmarks.map((bookmark) => (
                <button
                  key={bookmark.id}
                  className="folder-popup-item"
                  title={bookmark.url}
                  onClick={() => openUrl(bookmark.url)}
                >
                  <ShortcutIcon url={bookmark.url} name={bookmark.title} />
                  <span className="folder-popup-item-name">{bookmark.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
