import {
  LuAtom,
  LuBookMarked,
  LuCalculator,
  LuCpu,
  LuDna,
  LuFeather,
  LuFlaskConical,
  LuLandmark,
  LuPenTool,
  LuSigma,
  LuSprout,
  LuStore,
} from "react-icons/lu";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./section";
import { Reveal } from "./reveal";

const SUBJECTS = [
  {
    name: "Mathematics",
    icon: LuCalculator,
    gradient: "from-blue-500 to-indigo-600",
    tagline: "Algebra, geometry, statistics & more",
    lessons: 84,
    questions: 3240,
    flashcards: 210,
    difficulty: 3,
    progress: 72,
  },
  {
    name: "English Language",
    icon: LuPenTool,
    gradient: "from-emerald-500 to-teal-600",
    tagline: "Comprehension, grammar & lexis",
    lessons: 76,
    questions: 2980,
    flashcards: 190,
    difficulty: 2,
    progress: 64,
  },
  {
    name: "Biology",
    icon: LuDna,
    gradient: "from-green-500 to-emerald-600",
    tagline: "Cells, genetics & ecology",
    lessons: 68,
    questions: 2410,
    flashcards: 240,
    difficulty: 2,
    progress: 58,
  },
  {
    name: "Chemistry",
    icon: LuFlaskConical,
    gradient: "from-violet-500 to-purple-600",
    tagline: "Moles, bonding & reactions",
    lessons: 72,
    questions: 2650,
    flashcards: 230,
    difficulty: 3,
    progress: 51,
  },
  {
    name: "Physics",
    icon: LuAtom,
    gradient: "from-cyan-500 to-blue-600",
    tagline: "Mechanics, waves & energy",
    lessons: 70,
    questions: 2530,
    flashcards: 205,
    difficulty: 3,
    progress: 47,
  },
  {
    name: "Economics",
    icon: LuStore,
    gradient: "from-amber-500 to-orange-600",
    tagline: "Markets, money & national income",
    lessons: 58,
    questions: 1960,
    flashcards: 160,
    difficulty: 2,
    progress: 43,
  },
  {
    name: "Government",
    icon: LuLandmark,
    gradient: "from-rose-500 to-pink-600",
    tagline: "Policies, constitutions & systems",
    lessons: 52,
    questions: 1780,
    flashcards: 150,
    difficulty: 2,
    progress: 39,
  },
  {
    name: "Commerce",
    icon: LuBookMarked,
    gradient: "from-fuchsia-500 to-purple-600",
    tagline: "Trade, finance & business",
    lessons: 48,
    questions: 1620,
    flashcards: 140,
    difficulty: 2,
    progress: 36,
  },
  {
    name: "Literature in English",
    icon: LuFeather,
    gradient: "from-teal-500 to-cyan-600",
    tagline: "Prose, poetry & drama",
    lessons: 54,
    questions: 1710,
    flashcards: 175,
    difficulty: 2,
    progress: 33,
  },
  {
    name: "Agricultural Science",
    icon: LuSprout,
    gradient: "from-lime-500 to-green-600",
    tagline: "Crops, animals & soil",
    lessons: 50,
    questions: 1580,
    flashcards: 155,
    difficulty: 1,
    progress: 30,
  },
  {
    name: "Further Mathematics",
    icon: LuSigma,
    gradient: "from-indigo-500 to-blue-700",
    tagline: "Calculus, vectors & logic",
    lessons: 66,
    questions: 2190,
    flashcards: 185,
    difficulty: 4,
    progress: 26,
  },
  {
    name: "Computer Studies",
    icon: LuCpu,
    gradient: "from-slate-600 to-slate-800",
    tagline: "Hardware, software & programming",
    lessons: 44,
    questions: 1430,
    flashcards: 130,
    difficulty: 1,
    progress: 22,
  },
];

function DifficultyDots({ level }: { level: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Difficulty ${level} of 4`}>
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < level ? "bg-primary" : "bg-secondary",
          )}
        />
      ))}
    </span>
  );
}

export function Subjects() {
  return (
    <section id="subjects" className="scroll-mt-20 bg-gradient-to-b from-secondary/40 to-transparent">
      <div className="landing-container py-20 lg:py-28">
        <SectionHeader
          eyebrow="12+ subjects"
          title={
            <>
              Every subject your{" "}
              <span className="gradient-text animate-gradient-pan">
                exam needs
              </span>
            </>
          }
          description="From Mathematics to Computer Studies — complete syllabi with lessons, flashcards and thousands of practice questions each."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SUBJECTS.map((subject, i) => (
            <Reveal key={subject.name} delay={(i % 4) * 80}>
              <div className="group relative h-full overflow-hidden rounded-2xl surface hairline p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                <div
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-60 transition-opacity duration-300 group-hover:opacity-100",
                    subject.gradient,
                  )}
                  aria-hidden
                />
                <div className="flex items-start justify-between">
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-soft transition-transform duration-300 group-hover:scale-105",
                      subject.gradient,
                    )}
                  >
                    <subject.icon className="h-6 w-6" />
                  </div>
                  <DifficultyDots level={subject.difficulty} />
                </div>

                <h3 className="mt-4 text-base font-extrabold tracking-tight ink">
                  {subject.name}
                </h3>
                <p className="mt-1 text-xs font-semibold ink-faint">
                  {subject.tagline}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  <span className="chip surface-2 text-ink-muted">
                    {subject.lessons} lessons
                  </span>
                  <span className="chip surface-2 text-ink-muted">
                    {subject.questions.toLocaleString("en-NG")} questions
                  </span>
                  <span className="chip surface-2 text-ink-muted">
                    {subject.flashcards} cards
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest ink-faint">
                    <span>Progress preview</span>
                    <span>{subject.progress}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-brand"
                      style={{ width: `${subject.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
