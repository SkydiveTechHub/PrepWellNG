import {
  LuArrowRight,
  LuBuilding2,
  LuCalendarCheck,
  LuCheck,
  LuGraduationCap,
  LuHeartHandshake,
  LuLayers,
  LuPresentation,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
            <LuCheck className="h-3 w-3 text-white" />
          </span>
          <span className="text-sm font-semibold text-white/90">{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Users() {
  return (
    <section className="bg-gradient-to-b from-secondary/40 to-transparent">
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="Made for everyone"
          title={
            <>
              One platform,{" "}
              <span className="gradient-text animate-gradient-pan">
                built for your role
              </span>
            </>
          }
          description="Students, teachers, parents, schools and publishers — PrepWell fits the way each of you works."
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          <Reveal className="lg:col-span-2 lg:row-span-2">
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-blue-600 to-brand p-8 text-white shadow-lift sm:p-10">
              <div
                className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl"
                aria-hidden
              />
              <div
                className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-white/10 blur-2xl"
                aria-hidden
              />
              <div className="relative">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-widest backdrop-blur">
                  <LuGraduationCap className="h-3.5 w-3.5" />
                  For students
                </span>
                <h3 className="mt-5 max-w-md text-2xl font-extrabold leading-tight sm:text-3xl">
                  Your study superpower, from SS1 to the exam hall
                </h3>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-blue-100">
                  Learn at your pace, practise exam-style questions, and get
                  help from the AI tutor whenever you’re stuck.
                </p>
                <CheckList
                  items={[
                    "Lessons + flashcards that work on any phone",
                    "Timed CBT mocks that mirror the real exam",
                    "A personal AI tutor that never sleeps",
                  ]}
                />
              </div>
              <div className="relative mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="/register"
                  className={buttonClass("secondary", "md", "btn-shine")}
                >
                  Start learning free
                  <LuArrowRight className="h-4 w-4" />
                </a>
                <div className="flex -space-x-2.5">
                  {["K", "N", "S", "O"].map((letter) => (
                    <span
                      key={letter}
                      className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-700 bg-white/20 text-[10px] font-extrabold backdrop-blur"
                    >
                      {letter}
                    </span>
                  ))}
                  <span className="flex h-8 items-center rounded-full border-2 border-blue-700 bg-white/20 px-2 text-[10px] font-extrabold backdrop-blur">
                    10k+
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {[
            {
              icon: LuPresentation,
              tag: "For teachers",
              title: "Know where every student stands",
              text: "Assign topics, track whole-class progress and spot who needs help before it shows in a report card.",
            },
            {
              icon: LuHeartHandshake,
              tag: "For parents",
              title: "Confidence, not constant nagging",
              text: "Get weekly progress updates and celebrate real improvement — without hovering over their shoulder.",
            },
          ].map((card) => (
            <Reveal key={card.tag}>
              <div className="flex h-full flex-col rounded-2xl surface hairline p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <card.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 text-[11px] font-extrabold uppercase tracking-widest text-primary">
                  {card.tag}
                </p>
                <h3 className="mt-1 text-base font-extrabold tracking-tight ink">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed ink-muted">
                  {card.text}
                </p>
              </div>
            </Reveal>
          ))}

          {[
            {
              icon: LuBuilding2,
              tag: "For schools",
              title: "Roll out PrepWell school-wide",
              text: "One dashboard for your whole school, class-based assignments and analytics that principals actually love.",
            },
            {
              icon: LuLayers,
              tag: "For publishers",
              title: "Put your content to work",
              text: "Bring your question banks and notes into PrepWell and reach students preparing for the big exams.",
            },
          ].map((card) => (
            <Reveal key={card.tag}>
              <div className="flex h-full flex-col rounded-2xl surface hairline p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <card.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 text-[11px] font-extrabold uppercase tracking-widest text-brand">
                  {card.tag}
                </p>
                <h3 className="mt-1 text-base font-extrabold tracking-tight ink">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed ink-muted">
                  {card.text}
                </p>
              </div>
            </Reveal>
          ))}

          <Reveal>
            <div
              className={cn(
                "flex h-full flex-col justify-center rounded-2xl border border-dashed border-primary/30 bg-primary-soft/50 p-6",
              )}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-soft">
                <LuCalendarCheck className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-extrabold tracking-tight ink">
                Want PrepWell in your school or class?
              </h3>
              <p className="mt-2 text-sm leading-relaxed ink-muted">
                Talk to us about a pilot programme and a School Plan that fits
                your budget.
              </p>
              <a
                href="#pricing"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary hover:text-primary-hover"
              >
                Book a school demo
                <LuArrowRight className="h-4 w-4" />
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
