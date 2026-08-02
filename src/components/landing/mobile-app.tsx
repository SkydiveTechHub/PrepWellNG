import { LuApple, LuArrowRight, LuDownload, LuPlay, LuSparkles } from "react-icons/lu";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

function PhoneFrame({
  className,
  children,
  label,
}: {
  className?: string;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      className={`relative aspect-[9/19] w-40 shrink-0 overflow-hidden rounded-[2.2rem] border-[6px] border-[#0f172a] bg-[#0f172a] shadow-lift sm:w-48 ${className ?? ""}`}
      aria-label={label}
    >
      <div className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0f172a]" />
      <div className="h-full w-full overflow-hidden rounded-[1.8rem] bg-[#f6f8fc]">
        {children}
      </div>
    </div>
  );
}

function LessonPhone() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-slate-900">Biology</span>
        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-extrabold text-blue-600">
          SS2
        </span>
      </div>
      <p className="mt-3 text-[13px] font-extrabold leading-snug text-slate-900">
        Osmosis and the Movement of Water
      </p>
      <div className="mt-3 space-y-1.5">
        <div className="h-2 w-full rounded bg-slate-200" />
        <div className="h-2 w-5/6 rounded bg-slate-200" />
        <div className="h-2 w-2/3 rounded bg-slate-200" />
      </div>
      <div className="mt-auto rounded-xl border-l-4 border-blue-600 bg-blue-50 p-2.5">
        <p className="text-[8px] font-extrabold uppercase tracking-widest text-blue-600">
          Example
        </p>
        <p className="mt-1 text-[10px] font-semibold leading-snug text-slate-700">
          A potato strip in salt water becomes limp…
        </p>
      </div>
      <div className="mt-3">
        <div className="h-1.5 rounded-full bg-slate-200">
          <div className="h-full w-3/5 rounded-full bg-blue-600" />
        </div>
        <div className="mt-1.5 flex justify-between text-[8px] font-bold text-slate-400">
          <span>3 / 5</span>
          <span>Continue</span>
        </div>
      </div>
    </div>
  );
}

function FlashcardPhone() {
  return (
    <div className="flex h-full flex-col p-4">
      <p className="text-[8px] font-extrabold uppercase tracking-widest text-violet-500">
        Flashcard
      </p>
      <div className="mt-2 flex h-full flex-col justify-between rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-3.5 text-white">
        <p className="text-[8px] font-extrabold uppercase tracking-widest text-violet-100">
          Question
        </p>
        <p className="text-[12px] font-extrabold leading-snug">
          What is the capital of Oyo State?
        </p>
        <div className="flex justify-center">
          <span className="rounded-lg bg-white/20 px-2.5 py-1 text-[9px] font-bold backdrop-blur">
            Tap to reveal
          </span>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full ${i === 0 ? "w-4 bg-violet-500" : "w-1.5 bg-slate-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

function TutorPhone() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
          <LuSparkles className="h-3 w-3" />
        </span>
        <p className="text-[11px] font-extrabold text-slate-900">AI Tutor</p>
      </div>
      <div className="mt-3 space-y-2">
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md bg-blue-600 px-2.5 py-1.5 text-[9px] font-semibold leading-snug text-white">
          Explain mitosis simply
        </div>
        <div className="w-fit max-w-[90%] rounded-2xl rounded-tl-md bg-slate-100 px-2.5 py-1.5 text-[9px] font-semibold leading-snug text-slate-700">
          Mitosis is how a cell copies itself — one cell splits into two
          identical cells for growth and repair.
        </div>
        <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md bg-blue-600 px-2.5 py-1.5 text-[9px] font-semibold text-white">
          Got it, thanks!
        </div>
      </div>
      <div className="mt-auto flex items-center gap-1.5 rounded-xl bg-slate-100 p-1.5">
        <div className="flex-1 text-[9px] font-semibold text-slate-400">
          Ask anything…
        </div>
        <span className="rounded-lg bg-blue-600 px-2 py-1 text-[8px] font-bold text-white">
          Ask
        </span>
      </div>
    </div>
  );
}

function AnalyticsPhone() {
  return (
    <div className="flex h-full flex-col p-4">
      <p className="text-[10px] font-extrabold text-slate-900">My progress</p>
      <div className="mt-3 flex h-24 items-end justify-between gap-1.5">
        {[45, 62, 55, 78, 70, 90].map((h, i) => (
          <div
            key={i}
            className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-indigo-400"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-emerald-50 p-2.5">
        <p className="text-[8px] font-extrabold uppercase tracking-widest text-emerald-600">
          This week
        </p>
        <p className="mt-0.5 text-[11px] font-extrabold text-emerald-700">
          82% accuracy · +24%
        </p>
      </div>
      <div className="mt-3 rounded-xl bg-slate-100 p-2.5">
        <div className="flex justify-between text-[9px] font-bold text-slate-500">
          <span>Mathematics</span>
          <span>88%</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-slate-200">
          <div className="h-full w-[88%] rounded-full bg-blue-600" />
        </div>
      </div>
    </div>
  );
}

function StoreBadge({ kind }: { kind: "apple" | "google" }) {
  return (
    <a
      href="#top"
      className="flex items-center gap-2.5 rounded-xl border hairline bg-[#0f172a] px-4 py-2.5 transition-transform duration-200 hover:scale-[1.03]"
    >
      {kind === "apple" ? (
        <LuApple className="h-6 w-6 text-white" />
      ) : (
        <LuPlay className="h-5 w-5 text-white" />
      )}
      <span className="leading-tight">
        <span className="block text-[9px] font-semibold text-slate-400">
          Download on the
        </span>
        <span className="block text-sm font-extrabold text-white">
          {kind === "apple" ? "App Store" : "Google Play"}
        </span>
      </span>
    </a>
  );
}

export function MobileApp() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-secondary/40 to-transparent">
      <div
        className="pointer-events-none absolute inset-0 bg-dots opacity-40 mask-fade-b"
        aria-hidden
      />
      <div className="landing-container relative py-20 lg:py-28">
        <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
          <div>
            <SectionHeader
              align="left"
              eyebrow="Mobile app"
              title={
                <>
                  Study anywhere.{" "}
                  <span className="gradient-text animate-gradient-pan">
                    Even offline.
                  </span>
                </>
              }
              description="The full PrepWell experience fits in your pocket — lessons, flashcards, the AI tutor and your analytics, built light enough for the phones Nigerian students actually use."
            />
            <Reveal delay={140}>
              <ul className="mt-6 space-y-3">
                {[
                  "Light and fast, even on slower networks",
                  "Download lessons for offline study",
                  "Syncs your progress across every device",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success-soft">
                      <LuDownload className="h-3.5 w-3.5 text-success" />
                    </span>
                    <span className="text-sm font-semibold ink-muted">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={220}>
              <div className="mt-8 flex flex-wrap gap-3">
                <StoreBadge kind="apple" />
                <StoreBadge kind="google" />
              </div>
              <p className="mt-4 text-xs font-semibold ink-faint">
                Android &amp; iOS · Free to download
              </p>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <div className="relative flex items-center justify-center gap-4 pt-8 sm:gap-5">
              <div
                className="absolute -inset-8 rounded-full bg-gradient-to-br from-primary/20 via-brand/20 to-accent/20 blur-3xl"
                aria-hidden
              />
              <div className="relative -rotate-6 animate-float">
                <PhoneFrame label="PrepWell lesson screen">
                  <LessonPhone />
                </PhoneFrame>
              </div>
              <div className="relative z-10 mt-6 hidden animate-float sm:block" style={{ animationDelay: "0.7s" }}>
                <PhoneFrame label="PrepWell flashcards screen">
                  <FlashcardPhone />
                </PhoneFrame>
              </div>
              <div className="relative -mt-4 rotate-6 animate-float" style={{ animationDelay: "1.3s" }}>
                <PhoneFrame label="PrepWell AI tutor screen">
                  <TutorPhone />
                </PhoneFrame>
              </div>
              <div className="relative z-10 hidden animate-float lg:block" style={{ animationDelay: "1.9s" }}>
                <PhoneFrame label="PrepWell analytics screen">
                  <AnalyticsPhone />
                </PhoneFrame>
              </div>
              <span className="absolute -bottom-2 right-4 flex items-center gap-1 text-xs font-extrabold text-primary">
                Offline-ready <LuArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
