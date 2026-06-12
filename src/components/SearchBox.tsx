import { useState } from "react";
import { Search, ChevronDown, Plus, Trash2, Edit3, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppSettings } from "@/lib/app-settings-store";
import { getMessage } from "@/lib/i18n";
import type { SearchEngine } from "@/lib/app-settings";
import { AIAssistant } from "@/components/AIAssistant";

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
        <DialogTitle>管理搜索引擎</DialogTitle>
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
          <Input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder="搜索URL (如 https://example.com/search?q=)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button className="w-full" onClick={handleSave}>
            {editingIndex !== null ? "更新" : "添加"}
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
  const { searchEngines, currentEngineIndex, setCurrentEngineIndex, aiEnabled } = useAppSettings();

  const currentEngine = searchEngines[currentEngineIndex] || searchEngines[0];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      const searchUrl = currentEngine.url + encodeURIComponent(query.trim());
      window.open(searchUrl, "_blank");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={handleSearch}
        className="flex items-center gap-2 bg-white/80 backdrop-blur-md rounded-full shadow-lg border border-gray-200 p-2"
      >
        <div className="flex items-center">
          <Select
            value={String(currentEngineIndex)}
            onValueChange={(v) => setCurrentEngineIndex(Number(v))}
          >
            <SelectTrigger className="w-24 h-10 border-none bg-transparent hover:bg-gray-100 rounded-full">
              <img
                src={`${new URL(currentEngine.url).origin}/favicon.ico`}
                alt={currentEngine.name}
                className="w-5 h-5 mr-2 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%236b7280" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>';
                }}
              />
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </SelectTrigger>
            <SelectContent className="w-48">
              {searchEngines.map((engine, index) => (
                <SelectItem key={engine.name} value={String(index)}>
                  <img
                    src={`${new URL(engine.url).origin}/favicon.ico`}
                    alt={engine.name}
                    className="w-4 h-4 mr-2 object-contain inline"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "";
                    }}
                  />
                  {engine.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="w-7 h-7 ml-1 text-gray-400 hover:text-gray-600"
            onClick={() => setEditorOpen(true)}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-1 flex items-center">
          <Search className="w-5 h-5 text-gray-400 ml-2" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={getMessage("searchPlaceholder", "Search...")}
            className="flex-1 border-none bg-transparent shadow-none px-2 focus-visible:ring-0"
          />
        </div>

        {aiEnabled && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
            onClick={() => setAiOpen(true)}
            title="AI 助手"
          >
            <Bot className="w-5 h-5" />
          </Button>
        )}
        <Button type="submit" className="rounded-full bg-blue-500 hover:bg-blue-600">
          {getMessage("searchPlaceholder", "Search")}
        </Button>
      </form>

      <EngineEditor open={editorOpen} onOpenChange={setEditorOpen} />
      <AIAssistant open={aiOpen} onOpenChange={setAiOpen} initialMessage={query} />
    </div>
  );
}
