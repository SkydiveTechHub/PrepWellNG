import { LuMapPin, LuQuote, LuStar } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

const TESTIMONIALS = [
  {
    quote:
      "I failed my mock Physics paper in Term 1. PrepWell’s AI tutor explained the concepts in a way my textbook never did — I scored a B in the real thing.",
    name: "Adaeze O.",
    role: "SS3 student",
    location: "Enugu",
    gradient: "from-primary to-blue-600",
  },
  {
    quote:
      "I stopped nagging my son to study. The weekly progress update shows me exactly what he’s improved on — and I can finally celebrate with him.",
    name: "Ngozi B.",
    role: "Parent",
    location: "Lagos",
    gradient: "from-emerald-500 to-teal-600",
  },
  {
    quote:
      "I assign a topic on Friday and see the whole class’s scores on Monday. I can finally tell who needs extra help before the exam, not after it.",
    name: "Mr. Emeka C.",
    role: "Physics teacher",
    location: "Ibadan",
    gradient: "from-violet-500 to-purple-600",
  },
  {
    quote:
      "Rolling out PrepWell across our school was the best decision we made this session. Results improved across the board — parents are impressed.",
    name: "Mrs. Halima D.",
    role: "School principal",
    location: "Kano",
    gradient: "from-amber-500 to-orange-600",
  },
];

export function Testimonials() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-grid opacity-40 mask-fade-b"
        aria-hidden
      />
      <div className="landing-container relative py-20 lg:py-28">
        <SectionHeader
          eyebrow="Loved across Nigeria"
          title={
            <>
              Real people.{" "}
              <span className="gradient-text animate-gradient-pan">
                Real results.
              </span>
            </>
          }
          description="From Lagos to Kano, students, teachers and parents are seeing the difference PrepWell makes."
        />

        <Reveal delay={100}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <LuStar key={i} className="h-5 w-5 fill-accent text-accent" />
              ))}
            </div>
            <p className="text-sm font-bold ink">
              4.9/5 average
              <span className="font-semibold ink-faint">
                {" "}
                · 2,300+ ratings
              </span>
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={(i % 4) * 90}>
              <figure className="relative flex h-full flex-col justify-between rounded-2xl surface hairline p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <div>
                  <LuQuote className="h-6 w-6 text-primary/25" />
                  <div className="mt-3 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <LuStar key={s} className="h-3.5 w-3.5 fill-accent text-accent" />
                    ))}
                  </div>
                  <blockquote className="mt-3 text-sm leading-relaxed ink">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                </div>
                <figcaption className="mt-6 flex items-center gap-3 border-t hairline pt-5">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-xs font-extrabold text-white",
                      t.gradient,
                    )}
                  >
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-extrabold ink">{t.name}</p>
                    <p className="text-xs font-semibold ink-faint">{t.role}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold ink-faint">
                      <LuMapPin className="h-3 w-3" />
                      {t.location}
                    </p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
