"use client";

import { useState } from "react";
import {
  LuChartColumn,
  LuBookOpen,
  LuBrainCircuit,
  LuCheck,
  LuClipboardList,
  LuClock,
  LuFlame,
  LuLayoutDashboard,
  LuPlay,
  LuSparkles,
  LuTrendingUp,
  LuWandSparkles,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LuLayoutDashboard },
  { key: "lesson", label: "Lesson", icon: LuBookOpen },
  { key: "flashcards", label: "Flashcards", icon: LuBrainCircuit },
  { key: "tutor", label: "AI Tutor", icon: LuWandSparkles },
  { key: "quiz", label: "Quiz", icon: LuClipboardList },
  { key: "analytics", label: "Analytics", icon: LuChartColumn },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ScreenFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl surface hairline-strong shadow-lift",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b hairline px-5 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
        <p className="ml-3 text-xs font-bold ink-faint">{title}</p>
      </div>
      {children}
    </div>
  );
}

function DashboardScreen() {
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-5 sm:p-6">
      <div className="sm:col-span-3">
        <p className="text-[10px] font-bold uppercase tracking-widest ink-faint">
          Good morning, Adaeze
        </p>
        <h3 className="mt-1 text-lg font-extrabold ink">
          Ready to keep your streak going?
        </h3>
        <div className="mt-4 space-y-3">
          {[
            { title: "Mathematics · Quadratic Equations", progress: 68, color: "bg-primary" },
            { title: "English · Comprehension", progress: 42, color: "bg-brand" },
            { title: "Biology · Cell Structure", progress: 90, color: "bg-success" },
          ].map((row) => (
            <div
              key={row.title}
              className="rounded-xl surface-2 p-3.5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-bold ink">{row.title}</p>
                <span className="text-[10px] font-extrabold ink-faint">
                  {row.progress}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className={cn("h-full rounded-full", row.color)}
                  style={{ width: `${row.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:col-span-2">
        <div className="rounded-xl bg-gradient-to-br from-primary to-brand p-4 text-white shadow-soft">
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">
            Next mock exam
          </p>
          <p className="mt-1 text-sm font-extrabold">JAMB UTME · Physics</p>
          <p className="mt-0.5 text-[11px] text-blue-100">Sat, 9:00 AM</p>
          <span className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
            <LuPlay className="h-3 w-3" /> Start
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-xl surface-2 p-4">
          <LuFlame className="h-6 w-6 text-accent" />
          <div>
            <p className="text-lg font-extrabold leading-none ink">7 days</p>
            <p className="text-[10px] font-bold uppercase tracking-widest ink-faint">
              streak
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-lg font-extrabold leading-none text-success">
              82%
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest ink-faint">
              accuracy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonScreen() {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-primary-soft text-primary-soft-foreground">
          Biology · SS2
        </span>
        <span className="flex items-center gap-1 text-[11px] font-bold ink-faint">
          <LuClock className="h-3.5 w-3.5" /> 8 min read
        </span>
      </div>
      <h3 className="mt-3 text-lg font-extrabold ink">
        Osmosis and the Movement of Water
      </h3>
      <p className="mt-2 text-sm leading-relaxed ink-muted">
        Osmosis is the movement of water molecules across a semi-permeable
        membrane, from a region of higher water concentration to lower water
        concentration.
      </p>
      <div className="mt-4 rounded-2xl border-l-4 border-primary bg-primary-soft/60 p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
          Worked example
        </p>
        <p className="mt-1 text-sm font-semibold text-foreground">
          A potato strip placed in salt water becomes limp because water moves
          out of the cells by osmosis.
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex justify-between text-[11px] font-bold ink-faint">
            <span>Lesson progress</span>
            <span>3 / 5</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-3/5 rounded-full bg-primary" />
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white">
          Continue <LuPlay className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  );
}

function FlashcardsScreen() {
  return (
    <div className="grid items-center gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <div className="relative">
        <div className="absolute -inset-3 rounded-3xl bg-gradient-to-br from-primary/15 to-brand/15 blur-xl" aria-hidden />
        <div className="relative flex aspect-[4/3] flex-col justify-between rounded-2xl surface-2 hairline p-6 shadow-lift">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
            Question
          </p>
          <p className="text-base font-extrabold ink sm:text-lg">
            What is the capital of a country where rivers flow into the sea?
          </p>
          <span className="text-[11px] font-bold ink-faint">
            Economics · SS2
          </span>
        </div>
      </div>
      <div>
        <div className="rounded-2xl bg-gradient-to-br from-primary to-brand p-6 text-white shadow-soft">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-100">
            Answer
          </p>
          <p className="mt-2 text-base font-extrabold leading-snug">
            The answer shows the economic principle behind trade routes —
            cities grow where goods and people can move.
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full",
                  i === 0 ? "w-5 bg-primary" : "w-2.5 bg-secondary",
                )}
              />
            ))}
          </div>
          <span className="text-[11px] font-bold ink-faint">Card 1 of 4</span>
        </div>
      </div>
    </div>
  );
}

function TutorScreen() {
  return (
    <div className="space-y-4 p-5 sm:p-6">
      <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl rounded-tl-md surface-2 hairline p-3.5">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <LuSparkles className="h-3.5 w-3.5" />
        </span>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold ink">
            Explain the mole concept simply.
          </p>
          <p className="text-xs font-semibold ink">
            And why is 1 mole = 6.022 × 10²³?
          </p>
        </div>
      </div>
      <div className="ml-auto max-w-[88%] rounded-2xl rounded-tr-md bg-gradient-to-br from-primary to-brand p-3.5 text-white shadow-soft">
        <p className="text-xs leading-relaxed">
          Imagine eggs in a crate — you count by crates, not individual eggs. A
          mole is the chemist’s “crate”: one mole always holds 6.022 × 10²³
          particles, called Avogadro’s number. So 2 moles of atoms = 2 ×
          (6.022 × 10²³) atoms. Want a practice question?
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-2xl surface-2 hairline p-2.5">
        <input
          aria-label="Ask the AI tutor a question"
          placeholder="Ask anything…"
          className="w-full bg-transparent px-2 text-sm text-foreground outline-none placeholder:text-muted"
        />
        <span className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-bold text-white">
          <LuWandSparkles className="h-3.5 w-3.5" /> Ask
        </span>
      </div>
    </div>
  );
}

function QuizScreen() {
  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="chip bg-accent-soft text-warning">JAMB style</span>
        <span className="flex items-center gap-1.5 rounded-lg surface-2 px-2.5 py-1 text-[11px] font-extrabold ink">
          <LuClock className="h-3.5 w-3.5 text-primary" /> 0:47 left
        </span>
      </div>
      <p className="mt-3 text-base font-extrabold ink sm:text-lg">
        A car travels 120 km in 2 hours. What is its average speed?
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {["40 km/h", "60 km/h", "80 km/h", "100 km/h"].map((opt, i) => (
          <div
            key={opt}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-bold",
              i === 1
                ? "border-success/40 bg-success-soft ink"
                : "hairline surface ink-muted",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white",
                i === 1 ? "bg-success" : "bg-primary/70",
              )}
            >
              {String.fromCharCode(65 + i)}
            </span>
            {opt}
            {i === 1 ? <LuCheck className="ml-auto h-4 w-4 text-success" /> : null}
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-primary-soft/70 px-4 py-3 text-xs leading-relaxed ink-muted">
        <span className="font-extrabold text-primary">Why it’s right:</span>{" "}
        Speed = distance ÷ time = 120 ÷ 2 = 60 km/h.
      </p>
    </div>
  );
}

function AnalyticsScreen() {
  const bars = [62, 78, 55, 88, 71, 94, 82];
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="grid gap-4 p-5 sm:grid-cols-5 sm:p-6">
      <div className="sm:col-span-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest ink-faint">
            Questions answered this week
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-success">
            <LuTrendingUp className="h-3.5 w-3.5" /> +24%
          </span>
        </div>
        <div className="mt-4 flex h-40 items-end justify-between gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="w-full rounded-lg bg-gradient-to-t from-primary to-blue-400"
                style={{ height: `${h}%` }}
              />
              <span className="text-[10px] font-bold ink-faint">{days[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 sm:col-span-2">
        <p className="text-[10px] font-bold uppercase tracking-widest ink-faint">
          Subject mastery
        </p>
        {[
          { name: "Mathematics", value: 88, color: "bg-primary" },
          { name: "English", value: 71, color: "bg-brand" },
          { name: "Physics", value: 64, color: "bg-accent" },
        ].map((row) => (
          <div key={row.name} className="rounded-xl surface-2 p-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="ink">{row.name}</span>
              <span className="ink-faint">{row.value}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full", row.color)}
                style={{ width: `${row.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SCREENS: Record<TabKey, () => React.JSX.Element> = {
  dashboard: DashboardScreen,
  lesson: LessonScreen,
  flashcards: FlashcardsScreen,
  tutor: TutorScreen,
  quiz: QuizScreen,
  analytics: AnalyticsScreen,
};

export function Showcase() {
  const [active, setActive] = useState<TabKey>("dashboard");
  const Screen = SCREENS[active];

  return (
    <section id="product" className="scroll-mt-20 bg-gradient-to-b from-transparent to-secondary/40">
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="Product tour"
          title={
            <>
              One app.{" "}
              <span className="gradient-text animate-gradient-pan">
                Every way you learn.
              </span>
            </>
          }
          description="Explore every corner of PrepWell — from your personal dashboard to the AI tutor that’s with you through every topic."
        />

        <Reveal delay={120}>
          <div className="mt-12 flex justify-center">
            <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl surface hairline p-1.5 shadow-card">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  aria-pressed={active === tab.key}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-bold transition-all duration-200",
                    active === tab.key
                      ? "bg-gradient-to-r from-primary to-brand text-white shadow-soft"
                      : "ink-muted hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="relative mt-10">
            <div
              className="absolute -inset-x-8 -top-8 bottom-0 rounded-[3rem] bg-gradient-to-br from-primary/10 via-brand/10 to-accent/10 blur-2xl"
              aria-hidden
            />
            <div key={active} className="relative animate-slide-up">
              <ScreenFrame title={`PrepWell · ${TABS.find((t) => t.key === active)?.label}`}>
                <Screen />
              </ScreenFrame>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
