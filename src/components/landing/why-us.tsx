import {
  LuChartColumn,
  LuBookOpen,
  LuBot,
  LuBrainCircuit,
  LuCalendarClock,
  LuClipboardList,
  LuChartLine,
  LuMonitorSmartphone,
  LuSmartphone,
  LuTarget,
  LuTrophy,
  LuUsers,
  LuWandSparkles,
} from "react-icons/lu";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

const FEATURES = [
  // {
  //   icon: LuWandSparkles,
  //   title: "AI Tutor",
  //   text: "Ask any question in plain English and get a step-by-step explanation, whenever you're stuck — day or night.",
  // },
  {
    icon: LuBookOpen,
    title: "Interactive Lesson Notes",
    text: "Bite-sized notes for every topic with worked examples, key points and practice built straight in.",
  },
  {
    icon: LuBrainCircuit,
    title: "Smart Flashcards",
    text: "Turn any topic into flashcards in seconds and drill them until the facts truly stick.",
  },
  {
    icon: LuClipboardList,
    title: "CBT Practice",
    text: "Timed mock exams under real computer-based conditions for WAEC, JAMB and NECO.",
  },
  {
    icon: LuCalendarClock,
    title: "Spaced Repetition",
    text: "A smart revision schedule resurfacing topics right before you'd forget them.",
  },
  {
    icon: LuChartLine,
    title: "Performance Analytics",
    text: "Scores by subject, topic and exam type — so your weak areas become your strengths.",
  },
  {
    icon: LuTarget,
    title: "Personalized Study Plans",
    text: "Tell us your exam date and daily hours, and we map every week to a clear next step.",
  },
  {
    icon: LuTrophy,
    title: "Gamified Learning",
    text: "Streaks, badges and milestones that keep even five focused minutes a day going.",
  },
  // {
  //   icon: LuMonitorSmartphone,
  //   title: "Offline Learning",
  //   text: "Download lessons and flashcards and keep studying even when data runs out.",
  // },
  // {
  //   icon: LuUsers,
  //   title: "Teacher Dashboard",
  //   text: "Assign topics, track whole-class progress and spot struggling students early.",
  // },
  // {
  //   icon: LuChartColumn,
  //   title: "Parent Dashboard",
  //   text: "See real progress and get weekly updates without hovering over your child.",
  // },
  // {
  //   icon: LuSmartphone,
  //   title: "Mobile Learning",
  //   text: "Built light and fast for the phones students actually use — even on 2G.",
  // },
];

export function WhyUs() {
  return (
    <section id="features" className="scroll-mt-20">
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="Why PrepWell"
          title={
            <>
              Everything you need to{" "}
              <span className="gradient-text animate-gradient-pan">
                actually pass
              </span>
            </>
          }
          description="Not just videos and notes — an active, adaptive study system that keeps you practising, learning and improving every single day."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 4) * 80}>
              <div className="group relative h-full overflow-hidden rounded-2xl surface hairline p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift">
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br from-primary/10 to-brand/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                  aria-hidden
                />
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-blue-600 to-brand text-white shadow-soft transition-transform duration-300 group-hover:scale-110">
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

        <Reveal delay={120}>
          <p className="mt-12 flex items-center justify-center gap-2 text-sm font-semibold ink-muted">
            <LuBot className="h-4 w-4 text-primary" />
            And the AI tutor never sleeps — it’s there at 2am before your exam.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
