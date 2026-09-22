import { useEffect } from "react";
import { registerWidget, getAllTypes } from "@/lib/widget-registry";
import { getMessage } from "@/lib/i18n";
import { CounterWidget } from "@/components/widgets/counter/CounterWidget";
import { TimerWidget } from "@/components/widgets/timer/TimerWidget";
import { NoteWidget } from "@/components/widgets/note/NoteWidget";
import { WeatherWidget } from "@/components/widgets/weather/WeatherWidget";
import { WeatherForecastPopup } from "@/components/widgets/weather/WeatherForecastPopup";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function useWidgetRegistration() {
  useEffect(() => {
    registerWidget("counter", {
      meta: { type: "counter", name: "计数器", description: "简单的计数器小部件", icon: "counter" },
      config: {
        defaultWidth: 135,
        defaultHeight: 100,
        minWidth: 135,
        minHeight: 100,
        maxWidth: 300,
        maxHeight: 300,
      },
      component: CounterWidget,
    });
    registerWidget("timer", {
      meta: { type: "timer", name: "计时器", description: "提供秒表功能", icon: "timer" },
      config: {
        defaultWidth: 200,
        defaultHeight: 120,
        minWidth: 150,
        minHeight: 100,
        maxWidth: 300,
        maxHeight: 250,
      },
      component: TimerWidget,
    });
    registerWidget("note", {
      meta: {
        type: "note",
        name: "便签",
        description: "支持Markdown格式的便签小部件",
        icon: "note",
      },
      config: {
        defaultWidth: 200,
        defaultHeight: 150,
        minWidth: 200,
        minHeight: 150,
        maxWidth: 300,
        maxHeight: 300,
      },
      component: NoteWidget,
    });
    registerWidget("weather", {
      meta: {
        type: "weather",
        name: getMessage("weatherWidgetName", "天气"),
        description: getMessage("weatherWidgetDesc", "实时天气与所在地区，城市可用 IP 自动定位"),
        icon: "weather",
      },
      config: {
        defaultWidth: 200,
        defaultHeight: 150,
        minWidth: 140,
        minHeight: 110,
        maxWidth: 400,
        maxHeight: 300,
      },
      component: WeatherWidget,
      // 展开后按需拉取逐小时/逐天预报（24h 缓存），磁贴本身只显示实时天气
      popup: {
        title: getMessage("weatherForecastTitle", "天气预报"),
        content: WeatherForecastPopup,
      },
    });
  }, []);
}

interface WidgetAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: string) => void;
}

export function WidgetAddDialog({ open, onOpenChange, onSelect }: WidgetAddDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{getMessage("addWidget", "添加小部件")}</DialogTitle>
        <DialogDescription>
          {getMessage("selectWidgetType", "选择要添加的小部件")}
        </DialogDescription>
        <div className="flex flex-col gap-2 mt-2">
          {getAllTypes().map((type) => (
            <Button
              key={type.type}
              variant="outline"
              className="justify-start"
              onClick={() => {
                onSelect(type.type);
                onOpenChange(false);
              }}
            >
              {type.name}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
