import { LuCheck, LuX } from "react-icons/lu";
import { Reveal } from "@/components/landing/reveal";
import { SectionHeader } from "@/components/landing/section";

/**
 * A contrast, not a feature list. The two columns are the whole argument for
 * the product, so they are paired line for line — each "usually" has the
 * answer sitting opposite it.
 */
const USUALLY = [
  "You buy a past-questions booklet that gives the answer but never the working.",
  "You read a whole textbook chapter to find the one idea the exam actually tests.",
  "You cram everything the week before, and lose most of it by exam morning.",
  "You only learn which topics were costing you marks when the result arrives.",
];

const INSTEAD = [
  "Past questions come with worked solutions, so a wrong answer still teaches you something.",
  "Lessons are cut to the syllabus, topic by topic, with practice built into each one.",
  "Spaced repetition brings a topic back just before you would have forgotten it.",
  "Your weak topics are named in the first fortnight, while there is still time to fix them.",
];

export function AboutStory() {
  return (
    <section>
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="Why we built it"
          title="Studying harder is not the problem."
          description="Most students preparing for WAEC, JAMB and NECO are already working. What they are missing is a system that tells them what to do next, and shows them the working when they get it wrong."
          align="left"
        />

        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl hairline border shadow-card lg:grid-cols-2">
          <Reveal className="surface p-7 sm:p-9">
            <h3 className="text-lg font-extrabold tracking-tight ink">
              How exam prep usually goes
            </h3>
            <ul className="mt-6 space-y-4">
              {USUALLY.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                    <LuX className="h-3 w-3" />
                  </span>
                  <p className="text-sm leading-relaxed ink-muted">{line}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={100} className="surface-2 p-7 sm:p-9">
            <h3 className="text-lg font-extrabold tracking-tight ink">
              How it goes on ScholarsCrib
            </h3>
            <ul className="mt-6 space-y-4">
              {INSTEAD.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                    <LuCheck className="h-3 w-3" />
                  </span>
                  <p className="text-sm leading-relaxed ink-muted">{line}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <p className="mt-14 max-w-2xl text-base leading-relaxed ink-muted">
            We are a small team building for the phone a Nigerian student
            actually owns — mid-range, on mobile data, often shared with a
            sibling. That constraint decides everything: pages stay light,
            lessons work in ten-minute sessions, and the parts that matter most
            are free to start.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
