import {
  LuBookOpen,
  LuBrainCircuit,
  LuCircleCheck,
  LuClipboardList,
  LuMapPin,
  LuTarget,
  LuTrendingUp,
  LuTrophy,
  LuWandSparkles,
} from "react-icons/lu";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

const STEPS = [
  {
    icon: LuMapPin,
    title: "Choose your subject",
    text: "Pick from 12+ subjects following the Nigerian curriculum.",
  },
  {
    icon: LuBookOpen,
    title: "Learn with interactive lessons",
    text: "Short, focused lessons with worked examples that make sense.",
  },
  {
    icon: LuClipboardList,
    title: "Practice questions",
    text: "Thousands of WAEC, JAMB & NECO style questions with answers.",
  },
  {
    icon: LuBrainCircuit,
    title: "Review with flashcards",
    text: "Drill the facts until they stick, at your own pace.",
  },
  {
    icon: LuWandSparkles,
    title: "Ask the AI tutor",
    text: "Stuck? Get a step-by-step explanation in plain English.",
  },
  {
    icon: LuTarget,
    title: "Master the topic",
    text: "Spaced repetition brings it back right before you forget.",
  },
  {
    icon: LuTrendingUp,
    title: "Track your progress",
    text: "See your scores climb across subjects, topics and exams.",
  },
  {
    icon: LuTrophy,
    title: "Ace your exams",
    text: "Walk into the hall calm, prepared and confident.",
  },
];

export function Journey() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-dots opacity-50 mask-fade-b"
        aria-hidden
      />
      <div className="landing-container relative py-20 lg:py-28">
        <SectionHeader
          eyebrow="Your learning journey"
          title={
            <>
              From first lesson to{" "}
              <span className="gradient-text animate-gradient-pan">
                exam-day confidence
              </span>
            </>
          }
          description="A clear, guided path — you always know exactly what to do next, and why it works."
        />

        <div className="relative mt-14">
          <div
            className="absolute left-0 right-0 top-9 hidden lg:block"
            aria-hidden
          >
            <div className="mx-14 border-t-2 border-dashed border-primary/20" />
          </div>

          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={(i % 4) * 90}>
                <div className="group relative h-full">
                  <div className="flex items-center gap-4 lg:flex-col lg:items-start">
                    <div className="relative">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-blue-600 to-brand text-white shadow-soft transition-transform duration-300 group-hover:scale-105">
                        <step.icon className="h-6 w-6" />
                      </div>
                      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full surface-2 text-[11px] font-extrabold text-primary shadow-card hairline">
                        {i + 1}
                      </span>
                    </div>
                    <div className="lg:mt-4">
                      <h3 className="text-base font-extrabold tracking-tight ink">
                        {step.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed ink-muted">
                        {step.text}
                      </p>
                    </div>
                  </div>
                  {i < STEPS.length - 1 ? (
                    <LuCircleCheck className="absolute -bottom-6 left-16 hidden h-4 w-4 text-primary/40 lg:block" />
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
