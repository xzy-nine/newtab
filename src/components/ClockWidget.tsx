import { useState, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useAppSettings } from "@/lib/app-settings-store";

export function ClockWidget() {
  const { use12hClock, showSeconds } = useAppSettings();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), showSeconds ? 200 : 1000);
    return () => clearInterval(timer);
  }, [showSeconds]);

  const timeFormat = use12hClock
    ? showSeconds
      ? "hh:mm:ss"
      : "hh:mm"
    : showSeconds
      ? "HH:mm:ss"
      : "HH:mm";
  const time = format(now, timeFormat, { locale: zhCN });
  const date = format(now, "yyyy年MM月dd日 EEEE", { locale: zhCN });

  return (
    <div className="text-center">
      <div className="text-6xl font-light text-white drop-shadow-lg">{time}</div>
      <div className="text-lg text-white/80 drop-shadow-md mt-2">{date}</div>
    </div>
  );
}
