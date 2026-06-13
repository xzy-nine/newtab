import { useState, useRef, useEffect } from "react";
import { Search, Plus, Trash2, Edit3, Bot, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppSettings } from "@/lib/app-settings-store";
import { getMessage } from "@/lib/i18n";
import type { SearchEngine } from "@/lib/app-settings";
import { AIAssistant } from "@/components/AIAssistant";
import { cn } from "@/lib/utils";

function EngineEditor({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { searchEngines, setSearchEngines } = useAppSettings();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleSave = () => {
    if (!name.trim() || !url.trim()) return;
    const engine: SearchEngine = { name: name.trim(), url: url.trim().replace(/\{q\}/g, "") };
    if (editingIndex !== null) {
      const updated = [...searchEngines];
      updated[editingIndex] = engine;
      setSearchEngines(updated);
    } else {
      setSearchEngines([...searchEngines, engine]);
    }
    setName("");
    setUrl("");
    setEditingIndex(null);
    onOpenChange(false);
  };

  const handleEdit = (index: number) => {
    const engine = searchEngines[index];
    setName(engine.name);
    setUrl(engine.url);
    setEditingIndex(index);
  };

  const handleDelete = (index: number) => {
    const updated = searchEngines.filter((_, i) => i !== index);
    setSearchEngines(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{getMessage("settingsSearchEngines", "管理搜索引擎")}</DialogTitle>
        <div className="space-y-3 mt-4">
          {searchEngines.map((engine, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex-1 text-sm truncate">{engine.name}</span>
              <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => handleEdit(i)}>
                <Edit3 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-7 h-7"
                onClick={() => handleDelete(i)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t pt-3 mt-3 space-y-2">
          <Input
            placeholder={getMessage("engineName", "名称")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder={getMessage("engineSearchUrl", "搜索URL")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button className="w-full" onClick={handleSave}>
            {editingIndex !== null ? getMessage("update", "更新") : getMessage("add", "添加")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { searchEngines, currentEngineIndex, setCurrentEngineIndex, aiEnabled } = useAppSettings();

  const currentEngine = searchEngines[currentEngineIndex] || searchEngines[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        iconRef.current &&
        !iconRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const onFocus = () => {
      if (input.selectionStart === input.selectionEnd) {
        input.select();
      }
    };

    const onVisibilityChange = () => {
      if (!document.hidden && input) {
        setTimeout(() => input.blur(), 100);
      }
    };

    input.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      input.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const searchUrl = currentEngine.url + encodeURIComponent(query.trim());
      if ((window as any).__IN_SIDEPANEL__) {
        chrome.storage.local.set({ currentUrl: searchUrl });
      } else {
        window.open(searchUrl, "_blank");
      }
    }
  };

  const engineIconSrc = (engine: SearchEngine) => {
    try {
      return `${new URL(engine.url).origin}/favicon.ico`;
    } catch {
      return "";
    }
  };

  const defaultFallbackIcon =
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>';

  return (
    <div className="w-full max-w-xl mx-auto relative">
      <form
        onSubmit={handleSearch}
        className={cn(
          "relative flex items-center h-12",
          "bg-white/80 dark:bg-gray-800/80",
          "backdrop-blur-xl",
          "rounded-full",
          "border border-gray-200 dark:border-gray-700",
          "shadow-lg hover:shadow-xl",
          "transition-all duration-300",
          "focus-within:border-blue-400 dark:focus-within:border-blue-500",
          "focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] dark:focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.25)]",
          "focus-within:-translate-y-0.5",
        )}
      >
        <button
          type="button"
          ref={iconRef}
          onClick={() => setMenuOpen((v) => !v)}
          className="group flex items-center justify-center w-10 h-10 ml-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-all duration-200 flex-shrink-0"
        >
          <img
            src={engineIconSrc(currentEngine)}
            alt={currentEngine.name}
            className="w-5 h-5 object-contain transition-transform duration-300 group-hover:rotate-12"
            onError={(e) => {
              (e.target as HTMLImageElement).src = defaultFallbackIcon;
            }}
          />
        </button>

        <div className="flex-1 flex items-center min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={getMessage("searchPlaceholder", "搜索...")}
            className="flex-1 bg-transparent border-none outline-none shadow-none px-2.5 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 text-base h-full min-w-0 focus:ring-0"
          />
        </div>

        {aiEnabled && !(window as any).__IN_SIDEPANEL__ && (
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-all duration-200 flex-shrink-0"
            title={getMessage("aiAssistant", "AI 助手")}
          >
            <Bot className="w-5 h-5" />
          </button>
        )}

        <button
          type="submit"
          className="flex items-center justify-center w-9 h-9 mr-1.5 rounded-full bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 flex-shrink-0"
          title={getMessage("search", "搜索")}
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
      </form>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute top-full mt-2 left-0 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1.5 z-50 overflow-hidden origin-top-right"
        >
          <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
            {getMessage("switchEngine", "切换搜索引擎")}
          </div>
          {searchEngines.map((engine, index) => (
            <button
              key={engine.name}
              type="button"
              onClick={() => {
                setCurrentEngineIndex(index);
                setMenuOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                index === currentEngineIndex
                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50",
              )}
            >
              <img
                src={engineIconSrc(engine)}
                alt={engine.name}
                className="w-4 h-4 object-contain flex-shrink-0"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "";
                }}
              />
              <span className="flex-1 text-left truncate">{engine.name}</span>
              {index === currentEngineIndex && (
                <Check className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
              )}
            </button>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                setEditorOpen(true);
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {getMessage("manageEngines", "管理搜索引擎")}
            </button>
          </div>
        </div>
      )}

      <EngineEditor open={editorOpen} onOpenChange={setEditorOpen} />
      <AIAssistant open={aiOpen} onOpenChange={setAiOpen} initialMessage={query} />
    </div>
  );
}
