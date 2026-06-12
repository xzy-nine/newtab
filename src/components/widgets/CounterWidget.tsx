import { useState, useRef, useCallback, useEffect } from "react";
import { getMessage } from "@/lib/i18n";

interface CounterWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

function calcFontSize(textLength: number, w: number, h: number): number {
  const base = Math.min(w, h) / 4;
  const factor = Math.pow(0.8, Math.max(0, textLength - 2));
  let size = base * factor;
  size = Math.min(size, w / (4 + textLength * 0.8));
  size = Math.min(size, h / 3.5);
  return Math.max(14, Math.min(size, 64));
}

export function CounterWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight = 150,
}: CounterWidgetProps) {
  const [count, setCount] = useState<number>((data?.count as number) ?? 0);
  const [title, setTitle] = useState<string>(
    (data?.title as string) || getMessage("counterDefaultTitle", "计数"),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressSpeed = useRef(200);
  const isLongPressing = useRef(false);
  const speedupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRelease = useRef(0);
  const resetClickTime = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const clearTimers = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (longPressInterval.current) clearInterval(longPressInterval.current);
    if (speedupTimer.current) clearTimeout(speedupTimer.current);
    pressTimer.current = null;
    longPressInterval.current = null;
    speedupTimer.current = null;
    isLongPressing.current = false;
    lastRelease.current = Date.now();
    setTimeout(() => {
      if (Date.now() - lastRelease.current >= 5000) {
        longPressSpeed.current = 200;
      }
    }, 1000);
  }, []);

  const startLongPress = useCallback(
    (delta: number) => {
      pressTimer.current = setTimeout(() => {
        isLongPressing.current = true;
        longPressInterval.current = setInterval(() => {
          setCount((prev) => {
            const next = prev + delta;
            if (onDataChange) onDataChange({ count: next, title });
            return next;
          });
        }, longPressSpeed.current);
        speedupTimer.current = setTimeout(function speedup() {
          if (longPressSpeed.current > 50) {
            longPressSpeed.current = Math.max(50, longPressSpeed.current - 30);
            if (longPressInterval.current) clearInterval(longPressInterval.current);
            longPressInterval.current = setInterval(() => {
              setCount((prev) => {
                const next = prev + delta;
                if (onDataChange) onDataChange({ count: next, title });
                return next;
              });
            }, longPressSpeed.current);
            speedupTimer.current = setTimeout(speedup, 1000);
          }
        }, 1000);
      }, 500);
    },
    [onDataChange, title],
  );

  const handlePointerDown = useCallback(
    (delta: number) => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setCount((prev) => {
        const next = prev + delta;
        if (onDataChange) onDataChange({ count: next, title });
        return next;
      });
      startLongPress(delta);
    },
    [startLongPress, onDataChange, title],
  );

  const handlePointerUp = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  const handlePointerLeave = useCallback(() => {
    if (isLongPressing.current) clearTimers();
  }, [clearTimers]);

  const handleReset = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const now = Date.now();
      if (!confirmReset || now - resetClickTime.current > 3000) {
        setConfirmReset(true);
        resetClickTime.current = now;
        setTimeout(() => {
          if (now === resetClickTime.current) {
            setConfirmReset(false);
          }
        }, 3000);
        return;
      }
      if (now - resetClickTime.current > 1000) return;
      setCount(0);
      setConfirmReset(false);
      resetClickTime.current = 0;
      if (onDataChange) onDataChange({ count: 0, title });
    },
    [confirmReset, onDataChange, title],
  );

  const handleTitleDblClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (isEditing) return;
      setEditValue(title);
      setIsEditing(true);
    },
    [isEditing, title],
  );

  const saveTitle = useCallback(() => {
    let newTitle = editValue.trim() || getMessage("counterDefaultTitle", "计数");
    const maxLen = containerWidth < 180 ? 10 : 15;
    if (newTitle.length > maxLen) newTitle = newTitle.substring(0, maxLen) + "...";
    setTitle(newTitle);
    setIsEditing(false);
    if (onDataChange) onDataChange({ count, title: newTitle });
  }, [editValue, containerWidth, count, onDataChange]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const fontSize = calcFontSize(count.toString().length, containerWidth, containerHeight);
  const titleFontSize =
    containerHeight < 120 ? 11 : Math.max(12, Math.min(16, containerWidth / 14));
  const isCompact = containerWidth <= 135 || containerHeight <= 100;

  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full select-none overflow-hidden"
      style={{ padding: isCompact ? "6px" : undefined }}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveTitle();
          }}
          onBlur={saveTitle}
          onClick={(e) => e.stopPropagation()}
          maxLength={20}
          className="w-4/5 bg-transparent border border-dashed border-white/50 text-center text-sm rounded px-1 mb-1 outline-none widget-title"
          style={{
            color: "inherit",
            fontSize: `${titleFontSize}px`,
            lineHeight: isCompact ? "1.2" : undefined,
          }}
        />
      ) : (
        <div
          className="widget-title truncate px-1 mb-1 cursor-pointer"
          style={{
            fontSize: `${titleFontSize}px`,
            minHeight: isCompact ? "13px" : undefined,
            lineHeight: isCompact ? "1.2" : undefined,
          }}
          onDoubleClick={handleTitleDblClick}
        >
          {title}
        </div>
      )}
      <div className="flex items-center justify-center gap-2 w-full flex-1">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full text-lg font-bold cursor-pointer select-none"
          style={{ background: "var(--widget-btn-bg, rgba(128,128,128,0.2))", color: "inherit" }}
          onPointerDown={handlePointerDown(-1)}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
        >
          -
        </button>
        <div
          className="font-mono font-bold text-center flex-1"
          style={{ fontSize: `${fontSize}px`, lineHeight: 1 }}
        >
          {count}
        </div>
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full text-lg font-bold cursor-pointer select-none"
          style={{ background: "var(--widget-btn-bg, rgba(128,128,128,0.2))", color: "inherit" }}
          onPointerDown={handlePointerDown(1)}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onPointerCancel={handlePointerUp}
        >
          +
        </button>
      </div>
      <button
        className={`text-xs px-2 py-0.5 rounded cursor-pointer select-none mt-1 ${confirmReset ? "text-red-400 font-bold" : ""}`}
        style={{ background: "var(--widget-btn-bg, rgba(128,128,128,0.15))", color: "inherit" }}
        onClick={handleReset}
      >
        {confirmReset
          ? getMessage("counterResetConfirm", "确认重置?")
          : getMessage("counterReset", "重置")}
      </button>
    </div>
  );
}
