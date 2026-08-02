import Link from "next/link";
import {
  LuMonitor,
  LuArrowRight,
  LuBookOpen,
  LuTimer,
  LuCheck,
  LuTarget,
} from "react-icons/lu";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const jambSubjects = [
  { name: "English Language", slug: "english-language", code: "ENG" },
  { name: "Mathematics", slug: "mathematics", code: "MTH" },
  { name: "Physics", slug: "physics", code: "PHY" },
  { name: "Chemistry", slug: "chemistry", code: "CHM" },
  { name: "Biology", slug: "biology", code: "BIO" },
  { name: "Economics", slug: "economics", code: "ECO" },
  { name: "Commerce", slug: "commerce", code: "COM" },
  { name: "Government", slug: "government", code: "GOV" },
  { name: "Literature in English", slug: "literature-in-english", code: "LIT" },
  { name: "Geography", slug: "geography", code: "GEO" },
  { name: "Christian Religious Studies", slug: "christian-religious-studies", code: "CRS" },
  { name: "Islamic Studies", slug: "islamic-studies", code: "IRS" },
];

const howItWorks = [
  "40 randomly selected JAMB questions per subject",
  "60 minutes to complete each subject",
  "Timed questions auto-submit when time runs out",
  "Detailed explanations and topic breakdowns after each attempt",
];

export default function CBTPracticePage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="JAMB CBT Practice"
        description="Practice JAMB Computer-Based Test questions and get exam-ready with the official CBT format."
      />

      <Card className="relative mb-8 overflow-hidden border-blue-200 bg-blue-50/60 p-6 md:p-7">
        <div className="absolute -right-10 -top-14 h-40 w-40 rounded-full bg-blue-500/10" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex max-w-2xl items-start gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <LuMonitor className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-base font-bold text-blue-900">
                Full JAMB CBT simulation
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-blue-800/80">
                Take a complete JAMB CBT mock exam — 180 questions across 4 subjects with the
                official JAMB interface.
              </p>
            </div>
          </div>
          <Link
            href="/practice/mock-exam/session?examType=JAMB"
            className={buttonClass("primary", "lg")}
          >
            <LuMonitor className="h-4 w-4" />
            Start Full CBT Simulation
          </Link>
        </div>
      </Card>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Choose a JAMB subject
        </h2>
        <Badge variant="green">{jambSubjects.length} subjects</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jambSubjects.map((subject) => (
          <Link
            key={subject.code}
            href={`/practice/past-questions/${subject.slug}?exam=JAMB`}
            className="card card-interactive group flex items-center justify-between gap-3 p-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-green-100 text-xs font-bold text-green-700">
                {subject.code}
              </span>
              <span className="truncate text-sm font-semibold text-foreground">
                {subject.name}
              </span>
            </div>
            <LuArrowRight className="h-4 w-4 flex-shrink-0 text-muted transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>

      <Card className="mt-8 p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <LuBookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              How it works
              <LuTimer className="h-4 w-4 text-muted" />
            </h3>
            <ul className="mt-3 space-y-2">
              {howItWorks.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                  <LuCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <LuTarget className="h-3.5 w-3.5" />
              Tip: use focus mode and hide the timer in the quiz to stay distraction-free.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
