import Link from "next/link";
import {
  LuArrowRight,
  LuBookOpen,
  LuBrainCircuit,
  LuCheck,
  LuFlame,
  LuSparkles,
  LuStar,
  LuTrendingUp,
} from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";
import { Reveal } from "./reveal";

function FloatingCard({
  className,
  delay = "0s",
  children,
}: {
  className?: string;
  delay?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute hidden animate-float sm:block ${className ?? ""}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function AiTutorBubble() {
  return (
    <div className="glass glass-strong rounded-2xl p-3 shadow-lift">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand text-white">
          <LuSparkles className="h-3.5 w-3.5" />
        </span>
        <div>
          <p className="text-[11px] font-extrabold ink">AI Tutor</p>
          <p className="text-[10px] font-medium ink-faint">prepwell.ai</p>
        </div>
      </div>
      <p className="mt-2 rounded-xl bg-primary-soft px-3 py-2 text-[11px] font-semibold leading-relaxed text-primary-soft-foreground">
        Can you explain the chain rule again?
      </p>
    </div>
  );
}

function StreakCard() {
  return (
    <div className="glass glass-strong flex items-center gap-2.5 rounded-2xl px-4 py-3 shadow-lift">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft">
        <LuFlame className="h-5 w-5 text-accent" />
      </span>
      <div>
        <p className="text-lg font-extrabold leading-none ink">7-day</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest ink-faint">
          study streak
        </p>
      </div>
    </div>
  );
}

function ScoreCard() {
  return (
    <div className="glass glass-strong rounded-2xl px-4 py-3 shadow-lift">
      <p className="text-[10px] font-bold uppercase tracking-widest ink-faint">
        Weekly score
      </p>
      <div className="mt-1 flex items-center gap-2">
        <LuTrendingUp className="h-4 w-4 text-success" />
        <span className="text-lg font-extrabold text-success">+18%</span>
      </div>
    </div>
  );
}

function FlashcardCard() {
  return (
    <div className="glass glass-strong rounded-2xl p-3 shadow-lift">
      <div className="flex items-center gap-1.5">
        <LuBrainCircuit className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] font-extrabold uppercase tracking-widest ink-faint">
          Flashcard
        </p>
      </div>
      <p className="mt-2 text-[11px] font-bold ink">What is osmosis?</p>
      <p className="mt-1 text-[10px] leading-relaxed ink-faint">
        Water moving across a membrane…
      </p>
    </div>
  );
}

function HeroAppWindow() {
  return (
    <div className="relative">
      <div
        className="absolute -inset-10 rounded-[3rem] bg-gradient-to-br from-primary/25 via-brand/20 to-accent/20 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-primary/15 to-brand/15 blur-xl"
        aria-hidden
      />

      <div className="relative animate-float">
        <div className="glass glass-strong overflow-hidden rounded-3xl shadow-lift">
          <div className="flex items-center gap-2 border-b hairline px-5 py-3.5">
            <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
            <p className="ml-3 text-xs font-bold ink-faint">
              PrepWell · Mathematics SS2
            </p>
          </div>

          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="chip bg-primary-soft text-primary-soft-foreground">
                <LuBookOpen className="h-3 w-3" />
                Practice · JAMB style
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest ink-faint">
                Q8 of 30
              </span>
            </div>

            <p className="mt-4 text-base font-extrabold leading-snug ink sm:text-lg">
              If 2<sup>x</sup> = 32, what is the value of x?
            </p>

            <div className="mt-4 space-y-2">
              {[
                { letter: "A", text: "4", state: "correct" },
                { letter: "B", text: "5", state: "idle" },
                { letter: "C", text: "6", state: "idle" },
                { letter: "D", text: "3", state: "idle" },
              ].map((opt) => (
                <div
                  key={opt.letter}
                  className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${
                    opt.state === "correct"
                      ? "border-success/40 bg-success-soft"
                      : "hairline surface"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                      opt.state === "correct" ? "bg-success" : "bg-primary/70"
                    }`}
                  >
                    {opt.letter}
                  </span>
                  <span className="flex-1 text-sm font-bold ink">{opt.text}</span>
                  {opt.state === "correct" ? (
                    <LuCheck className="h-4 w-4 text-success" />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-gradient-to-br from-primary/10 via-brand/10 to-accent/10 p-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand text-white">
                <LuSparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
                  AI explanation
                </p>
                <p className="mt-1 text-xs leading-relaxed ink-muted">
                  2<sup>x</sup> = 32 means 2 multiplied by itself x times. Since
                  2⁵ = 32, the answer is 5.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FloatingCard className="-right-5 -top-8 lg:-right-12" delay="0.4s">
        <AiTutorBubble />
      </FloatingCard>

      <FloatingCard className="-left-6 top-16 lg:-left-12" delay="0.9s">
        <StreakCard />
      </FloatingCard>

      <FloatingCard className="-bottom-8 -right-6 lg:-right-14" delay="1.5s">
        <FlashcardCard />
      </FloatingCard>

      <FloatingCard className="-bottom-6 left-8 lg:-left-8" delay="1.1s">
        <ScoreCard />
      </FloatingCard>
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-28 sm:pt-32">
      <div
        className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-70"
        aria-hidden
      />
      <div
        className="absolute -top-40 right-[-10%] h-[34rem] w-[34rem] rounded-full animate-float-slow"
        style={{ background: "radial-gradient(circle, var(--landing-hero-glow-a), transparent 65%)" }}
        aria-hidden
      />
      <div
        className="absolute left-[-12%] top-1/3 h-[30rem] w-[30rem] rounded-full animate-float"
        style={{ background: "radial-gradient(circle, var(--landing-hero-glow-b), transparent 65%)" }}
        aria-hidden
      />
      <div
        className="absolute bottom-[-20%] right-[20%] h-[24rem] w-[24rem] rounded-full animate-float-slow"
        style={{ background: "radial-gradient(circle, var(--landing-hero-glow-c), transparent 65%)" }}
        aria-hidden
      />

      <div className="landing-container relative grid items-center gap-14 pb-20 lg:grid-cols-2 lg:gap-10 lg:pb-28">
        <div>
          {/* <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs font-bold ink-muted">
              <span className="flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-accent">
                <LuSparkles className="h-3 w-3" />
                New
              </span>
              AI tutor now explains any question, step by step
            </span>
          </Reveal> */}

          <Reveal delay={80}>
            <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.06] tracking-tight ink sm:text-5xl lg:text-6xl">
              Learn Smarter.{" "}
              <span className="gradient-text animate-gradient-pan">
                Score Higher.
              </span>{" "}
              Build Your Future.
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="mt-6 max-w-xl text-base leading-relaxed ink-muted sm:text-lg">
              Interactive lesson notes, an AI tutor that explains anything,
              smart flashcards, quizzes, CBT practice and a revision plan that
              adapts to you — built for WAEC, JAMB and NECO.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className={buttonClass("primary", "lg", "btn-shine px-7")}
              >
                Start Learning Free
                <LuArrowRight className="h-4 w-4" />
              </Link>
              {/* <a
                href="#product"
                className={buttonClass("outline", "lg", "px-7")}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <LuPlay className="ml-0.5 h-3 w-3" />
                </span>
                Watch Demo
              </a> */}
            </div>
            <p className="mt-4 text-xs font-semibold ink-faint">
              Free to start · Works on any phone
            </p>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <div className="flex -space-x-2.5">
                {["Adaeze", "Tunde", "Aisha", "Chidi", "Fatima"].map((name) => (
                  <span
                    key={name}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-primary via-blue-600 to-brand text-[10px] font-extrabold text-white"
                  >
                    {name.charAt(0)}
                  </span>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <LuStar key={i} className="h-3.5 w-3.5 fill-accent text-accent" />
                  ))}
                  <span className="ml-1.5 text-xs font-extrabold ink">
                    4.9/5
                  </span>
                </div>
                <p className="mt-0.5 text-xs ink-faint">
                  Loved by students in Lagos, Kano, Enugu &amp; beyond
                </p>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} className="lg:pl-8">
          <HeroAppWindow />
        </Reveal>
      </div>
    </section>
  );
}
