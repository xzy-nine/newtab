import { useState, useRef, useEffect } from "react";
import { Search, Plus, Trash2, Edit3, Bot, Check, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppSettings } from "@/lib/app-settings-store";
import { getMessage } from "@/lib/i18n";
import type { SearchEngine } from "@/lib/app-settings";
import { AIAssistant, preloadAIChatPanel } from "@/components/ai/AIAssistant";
import { cn } from "@/lib/utils";
import { emitSidebarNavigate } from "@/lib/sidebar-nav";
import {
  getSearchSuggestions,
  type SearchSuggestion,
  getFaviconUrl,
  getInitialFromUrl,
} from "@/lib/search-suggestions";
import { debounce } from "@/lib/utils";

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
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { searchEngines, currentEngineIndex, setCurrentEngineIndex, aiEnabled } = useAppSettings();

  const currentEngine = searchEngines[currentEngineIndex] || searchEngines[0];

  // 防抖获取搜索建议
  const debouncedFetchSuggestions = debounce(async (raw: unknown) => {
    const input = raw as string;
    if (!input.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      const results = await getSearchSuggestions(input);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } catch (error) {
      console.error("获取搜索建议失败:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, 300);

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

      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
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
        emitSidebarNavigate(searchUrl);
      } else {
        window.open(searchUrl, "_blank");
      }
      setShowSuggestions(false);
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
    <div className="w-full max-w-xl mx-auto relative search-box-host">
      <form onSubmit={handleSearch} className="search-box relative flex items-center h-12">
        <button
          type="button"
          ref={iconRef}
          onClick={() => setMenuOpen((v) => !v)}
          className="search-box-engine"
          title={currentEngine.name}
        >
          <img
            src={engineIconSrc(currentEngine)}
            alt={currentEngine.name}
            className="search-box-engine-icon"
            onError={(e) => {
              (e.target as HTMLImageElement).src = defaultFallbackIcon;
            }}
          />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            debouncedFetchSuggestions(value);
          }}
          onFocus={() => {
            if (query.trim() && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          placeholder={getMessage("searchPlaceholder", "搜索...")}
          className="search-box-input"
        />

        {aiEnabled && !(window as any).__IN_SIDEPANEL__ && (
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            onPointerEnter={preloadAIChatPanel}
            onFocus={preloadAIChatPanel}
            className="search-box-ai"
            title={getMessage("aiAssistant", "AI 助手")}
          >
            <Bot className="w-5 h-5" />
          </button>
        )}

        <button type="submit" className="search-box-submit" title={getMessage("search", "搜索")}>
          <Search className="w-[18px] h-[18px]" />
        </button>
      </form>

      {/* 搜索建议下拉菜单 */}
      {showSuggestions && suggestions.length > 0 && (
        <div ref={suggestionsRef} className="search-dropdown">
          <div className="search-dropdown-scroll">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => {
                  if ((window as any).__IN_SIDEPANEL__) {
                    emitSidebarNavigate(suggestion.url);
                  } else {
                    window.open(suggestion.url, "_blank");
                  }
                  setShowSuggestions(false);
                  setQuery("");
                }}
                className="search-option"
              >
                {/* 图标 */}
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  <img
                    src={getFaviconUrl(suggestion.url)}
                    alt=""
                    className="w-5 h-5 object-contain"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                      img.parentElement!.innerHTML = `<div class="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white text-xs flex items-center justify-center font-medium">${getInitialFromUrl(suggestion.url)}</div>`;
                    }}
                  />
                </div>

                {/* 书签信息 */}
                <div className="search-option-main">
                  <div className="search-option-title">{suggestion.title}</div>
                  <div className="search-option-sub">{suggestion.url}</div>
                </div>

                {/* 书签图标指示 */}
                <Bookmark className="search-option-tail" />
              </button>
            ))}
          </div>
        </div>
      )}

      {menuOpen && (
        <div ref={menuRef} className="search-dropdown is-engines">
          <div className="search-dropdown-heading">
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
              className={cn("search-option", index === currentEngineIndex && "is-active")}
            >
              <img
                src={engineIconSrc(engine)}
                alt={engine.name}
                className="search-option-icon"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "";
                }}
              />
              <span className="search-option-main search-option-title">{engine.name}</span>
              {index === currentEngineIndex && (
                <Check className="search-option-tail text-blue-500" />
              )}
            </button>
          ))}
          <div className="search-dropdown-divider" />
          <button
            type="button"
            onClick={() => {
              setEditorOpen(true);
              setMenuOpen(false);
            }}
            className="search-option"
          >
            <Plus className="search-option-icon" />
            {getMessage("manageEngines", "管理搜索引擎")}
          </button>
        </div>
      )}

      <EngineEditor open={editorOpen} onOpenChange={setEditorOpen} />
      <AIAssistant open={aiOpen} onOpenChange={setAiOpen} initialMessage={query} />
    </div>
  );
}
