"use client";

import { useState } from "react";
import { LuChevronDown, LuCircleHelp } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";
import { FAQS } from "./faq-data";

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-20">
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="FAQ"
          title={
            <>
              Questions?{" "}
              <span className="gradient-text animate-gradient-pan">
                We’ve got answers.
              </span>
            </>
          }
          description="Everything students, parents and teachers usually ask us before getting started."
        />

        <Reveal delay={120}>
          <div className="mt-12 mx-auto max-w-3xl">
            <div className="divide-y divide-border rounded-3xl surface hairline px-6 shadow-card">
              {FAQS.map((faq, i) => {
                const open = openIndex === i;
                return (
                  <div key={faq.question}>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(open ? null : i)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-4 py-5 text-left"
                    >
                      <span className="text-sm font-extrabold ink sm:text-base">
                        {faq.question}
                      </span>
                      <LuChevronDown
                        className={cn(
                          "h-5 w-5 flex-shrink-0 ink-faint transition-transform duration-200",
                          open && "rotate-180 text-primary",
                        )}
                      />
                    </button>
                    <div
                      className={cn(
                        "grid transition-all duration-300 ease-out",
                        open
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0",
                      )}
                    >
                      <div className="overflow-hidden">
                        <p className="pb-5 text-sm leading-relaxed ink-muted">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl surface-2 hairline px-6 py-5 text-center sm:flex-row sm:gap-4">
              <LuCircleHelp className="h-5 w-5 flex-shrink-0 text-primary" />
              <p className="text-sm font-semibold ink-muted">
                Still have a question? Our team replies fast.
              </p>
              <a
                href="mailto:hello@prepwell.ng"
                className={buttonClass("outline", "sm")}
              >
                Contact us
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
