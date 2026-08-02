"use client";

import { useState } from "react";
import { LuChevronDown, LuCircleHelp } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

const FAQS = [
  {
    question: "Which exams does PrepWell cover?",
    answer:
      "WAEC (WASSCE), JAMB UTME and NECO — the three big examinations Nigerian secondary students sit for. Content follows the national curriculum from SS1 to SS3, and mock exams run under CBT conditions like JAMB's.",
  },
  {
    question: "How does the AI tutor work?",
    answer:
      "Type any question in plain English — a definition, a past question, or a topic you're stuck on — and the AI tutor explains it step by step, at your level. It's available 24/7, so late-night confusion never has to wait until morning.",
  },
  {
    question: "Can I study offline?",
    answer:
      "Yes. Download lessons, flashcards and question packs while you have data, then keep studying without a connection. Your progress syncs automatically the next time you're online.",
  },
  {
    question: "Can teachers assign work and track students?",
    answer:
      "Yes. Teachers get a dashboard where they can assign topics and mocks to a whole class, then see live scores and progress to spot struggling students early — before the report card does it for them.",
  },
  {
    question: "What does Premium cost, and can I cancel?",
    answer:
      "Premium is ₦2,500 a month or ₦24,000 a year (a 20% saving). There are no contracts — you can cancel anytime, and the Free plan is genuinely free, forever, with no card required.",
  },
  {
    question: "I have limited data. Can I still use it?",
    answer:
      "Yes. PrepWell is built to be light and fast even on slower connections, and everything is designed to load quickly on the phones most students actually use.",
  },
  {
    question: "How is PrepWell different from just reading?",
    answer:
      "Reading tells you what to know; practice shows you what you actually know. PrepWell pairs short lessons with thousands of questions, timed mock exams, flashcards and progress tracking so you always know your next best step.",
  },
];

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
