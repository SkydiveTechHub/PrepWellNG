"use client";

import { useEffect, useState } from "react";

const TARGET_TIME = new Date("2027-05-03T09:00:00+01:00").getTime();

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function computeParts(now: number): Parts {
  const ms = Math.max(0, TARGET_TIME - now);
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
  };
}

const UNITS: { key: keyof Parts; label: string }[] = [
  { key: "days", label: "days" },
  { key: "hours", label: "hours" },
  { key: "minutes", label: "mins" },
  { key: "seconds", label: "secs" },
];

export function Countdown() {
  const [parts, setParts] = useState<Parts>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const tick = () => setParts(computeParts(Date.now()));
    const timeoutId = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      {UNITS.map((unit, i) => (
        <div key={unit.key} className="flex items-center gap-3 sm:gap-4">
          {i > 0 && <span className="text-2xl font-bold text-primary/40">:</span>}
          <div className="flex flex-col items-center">
            <span className="min-w-[3ch] text-center text-3xl font-bold tabular-nums text-foreground sm:text-4xl">
              {String(parts[unit.key]).padStart(2, "0")}
            </span>
            <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted">
              {unit.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
