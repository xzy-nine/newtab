import { useState, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useAppSettings } from "@/lib/app-settings-store";

interface DigitProps {
  value: number;
}

function Digit({ value }: DigitProps) {
  return (
    <div className={`digit digit-${value}`}>
      <div className="segment segment-h segment-a" />
      <div className="segment segment-v segment-b" />
      <div className="segment segment-v segment-c" />
      <div className="segment segment-h segment-d" />
      <div className="segment segment-v segment-e" />
      <div className="segment segment-v segment-f" />
      <div className="segment segment-h segment-g" />
    </div>
  );
}

function Split({ blink = true }: { blink?: boolean }) {
  return <div className={`split ${blink ? "blink" : ""}`} />;
}

export function ClockWidget() {
  const { use12hClock, showSeconds, showDate } = useAppSettings();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), showSeconds ? 200 : 1000);
    return () => clearInterval(timer);
  }, [showSeconds]);

  const hours = use12hClock ? now.getHours() % 12 || 12 : now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const date = format(now, "yyyy年MM月dd日 EEEE", { locale: zhCN });

  return (
    <div className="text-center">
      <div className="time">
        <div className="hour-group">
          <Digit value={Math.floor(hours / 10)} />
          <Digit value={hours % 10} />
        </div>
        <Split />
        <div className="minute-group">
          <Digit value={Math.floor(minutes / 10)} />
          <Digit value={minutes % 10} />
        </div>
        {showSeconds && (
          <>
            <Split />
            <div className="second-group">
              <Digit value={Math.floor(seconds / 10)} />
              <Digit value={seconds % 10} />
            </div>
          </>
        )}
      </div>
      {showDate && <div className="text-lg text-white/80 drop-shadow-md mt-8">{date}</div>}
    </div>
  );
}
