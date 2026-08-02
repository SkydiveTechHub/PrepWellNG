"use client";

import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  suffix,
}: {
  value: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const duration = 1400;
        const start = performance.now();
        let raf: number;

        const step = (t: number) => {
          const progress = Math.min(1, (t - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(value * eased));
          if (progress < 1) raf = requestAnimationFrame(step);
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={ref} className="tabular-nums">
      {display.toLocaleString("en-NG")}
      {suffix}
    </span>
  );
}

const BAND_STATS = [
  { value: 100000, suffix: "+", label: "lessons completed" },
  { value: 50000, suffix: "+", label: "questions answered" },
  { value: 10000, suffix: "+", label: "students learning" },
  { value: 95, suffix: "%", label: "satisfaction rate" },
];

export function StatsBand() {
  return (
    <section>
      <div className="landing-container pb-20 lg:pb-28">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-blue-600 to-brand px-6 py-14 text-center shadow-lift sm:px-14">
          <div className="bg-grid absolute inset-0 opacity-20" aria-hidden />
          <div
            className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div
            className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full bg-white/10 blur-2xl"
            aria-hidden
          />
          <div className="relative">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-100">
              The numbers that matter
            </p>
            <div className="mt-10 grid grid-cols-2 gap-8 lg:grid-cols-4">
              {BAND_STATS.map((stat) => (
                <div key={stat.label}>
                  <p className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                    <AnimatedNumber value={stat.value} suffix={stat.suffix} />
                  </p>
                  <p className="mt-2 text-sm font-bold text-blue-100">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
