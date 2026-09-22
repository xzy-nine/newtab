import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getWidget, getWidgetPopup } from "@/lib/widget-registry";
import type { WidgetItemData } from "@/lib/desktop-items";

interface WidgetPopupHostProps {
  /** 要展开的小部件实例；为 null 时关闭。 */
  item: WidgetItemData | null;
  onClose: () => void;
  onDataChange?: (itemId: string, data: Record<string, unknown>) => void;
}

/**
 * 小部件展开弹窗的通用宿主。
 *
 * 只负责按注册表里的 `popup` 定义挂载内容组件——弹窗内容仅在打开时渲染，
 * 因此需要按需请求的小部件（如天气的预报）可以在挂载时再去拉数据。
 */
export function WidgetPopupHost({ item, onClose, onDataChange }: WidgetPopupHostProps) {
  const definition = item ? getWidget(item.widgetType) : undefined;
  const popup = item ? getWidgetPopup(item.widgetType) : undefined;
  const Content = popup?.content;

  return (
    <Dialog open={Boolean(item && Content)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={popup?.contentClassName ?? "max-w-lg max-h-[80vh] overflow-y-auto"}>
        <DialogTitle>{popup?.title ?? definition?.meta.name ?? ""}</DialogTitle>
        {item &&
          Content && (
            // key 保证切换小部件时重新挂载，不残留上一个实例的状态
            <Content
              key={item.id}
              data={item.data}
              onDataChange={(data) => onDataChange?.(item.id, data)}
              containerWidth={480}
              containerHeight={400}
            />
          )}
      </DialogContent>
    </Dialog>
  );
}
