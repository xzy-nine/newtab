import { useState, useRef, useCallback, useEffect } from "react";
import { getMessage } from "@/lib/i18n";

interface TimerWidgetProps {
  data?: Record<string, unknown>;
  onDataChange?: (data: Record<string, unknown>) => void;
  containerWidth?: number;
  containerHeight?: number;
}

const DIGIT_ORDER = ["m1", "m2", "s1", "s2"] as const;
type DigitPos = (typeof DIGIT_ORDER)[number];

function timeFromDigits(digits: Record<DigitPos, number>): number {
  const m = digits.m1 * 10 + digits.m2;
  const s = digits.s1 * 10 + digits.s2;
  return (m * 60 + s) * 10;
}

function digitsFromTime(time: number): Record<DigitPos, number> {
  const s = Math.floor(time / 10) % 60;
  const m = Math.floor(time / 600);
  return { m1: Math.floor(m / 10), m2: m % 10, s1: Math.floor(s / 10), s2: s % 10 };
}

export function TimerWidget({
  data,
  onDataChange,
  containerWidth = 200,
  containerHeight: _containerHeight = 150,
}: TimerWidgetProps) {
  const [time, setTime] = useState<number>((data?.time as number) ?? 0);
  const [isRunning, setIsRunning] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [initialTime, setInitialTime] = useState<number>((data?.initialTime as number) ?? 0);
  const [editingPos, setEditingPos] = useState<DigitPos | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const resetClickTime = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const digitsRef = useRef<Record<DigitPos, number>>(digitsFromTime(time));
  const timeRef = useRef(time);
  const isRunningRef = useRef(isRunning);
  const isCountdownRef = useRef(isCountdown);
  const initialTimeRef = useRef(initialTime);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);
  useEffect(() => {
    isCountdownRef.current = isCountdown;
  }, [isCountdown]);
  useEffect(() => {
    initialTimeRef.current = initialTime;
  }, [initialTime]);
  useEffect(() => {
    digitsRef.current = digitsFromTime(time);
  }, [time]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const saveState = useCallback(
    (t: number, running: boolean, cd: boolean, init: number) => {
      if (onDataChange)
        onDataChange({ time: t, isRunning: running, isCountdown: cd, initialTime: init });
    },
    [onDataChange],
  );

  const showTime = useCallback((t: number) => {
    digitsRef.current = digitsFromTime(t);
    setTime(t);
  }, []);

  const updateDigits = useCallback(
    (d: Record<DigitPos, number>) => {
      digitsRef.current = d;
      const t = timeFromDigits(d);
      setTime(t);
      timeRef.current = t;
      checkCountdownMode(t);
      saveState(t, isRunningRef.current, isCountdownRef.current, initialTimeRef.current);
    },
    [saveState, checkCountdownMode],
  );

  const checkCountdownMode = useCallback((t: number) => {
    if (t > 0) {
      if (!isCountdownRef.current) {
        setIsCountdown(true);
        isCountdownRef.current = true;
        setInitialTime(t);
        initialTimeRef.current = t;
      }
    } else {
      if (isCountdownRef.current) {
        setIsCountdown(false);
        isCountdownRef.current = false;
        setInitialTime(0);
        initialTimeRef.current = 0;
      }
    }
  }, []);

  const toggleTimer = useCallback(() => {
    if (isRunningRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setIsRunning(false);
      saveState(timeRef.current, false, isCountdownRef.current, initialTimeRef.current);
    } else {
      if (isCountdownRef.current && timeRef.current === 0) return;
      timerRef.current = setInterval(() => {
        if (isCountdownRef.current) {
          const next = timeRef.current - 1;
          if (next <= 0) {
            showTime(0);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
            setIsRunning(false);
            setIsCountdown(false);
            isCountdownRef.current = false;
            setInitialTime(0);
            initialTimeRef.current = 0;
            saveState(0, false, false, 0);
          } else {
            showTime(next);
            saveState(next, true, true, initialTimeRef.current);
          }
        } else {
          const next = timeRef.current + 1;
          showTime(next);
          saveState(next, true, false, 0);
        }
      }, 100);
      setIsRunning(true);
      setEditingPos(null);
    }
  }, [showTime, saveState]);

  const handleReset = useCallback(() => {
    const now = Date.now();
    if (!confirmReset || now - resetClickTime.current > 3000) {
      setConfirmReset(true);
      resetClickTime.current = now;
      setTimeout(() => {
        if (now === resetClickTime.current) setConfirmReset(false);
      }, 3000);
      return;
    }
    if (now - resetClickTime.current > 1000) return;
    setConfirmReset(false);
    resetClickTime.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setIsRunning(false);
    setIsCountdown(false);
    isCountdownRef.current = false;
    setInitialTime(0);
    initialTimeRef.current = 0;
    showTime(0);
    saveState(0, false, false, 0);
  }, [confirmReset, showTime, saveState]);

  const handleDigitClick = useCallback(
    (pos: DigitPos) => {
      if (isRunning) return;
      setEditingPos(pos);
    },
    [isRunning],
  );

  const incrementDigit = useCallback(
    (pos: DigitPos) => {
      const d = { ...digitsRef.current };
      if (pos === "s2") {
        d.s2 = (d.s2 + 1) % 10;
        if (d.s2 === 0) {
          d.s1 = (d.s1 + 1) % 6;
          if (d.s1 === 0) {
            d.m2 = (d.m2 + 1) % 10;
            if (d.m2 === 0) d.m1 = (d.m1 + 1) % 10;
          }
        }
      } else if (pos === "s1") {
        d.s1 = (d.s1 + 1) % 6;
        if (d.s1 === 0) {
          d.m2 = (d.m2 + 1) % 10;
          if (d.m2 === 0) d.m1 = (d.m1 + 1) % 10;
        }
      } else if (pos === "m2") {
        d.m2 = (d.m2 + 1) % 10;
        if (d.m2 === 0) d.m1 = (d.m1 + 1) % 10;
      } else if (pos === "m1") {
        d.m1 = (d.m1 + 1) % 10;
      }
      updateDigits(d);
    },
    [updateDigits],
  );

  const decrementDigit = useCallback(
    (pos: DigitPos) => {
      const d = { ...digitsRef.current };
      const dec = (val: number, max: number) => (val === 0 ? max : val - 1);
      if (pos === "s2") {
        if (d.s2 === 0) {
          d.s2 = 9;
          d.s1 = d.s1 === 0 ? 5 : d.s1 - 1;
          if (d.s2 === 9 && d.s1 === 0) {
            d.m2 = d.m2 === 0 ? 9 : d.m2 - 1;
            if (d.m2 === 9) d.m1 = dec(d.m1, 9);
          }
        } else d.s2--;
        if (d.s1 < 0) {
          d.s1 = 5;
          d.m2 = d.m2 === 0 ? 9 : d.m2 - 1;
        }
      } else if (pos === "s1") {
        d.s1 = dec(d.s1, 5);
        if (d.s1 === 5) {
          d.m2 = d.m2 === 0 ? 9 : d.m2 - 1;
          if (d.m2 === 9) d.m1 = dec(d.m1, 9);
        }
      } else if (pos === "m2") {
        d.m2 = dec(d.m2, 9);
        if (d.m2 === 9) d.m1 = dec(d.m1, 9);
      } else if (pos === "m1") {
        d.m1 = dec(d.m1, 9);
      }
      updateDigits(d);
    },
    [updateDigits],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingPos || isRunning) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const val = parseInt(e.key);
        const d = { ...digitsRef.current };
        d[editingPos] = val;
        updateDigits(d);
        const idx = DIGIT_ORDER.indexOf(editingPos);
        const nextIdx = (idx + 1) % DIGIT_ORDER.length;
        setEditingPos(DIGIT_ORDER[nextIdx]);
      } else if (e.key === "Tab") {
        e.preventDefault();
        const idx = DIGIT_ORDER.indexOf(editingPos);
        const nextIdx = e.shiftKey
          ? (idx - 1 + DIGIT_ORDER.length) % DIGIT_ORDER.length
          : (idx + 1) % DIGIT_ORDER.length;
        setEditingPos(DIGIT_ORDER[nextIdx]);
      } else if (e.key === "Escape" || e.key === "Enter") {
        setEditingPos(null);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        incrementDigit(editingPos);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        decrementDigit(editingPos);
      }
    },
    [editingPos, isRunning, updateDigits, incrementDigit, decrementDigit],
  );

  const d = digitsFromTime(time);
  const ms = time % 10;
  const title = isCountdown
    ? getMessage("timerCountdown", "倒计时")
    : getMessage("timerStopwatch", "秒表");
  const isCompact = containerWidth < 160;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full select-none overflow-hidden">
      <div className="widget-title text-xs truncate mb-1">{title}</div>
      <div
        className="flex items-center justify-center gap-0.5 font-mono"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        style={{ fontSize: isCompact ? "18px" : "24px" }}
      >
        {(["m1", "m2"] as const).map((pos) => (
          <span
            key={pos}
            className={`relative cursor-pointer rounded px-0.5 ${editingPos === pos ? "ring-1 ring-primary bg-primary/20" : "hover:bg-white/10"}`}
            onClick={() => handleDigitClick(pos)}
          >
            {d[pos]}
          </span>
        ))}
        <span className="mx-0.5">:</span>
        {(["s1", "s2"] as const).map((pos) => (
          <span
            key={pos}
            className={`relative cursor-pointer rounded px-0.5 ${editingPos === pos ? "ring-1 ring-primary bg-primary/20" : "hover:bg-white/10"}`}
            onClick={() => handleDigitClick(pos)}
          >
            {d[pos]}
          </span>
        ))}
        <span className="text-xs ml-0.5 opacity-60">{ms}</span>
      </div>
      {editingPos && !isRunning && (
        <div className="flex gap-1 mt-1 text-xs">
          <button
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
            onClick={() => incrementDigit(editingPos)}
          >
            ▲
          </button>
          <button
            className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
            onClick={() => decrementDigit(editingPos)}
          >
            ▼
          </button>
        </div>
      )}
      <div className="flex gap-2 mt-1.5">
        <button
          className={`px-3 py-0.5 rounded text-xs cursor-pointer ${isRunning ? "bg-red-500/80 text-white" : "bg-primary text-primary-foreground"}`}
          onClick={toggleTimer}
        >
          {isRunning ? getMessage("timerPause", "暂停") : getMessage("timerStart", "开始")}
        </button>
        <button
          className={`px-3 py-0.5 rounded text-xs cursor-pointer ${confirmReset ? "text-red-400 font-bold" : ""}`}
          style={{ background: "var(--widget-btn-bg, rgba(128,128,128,0.15))", color: "inherit" }}
          onClick={handleReset}
        >
          {confirmReset
            ? getMessage("timerConfirm", "确认?")
            : isCompact
              ? "R"
              : getMessage("timerReset", "重置")}
        </button>
      </div>
    </div>
  );
}
