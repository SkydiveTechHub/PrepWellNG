import Link from "next/link";
import { LuArrowRight, LuMessageCircle, LuSparkles } from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";

export function AboutHero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="bg-dots pointer-events-none absolute inset-0 mask-fade-b opacity-70"
        aria-hidden
      />
      <div className="landing-container relative pb-4 pt-28 lg:pb-8 lg:pt-36">
        <Reveal className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-primary-soft-foreground">
            <LuSparkles className="h-3 w-3" />
            About ScholarsCrib
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight ink sm:text-5xl lg:text-[3.4rem]">
            Every Nigerian student deserves{" "}
            <span className="gradient-text animate-gradient-pan">
              a fair shot
            </span>{" "}
            at their exams.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed ink-muted sm:text-lg">
            WAEC, JAMB and NECO decide what happens next for millions of
            students every year. We built ScholarsCrib so that result depends on
            how you study — not on whether your school had a good teacher or
            your family could afford a tutor.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className={buttonClass("primary", "lg", "btn-shine px-7")}
            >
              Start learning free
              <LuArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className={buttonClass("outline", "lg", "px-7")}
            >
              <LuMessageCircle className="h-4 w-4" />
              Talk to us
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
