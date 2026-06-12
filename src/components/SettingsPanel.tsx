import { useState, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import {
  Settings,
  Image,
  Bell,
  Bot,
  Search,
  Puzzle,
  RefreshCw,
  Info,
  Plus,
  Trash2,
  Upload,
  Download,
  ExternalLink,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox, CheckboxIndicator } from "@/components/ui/checkbox";
import { useAppSettings } from "@/lib/app-settings-store";
import { getMessage } from "@/lib/i18n";
import { BackgroundSettings } from "@/components/BackgroundSettings";
import {
  showNotification,
  getDuration,
  setDuration,
  DEFAULT_DURATIONS,
  type NotificationType,
} from "@/lib/notification";
import { dataSync, type CloudDataInfo } from "@/lib/data-sync";
import { getAllTypes } from "@/lib/widget-registry";
import type { AIProvider, SearchEngine } from "@/lib/app-settings";

type CategoryId =
  | "general"
  | "background"
  | "notifications"
  | "ai"
  | "search"
  | "widgets"
  | "sync"
  | "about";

interface Category {
  id: CategoryId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CATEGORIES: Category[] = [
  { id: "general", label: "常规", icon: Settings },
  { id: "background", label: "背景", icon: Image },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "ai", label: "AI助手", icon: Bot },
  { id: "search", label: "搜索引擎", icon: Search },
  { id: "widgets", label: "小部件", icon: Puzzle },
  { id: "sync", label: "数据同步", icon: RefreshCw },
  { id: "about", label: "关于", icon: Info },
];

export const SettingsPanel = forwardRef<{ open: () => void }>(function SettingsPanel(_, ref) {
  const [activeCategory, setActiveCategory] = useState<CategoryId>("general");
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 right-4 z-50 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white"
        >
          <Settings className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[90vw] h-[80vh] max-h-[700px] p-0 gap-0 overflow-hidden rounded-xl">
        <div className="flex h-full">
          <div className="w-48 flex-shrink-0 bg-muted/30 border-r border-border overflow-y-auto">
            <div className="p-4 border-b border-border">
              <DialogTitle className="text-lg font-semibold">
                {getMessage("settingsTitle", "设置")}
              </DialogTitle>
            </div>
            <nav className="p-2 space-y-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      activeCategory === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {activeCategory === "general" && <GeneralSettings />}
            {activeCategory === "background" && <BackgroundSettings />}
            {activeCategory === "notifications" && <NotificationSettings />}
            {activeCategory === "ai" && <AISettings />}
            {activeCategory === "search" && <EngineManager />}
            {activeCategory === "widgets" && <WidgetListSettings />}
            {activeCategory === "sync" && <SyncSettings />}
            {activeCategory === "about" && <AboutSection />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
function SettingCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow ${className}`}
    >
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );
}

function GeneralSettings() {
  const {
    theme,
    setTheme,
    language,
    setLanguage,
    showBookmarks,
    setShowBookmarks,
    showClock,
    setShowClock,
    use12hClock,
    setUse12hClock,
    showSeconds,
    setShowSeconds,
    showWidgets,
    setShowWidgets,
  } = useAppSettings();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-4">外观与显示</h3>
        <SettingCard className="space-y-1">
          <SettingRow
            label="主题模式"
            description="选择外观主题"
            control={
              <Select
                value={theme}
                onValueChange={(v) => setTheme(v as "system" | "light" | "dark")}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">系统</SelectItem>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="dark">深色</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          <SettingRow
            label="语言"
            description="界面语言"
            control={
              <Select value={language} onValueChange={(v) => setLanguage(v)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </SettingCard>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-4">内容显示</h3>
        <SettingCard className="space-y-1">
          <SettingRow
            label="显示书签"
            description="在新标签页显示书签文件夹"
            control={
              <Checkbox
                checked={showBookmarks}
                onCheckedChange={(v) => setShowBookmarks(v as boolean)}
              >
                <CheckboxIndicator />
              </Checkbox>
            }
          />
          <SettingRow
            label="显示时钟"
            description="在新标签页显示时间和日期"
            control={
              <Checkbox checked={showClock} onCheckedChange={(v) => setShowClock(v as boolean)}>
                <CheckboxIndicator />
              </Checkbox>
            }
          />
          {showClock && (
            <div className="ml-6 space-y-1 border-l-2 border-muted pl-4">
              <SettingRow
                label="12小时制"
                control={
                  <Checkbox
                    checked={use12hClock}
                    onCheckedChange={(v) => setUse12hClock(v as boolean)}
                  >
                    <CheckboxIndicator />
                  </Checkbox>
                }
              />
              <SettingRow
                label="显示秒数"
                control={
                  <Checkbox
                    checked={showSeconds}
                    onCheckedChange={(v) => setShowSeconds(v as boolean)}
                  >
                    <CheckboxIndicator />
                  </Checkbox>
                }
              />
            </div>
          )}
          <SettingRow
            label="显示小部件"
            description="在新标签页显示小部件区域"
            control={
              <Checkbox checked={showWidgets} onCheckedChange={(v) => setShowWidgets(v as boolean)}>
                <CheckboxIndicator />
              </Checkbox>
            }
          />
        </SettingCard>
      </div>
    </div>
  );
}

type NotifSettingType = Exclude<NotificationType, "loading">;

const NOTIF_TYPES: { type: NotifSettingType; label: string; desc: string }[] = [
  { type: "info", label: "信息通知", desc: "信息类通知的显示时间" },
  { type: "success", label: "成功通知", desc: "成功类通知的显示时间" },
  { type: "warning", label: "警告通知", desc: "警告类通知的显示时间" },
  { type: "error", label: "错误通知", desc: "错误类通知的显示时间" },
];

function NotificationSettings() {
  return (
    <div>
      <h3 className="text-base font-semibold mb-4">通知设置</h3>
      <SettingCard className="space-y-4">
        {NOTIF_TYPES.map(({ type, label, desc }) => (
          <NotificationSlider key={type} type={type} label={label} desc={desc} />
        ))}
      </SettingCard>
    </div>
  );
}

function NotificationSlider({
  type,
  label,
  desc,
}: {
  type: NotifSettingType;
  label: string;
  desc: string;
}) {
  const isError = type === "error";
  const defaultSeconds = (DEFAULT_DURATIONS[type] ?? 3000) / 1000;
  const [value, setValue] = useState(() => {
    const ms = getDuration(type);
    return ms / 1000;
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sec = parseFloat(e.target.value);
      setValue(sec);
      setDuration(type, Math.round(sec * 1000));
    },
    [type],
  );

  const handleTest = useCallback(() => {
    const titles: Record<string, string> = {
      info: "信息",
      success: "成功",
      warning: "警告",
      error: "错误",
    };
    const messages: Record<string, string> = {
      info: "这是一条信息通知",
      success: "这是一条成功通知",
      warning: "这是一条警告通知",
      error: "这是一条错误通知",
    };
    showNotification({
      title: titles[type] ?? "测试通知",
      message: messages[type] ?? "这是一条测试通知",
      type,
      duration: Math.round(value * 1000),
      forceLocal: true,
    });
  }, [type, value]);

  const handleReset = useCallback(() => {
    setValue(defaultSeconds);
    setDuration(type, Math.round(defaultSeconds * 1000));
    showNotification({
      title: "已恢复默认",
      message: `通知时间: ${defaultSeconds.toFixed(1)}秒`,
      type: "success",
      duration: 2000,
      forceLocal: true,
    });
  }, [type, defaultSeconds]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <span className="text-sm text-muted-foreground w-12 text-right tabular-nums">
          {value.toFixed(1)}秒
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={30}
          step={0.5}
          value={value}
          onChange={handleChange}
          className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700 accent-blue-500
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow"
        />
        <button
          onClick={handleTest}
          className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors shrink-0"
        >
          测试
        </button>
        {!isError && (
          <button
            onClick={handleReset}
            className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors shrink-0"
          >
            恢复默认
          </button>
        )}
      </div>
    </div>
  );
}

function AISettings() {
  const {
    aiEnabled,
    setAiEnabled,
    aiProviders,
    setAiProviders,
    aiCurrentProviderIndex,
    setAiCurrentProviderIndex,
    aiSystemPrompt,
    setAiSystemPrompt,
    aiQuickPrompts,
    setAiQuickPrompts,
  } = useAppSettings();

  const [editingProvider, setEditingProvider] = useState<{
    index: number;
    name: string;
    apiUrl: string;
    model: string;
    apiKey: string;
  } | null>(null);
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", apiUrl: "", model: "", apiKey: "" });
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptText, setPromptText] = useState("");

  const handleAddProvider = () => {
    if (!newProvider.name.trim() || !newProvider.apiUrl.trim()) return;
    const provider: AIProvider = {
      name: newProvider.name.trim(),
      apiUrl: newProvider.apiUrl.trim(),
      model: newProvider.model.trim() || "gpt-3.5-turbo",
      apiKey: newProvider.apiKey,
      isDefault: false,
    };
    setAiProviders([...aiProviders, provider]);
    setNewProvider({ name: "", apiUrl: "", model: "", apiKey: "" });
    setShowProviderForm(false);
  };

  const handleUpdateProvider = () => {
    if (!editingProvider || !editingProvider.name.trim() || !editingProvider.apiUrl.trim()) return;
    const updated = [...aiProviders];
    updated[editingProvider.index] = {
      name: editingProvider.name.trim(),
      apiUrl: editingProvider.apiUrl.trim(),
      model: editingProvider.model.trim() || "gpt-3.5-turbo",
      apiKey: editingProvider.apiKey,
      isDefault: updated[editingProvider.index].isDefault,
    };
    setAiProviders(updated);
    setEditingProvider(null);
  };

  const handleDeleteProvider = (index: number) => {
    const updated = aiProviders.filter((_, i) => i !== index);
    setAiProviders(updated);
    if (aiCurrentProviderIndex >= updated.length) {
      setAiCurrentProviderIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleAddPrompt = () => {
    if (!promptText.trim()) return;
    setAiQuickPrompts([
      ...aiQuickPrompts,
      JSON.stringify({ text: promptText.trim(), temperature: 1.0, category: "general" }),
    ]);
    setPromptText("");
  };

  const handleDeletePrompt = (index: number) => {
    setAiQuickPrompts(aiQuickPrompts.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-4">AI 助手开关</h3>
        <SettingCard>
          <SettingRow
            label="启用 AI 助手"
            description="在搜索框旁显示 AI 助手按钮"
            control={
              <Checkbox checked={aiEnabled} onCheckedChange={(v) => setAiEnabled(v as boolean)}>
                <CheckboxIndicator />
              </Checkbox>
            }
          />
        </SettingCard>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">AI 提供商</h3>
          <Button size="sm" variant="outline" onClick={() => setShowProviderForm(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> 添加
          </Button>
        </div>
        <SettingCard className="space-y-3">
          {aiProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无 AI 提供商，请添加</p>
          ) : (
            aiProviders.map((provider, index) => (
              <div
                key={index}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{provider.name}</span>
                    {index === aiCurrentProviderIndex && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        当前
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{provider.model}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    onClick={() =>
                      setEditingProvider({
                        index,
                        name: provider.name,
                        apiUrl: provider.apiUrl,
                        model: provider.model,
                        apiKey: provider.apiKey,
                      })
                    }
                    title="编辑"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-red-500 hover:text-red-600"
                    onClick={() => handleDeleteProvider(index)}
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </SettingCard>
      </div>

      {showProviderForm && (
        <SettingCard>
          <h4 className="text-sm font-medium mb-3">添加 AI 提供商</h4>
          <div className="space-y-3">
            <Input
              placeholder="名称 (如 DeepSeek)"
              value={newProvider.name}
              onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
            />
            <Input
              placeholder="API URL (如 https://api.deepseek.com/v1)"
              value={newProvider.apiUrl}
              onChange={(e) => setNewProvider({ ...newProvider, apiUrl: e.target.value })}
            />
            <Input
              placeholder="模型 (如 deepseek-chat)"
              value={newProvider.model}
              onChange={(e) => setNewProvider({ ...newProvider, model: e.target.value })}
            />
            <div className="relative">
              <Input
                type="password"
                placeholder="API Key"
                value={newProvider.apiKey}
                onChange={(e) => setNewProvider({ ...newProvider, apiKey: e.target.value })}
                className="pr-8"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddProvider}>
                保存
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowProviderForm(false)}>
                取消
              </Button>
            </div>
          </div>
        </SettingCard>
      )}

      {editingProvider && (
        <SettingCard>
          <h4 className="text-sm font-medium mb-3">编辑提供商</h4>
          <div className="space-y-3">
            <Input
              placeholder="名称"
              value={editingProvider.name}
              onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
            />
            <Input
              placeholder="API URL"
              value={editingProvider.apiUrl}
              onChange={(e) => setEditingProvider({ ...editingProvider, apiUrl: e.target.value })}
            />
            <Input
              placeholder="模型"
              value={editingProvider.model}
              onChange={(e) => setEditingProvider({ ...editingProvider, model: e.target.value })}
            />
            <div className="relative">
              <Input
                type="password"
                placeholder="API Key"
                value={editingProvider.apiKey}
                onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                className="pr-8"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdateProvider}>
                更新
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingProvider(null)}>
                取消
              </Button>
            </div>
          </div>
        </SettingCard>
      )}

      <div>
        <h3 className="text-base font-semibold mb-4">系统提示词</h3>
        <SettingCard>
          <textarea
            value={aiSystemPrompt}
            onChange={(e) => setAiSystemPrompt(e.target.value)}
            rows={3}
            className="w-full bg-transparent border border-input rounded-md p-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="输入系统提示词..."
          />
        </SettingCard>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">快速提示词</h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowPromptEditor(!showPromptEditor)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> 添加
          </Button>
        </div>
        <SettingCard className="space-y-2">
          {aiQuickPrompts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">暂无快速提示词</p>
          ) : (
            aiQuickPrompts.map((prompt, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-background/50"
              >
                <span className="flex-1 text-sm truncate">
                  {(() => {
                    try {
                      return JSON.parse(prompt).text;
                    } catch {
                      return prompt;
                    }
                  })()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 text-red-500 hover:text-red-600"
                  onClick={() => handleDeletePrompt(index)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
          {showPromptEditor && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <Input
                placeholder="输入提示词文本"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddPrompt}>
                添加
              </Button>
            </div>
          )}
        </SettingCard>
      </div>
    </div>
  );
}

function EngineManager() {
  const { searchEngines, setSearchEngines, currentEngineIndex, setCurrentEngineIndex } =
    useAppSettings();
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

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
    setShowForm(false);
  };

  const handleEdit = (index: number) => {
    setName(searchEngines[index].name);
    setUrl(searchEngines[index].url);
    setEditingIndex(index);
    setShowForm(true);
  };

  const handleDelete = (index: number) => {
    const updated = searchEngines.filter((_, i) => i !== index);
    setSearchEngines(updated);
    if (currentEngineIndex >= updated.length) {
      setCurrentEngineIndex(Math.max(0, updated.length - 1));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">搜索引擎管理</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowForm(true);
            setEditingIndex(null);
            setName("");
            setUrl("");
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-1" /> 添加
        </Button>
      </div>
      <SettingCard className="space-y-2">
        {searchEngines.map((engine, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50"
          >
            <div className="w-7 h-7 rounded flex items-center justify-center bg-muted text-xs font-bold text-muted-foreground">
              {engine.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{engine.name}</span>
                {index === currentEngineIndex && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                    默认
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{engine.url}</p>
            </div>
            <div className="flex items-center gap-1">
              {index !== currentEngineIndex && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6"
                  onClick={() => setCurrentEngineIndex(index)}
                  title="设为默认"
                >
                  <Check className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6"
                onClick={() => handleEdit(index)}
                title="编辑"
              >
                <Settings className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-6 h-6 text-red-500 hover:text-red-600"
                onClick={() => handleDelete(index)}
                title="删除"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </SettingCard>

      {showForm && (
        <SettingCard className="mt-4">
          <h4 className="text-sm font-medium mb-3">
            {editingIndex !== null ? "编辑搜索引擎" : "添加搜索引擎"}
          </h4>
          <div className="space-y-3">
            <Input placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="搜索URL (如 https://example.com/search?q=)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave}>
                {editingIndex !== null ? "更新" : "保存"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
                取消
              </Button>
            </div>
          </div>
        </SettingCard>
      )}
    </div>
  );
}

function WidgetListSettings() {
  const [widgets] = useState(() => getAllTypes());

  return (
    <div>
      <h3 className="text-base font-semibold mb-4">可用小部件</h3>
      <SettingCard>
        {widgets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">暂无可用小部件</p>
        ) : (
          <div className="space-y-3">
            {widgets.map((w) => (
              <div
                key={w.type}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50 hover:border-primary/30 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Puzzle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">{w.description}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mt-1 inline-block">
                    {w.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </SettingCard>
    </div>
  );
}

function SyncSettings() {
  const { syncMode, setSyncMode, syncInterval, setSyncInterval } = useAppSettings();
  const [status, setStatus] = useState<CloudDataInfo | null | "loading">(null);

  const refreshStatus = useCallback(async () => {
    setStatus("loading");
    try {
      const info = await dataSync.check();
      setStatus(info);
    } catch {
      setStatus(null);
    }
  }, []);

  const handleUpload = async () => {
    try {
      await dataSync.upload();
      showNotification({
        title: "上传成功",
        message: "设置已同步到云端",
        type: "success",
        duration: 2000,
        forceLocal: true,
      });
      refreshStatus();
    } catch (err) {
      showNotification({
        title: "上传失败",
        message: String(err),
        type: "error",
        duration: 3000,
        forceLocal: true,
      });
    }
  };

  const handleDownload = async () => {
    try {
      await dataSync.download();
      showNotification({
        title: "下载成功",
        message: "已从云端恢复设置",
        type: "success",
        duration: 2000,
        forceLocal: true,
      });
      refreshStatus();
    } catch (err) {
      showNotification({
        title: "下载失败",
        message: String(err),
        type: "error",
        duration: 3000,
        forceLocal: true,
      });
    }
  };

  const handleClear = async () => {
    try {
      await dataSync.clear();
      showNotification({
        title: "已清除",
        message: "云端数据已清除",
        type: "success",
        duration: 2000,
        forceLocal: true,
      });
      refreshStatus();
    } catch (err) {
      showNotification({
        title: "清除失败",
        message: String(err),
        type: "error",
        duration: 3000,
        forceLocal: true,
      });
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-4">同步模式</h3>
        <SettingCard>
          <SettingRow
            label="同步模式"
            description="选择数据同步方式"
            control={
              <Select
                value={syncMode}
                onValueChange={(v) => setSyncMode(v as "disabled" | "upload" | "download")}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">关闭</SelectItem>
                  <SelectItem value="upload">上传</SelectItem>
                  <SelectItem value="download">下载</SelectItem>
                </SelectContent>
              </Select>
            }
          />
          {syncMode !== "disabled" && (
            <SettingRow
              label="同步间隔"
              description="自动同步的时间间隔（秒），0 表示手动同步"
              control={
                <Input
                  type="number"
                  min={0}
                  value={syncInterval}
                  onChange={(e) => setSyncInterval(Number(e.target.value))}
                  className="w-20 text-sm"
                />
              }
            />
          )}
        </SettingCard>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-4">云端状态</h3>
        <SettingCard>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">状态：</span>
              {status === "loading" ? (
                <span className="text-primary">检查中...</span>
              ) : status ? (
                <span className="text-green-600 dark:text-green-400">
                  可用（{status.keyCount} 个键，{Math.round(status.dataSize / 1024)}KB / 100KB）
                </span>
              ) : (
                <span className="text-muted-foreground">云端无数据</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={refreshStatus}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> 检查
              </button>
              <button
                onClick={handleUpload}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center gap-1"
              >
                <Upload className="w-3 h-3" /> 上传
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" /> 下载
              </button>
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> 清除
              </button>
            </div>
          </div>
        </SettingCard>
      </div>
    </div>
  );
}

function AboutSection() {
  const manifest = browser.runtime.getManifest();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold mb-4">关于</h3>
        <SettingCard>
          <div className="space-y-3">
            <SettingRow
              label="版本号"
              control={
                <span className="text-sm font-mono text-muted-foreground">{manifest.version}</span>
              }
            />
            <SettingRow
              label="GitHub 开源地址"
              control={
                <button
                  onClick={() => window.open("https://github.com/xzy-nine/newtab", "_blank")}
                  className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 transition-colors"
                >
                  GitHub <ExternalLink className="w-3 h-3" />
                </button>
              }
            />
            <SettingRow
              label="Edge 商店地址"
              control={
                <button
                  onClick={() =>
                    window.open(
                      "https://microsoftedge.microsoft.com/addons/detail/lpdhbhkcbnhldcpcbocplhgeooabhbme",
                      "_blank",
                    )
                  }
                  className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 transition-colors"
                >
                  商店 <ExternalLink className="w-3 h-3" />
                </button>
              }
            />
          </div>
        </SettingCard>
      </div>
    </div>
  );
}
