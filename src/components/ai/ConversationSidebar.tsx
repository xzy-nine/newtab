/**
 * 对话历史侧边栏。
 */

import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/ai";

export interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function ConversationSidebar({
  conversations,
  currentConversationId,
  onSelect,
  onCreate,
  onDelete,
  onClearAll,
}: ConversationSidebarProps) {
  return (
    <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-medium">对话历史</h3>
        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={onCreate} title="新对话">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">暂无对话历史</p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
                conv.id === currentConversationId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted text-foreground",
              )}
              onClick={() => onSelect(conv.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 truncate">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                title="删除对话"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="p-2 border-t border-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-destructive"
          onClick={onClearAll}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          清空全部
        </Button>
      </div>
    </div>
  );
}
