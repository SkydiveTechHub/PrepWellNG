import {
  LuArrowRight,
  LuChartColumn,
  LuBookOpen,
  LuBrainCircuit,
  LuCalendarClock,
  LuCheck,
  LuClock,
  LuFlame,
  LuListChecks,
  LuSparkles,
  LuTrendingUp,
  LuWandSparkles,
  LuWifiOff,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

function DeepDiveList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success-soft">
            <LuCheck className="h-3 w-3 text-success" />
          </span>
          <span className="text-sm font-semibold ink-muted">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function LessonsPanel() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-primary/15 to-brand/15 blur-2xl" aria-hidden />
      <div className="relative space-y-3">
        <div className="rounded-2xl surface-2 hairline p-4">
          <span className="chip bg-primary-soft text-primary-soft-foreground">
            Physics · SS2
          </span>
          <p className="mt-2 text-sm font-extrabold ink">Newton’s Laws of Motion</p>
          <p className="mt-1.5 text-xs leading-relaxed ink-muted">
            Newton’s First Law states that an object stays at rest or in motion
            unless acted upon by an external force.
          </p>
        </div>
        <div className="rounded-2xl border-l-4 border-brand bg-brand/10 p-4">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand">
            Worked example
          </p>
          <p className="mt-1 text-xs font-semibold text-foreground">
            A book on a table stays still because its weight balances the table’s
            normal reaction.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["Key point", "Quick quiz", "Summary"].map((chip) => (
            <span key={chip} className="chip surface-2 text-ink-muted">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TutorPanel() {
  const messages = [
    { from: "me", text: "Why does a bus hurtle forward when it brakes suddenly?" },
    { from: "ai", text: "Inertia! Objects resist change in motion. Your body keeps moving forward until the seatbelt — or the seat — stops it." },
    { from: "me", text: "Ah! So that’s why we wear seatbelts. Makes sense now." },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-brand/15 to-accent/15 blur-2xl" aria-hidden />
      <div className="relative space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2.5",
              m.from === "me" && "justify-end",
            )}
          >
            {m.from === "ai" ? (
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand text-white">
                <LuSparkles className="h-3.5 w-3.5" />
              </span>
            ) : null}
            <p
              className={cn(
                "max-w-[75%] rounded-2xl px-4 py-2.5 text-xs font-semibold leading-relaxed",
                m.from === "ai"
                  ? "surface-2 hairline ink"
                  : "rounded-tr-md bg-gradient-to-br from-primary to-brand text-white",
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
        <div className="flex items-center gap-1.5 pl-10">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/50"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ExamPanel() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-accent/15 to-primary/15 blur-2xl" aria-hidden />
      <div className="relative rounded-2xl surface-2 hairline p-4">
        <div className="flex items-center justify-between">
          <span className="chip bg-accent-soft text-warning">JAMB CBT</span>
          <span className="flex items-center gap-1 text-xs font-extrabold ink">
            <LuClock className="h-3.5 w-3.5 text-primary" /> 0:38
          </span>
        </div>
        <p className="mt-3 text-sm font-extrabold ink">
          Question 14 · The SI unit of force is the…
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            { l: "A", t: "Joule", s: false },
            { l: "B", t: "Newton", s: true },
            { l: "C", t: "Watt", s: false },
            { l: "D", t: "Pascal", s: false },
          ].map((o) => (
            <div
              key={o.l}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold",
                o.s ? "border border-success/40 bg-success-soft ink" : "surface hairline ink-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold text-white",
                  o.s ? "bg-success" : "bg-primary/70",
                )}
              >
                {o.l}
              </span>
              {o.t}
              {o.s ? <LuCheck className="ml-auto h-3.5 w-3.5 text-success" /> : null}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/2 rounded-full bg-accent" />
            </div>
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest ink-faint">
            15 / 30
          </span>
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const bars = [70, 55, 82, 64, 92, 78];
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-success/15 to-primary/15 blur-2xl" aria-hidden />
      <div className="relative rounded-2xl surface-2 hairline p-5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-widest ink-faint">
            Accuracy by subject
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-success">
            <LuTrendingUp className="h-3.5 w-3.5" /> +24%
          </span>
        </div>
        <div className="mt-4 flex h-36 items-end justify-between gap-3">
          {bars.map((h, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  "w-full rounded-lg",
                  i === 4 ? "bg-gradient-to-t from-success to-emerald-400" : "bg-gradient-to-t from-primary to-blue-400",
                )}
                style={{ height: `${h}%` }}
              />
              <span className="text-[9px] font-bold ink-faint">
                {["Eng", "Math", "Bio", "Chem", "Phy", "Gov"][i]}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-success-soft p-3">
          <LuFlame className="h-4 w-4 text-success" />
          <p className="text-xs font-bold text-success">
            Physics is your fastest-improving subject.
          </p>
        </div>
      </div>
    </div>
  );
}

const DEEP_DIVES = [
  {
    eyebrow: "Interactive Lessons",
    title: "Learn the concept, not just the answer",
    text: "Every topic is broken into short, focused lessons with real definitions, worked examples and key points — written for Nigerian classrooms and examiners.",
    bullets: [
      "Bite-sized lessons you can finish between classes",
      "Worked examples that mirror exam marking",
      "Key points and summaries for fast revision",
    ],
    cta: { label: "Explore lessons", href: "/register" },
    panel: <LessonsPanel />,
    icon: LuBookOpen,
  },
  {
    eyebrow: "AI Tutor",
    title: "Your personal tutor, available 24/7",
    text: "Stuck on a question at midnight? Ask PrepWell’s AI tutor in plain English and get a patient, step-by-step explanation — instantly, with zero judgement.",
    bullets: [
      "Explains any topic in the way you understand",
      "Always patient, never tired, always available",
      "Turns your mistakes into learning moments",
    ],
    cta: { label: "Meet the tutor", href: "/register" },
    panel: <TutorPanel />,
    icon: LuWandSparkles,
  },
  {
    eyebrow: "Exam Practice",
    title: "Mock exams that feel like the real thing",
    text: "Timed CBT sessions under exam conditions for WAEC, JAMB and NECO. When you walk into that hall, the only new thing will be the venue.",
    bullets: [
      "Real exam timing and CBT format",
      "Instant scores with area-by-area feedback",
      "Past questions organised by year and topic",
    ],
    cta: { label: "Start practising", href: "/register" },
    panel: <ExamPanel />,
    icon: LuListChecks,
  },
  {
    eyebrow: "Learning Analytics",
    title: "Watch your weak areas become strengths",
    text: "See exactly where you stand across subjects, topics and exam types — with clear next steps every single day, not vague averages.",
    bullets: [
      "Scores by subject, topic and exam type",
      "Personalised revision plan that adapts weekly",
      "Motivation nudges that keep streaks alive",
    ],
    cta: { label: "See your progress", href: "/register" },
    panel: <AnalyticsPanel />,
    icon: LuChartColumn,
  },
];

const MINI_FEATURES = [
  {
    icon: LuBrainCircuit,
    title: "Smart Flashcards",
    text: "Turn any topic into cards in seconds and drill until the facts truly stick — then spaced repetition brings them back at the perfect time.",
    accent: "from-brand to-purple-600",
  },
  {
    icon: LuCalendarClock,
    title: "Study Planner",
    text: "Tell us your exam date and free hours. We map every week to a clear next step, so you never have to wonder what to study.",
    accent: "from-primary to-blue-600",
  },
  {
    icon: LuWifiOff,
    title: "Offline Mode",
    text: "Download lessons and flashcards and keep studying even when data runs out. Study on the bus, at home, anywhere.",
    accent: "from-emerald-500 to-teal-600",
  },
];

export function DeepDive() {
  return (
    <section className="overflow-hidden">
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="Features"
          title={
            <>
              Built around how{" "}
              <span className="gradient-text animate-gradient-pan">
                students really learn
              </span>
            </>
          }
          description="Every feature exists for one reason — to turn study time into exam confidence. Here’s the thinking behind the big four."
        />

        <div className="mt-16 space-y-20 lg:space-y-24">
          {DEEP_DIVES.map((dive, i) => {
            const reversed = i % 2 === 1;
            return (
              <div
                key={dive.eyebrow}
                className={cn(
                  "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
                )}
              >
                <Reveal className={cn(reversed && "lg:order-2")}>
                  <div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-primary-soft-foreground">
                      <dive.icon className="h-3.5 w-3.5" />
                      {dive.eyebrow}
                    </span>
                    <h3 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight ink sm:text-3xl">
                      {dive.title}
                    </h3>
                    <p className="mt-4 text-base leading-relaxed ink-muted">
                      {dive.text}
                    </p>
                    <DeepDiveList items={dive.bullets} />
                    <a
                      href={dive.cta.href}
                      className="mt-7 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary transition-colors hover:text-primary-hover"
                    >
                      {dive.cta.label}
                      <LuArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </Reveal>
                <Reveal delay={120} className={cn(reversed && "lg:order-1")}>
                  {dive.panel}
                </Reveal>
              </div>
            );
          })}
        </div>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {MINI_FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 90}>
              <div className="group relative h-full overflow-hidden rounded-2xl surface hairline p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-60 transition-opacity group-hover:opacity-100",
                    feature.accent,
                  )}
                  aria-hidden
                />
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-soft",
                    feature.accent,
                  )}
                >
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-extrabold tracking-tight ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed ink-muted">
                  {feature.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
