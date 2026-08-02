import Link from "next/link";
import { LuArrowRight, LuCalendarCheck } from "react-icons/lu";
import { buttonClass } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section>
      <div className="landing-container py-20 lg:py-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-primary via-blue-700 to-brand px-6 py-16 text-center shadow-lift sm:px-14 sm:py-20">
            <div className="bg-grid absolute inset-0 opacity-20" aria-hidden />
            <div
              className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl animate-float-slow"
              aria-hidden
            />
            <div
              className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-white/10 blur-2xl animate-float"
              aria-hidden
            />
            <div
              className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 animate-pulse-ring"
              aria-hidden
            />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
                Start Your Learning Journey Today.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-blue-100 sm:text-lg">
                Five focused minutes a day is all it takes to begin. Your WAEC,
                JAMB and NECO score is built question by question — start
                building yours now.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className={buttonClass("secondary", "lg", "btn-shine px-8")}
                >
                  Start Learning Free
                  <LuArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:hello@prepwell.ng"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-8 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  <LuCalendarCheck className="h-4 w-4" />
                  Book a School Demo
                </a>
              </div>
              <p className="mt-5 text-xs font-semibold text-blue-200">
                Free to start · No card required · Works on any phone
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
