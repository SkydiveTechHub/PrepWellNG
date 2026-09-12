import Link from "next/link";
import { LuCircleHelp, LuSparkles } from "react-icons/lu";
import { Reveal } from "@/components/landing/reveal";
import { SUPPORT_HOURS, SUPPORT_RESPONSE } from "@/lib/contact";

export function ContactHero() {
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
            Contact
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight ink sm:text-5xl lg:text-[3.4rem]">
            Stuck, charged twice, or spotted a wrong answer?
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed ink-muted sm:text-lg">
            Tell us. A real person reads every message, replies{" "}
            {SUPPORT_RESPONSE}, and a reported question gets checked against the
            original paper. We are here {SUPPORT_HOURS}.
          </p>
          <Link
            href="/#faq"
            className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-primary transition-colors hover:text-primary-hover"
          >
            <LuCircleHelp className="h-4 w-4" />
            Check the FAQ first — it answers most questions instantly
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
