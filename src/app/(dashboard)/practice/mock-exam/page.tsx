import Link from "next/link";
import { LuArrowRight, LuBookOpen, LuChevronRight, LuTimer, LuZap } from "react-icons/lu";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const examTypes = [
  {
    name: "WAEC",
    description: "West African Senior School Certificate Examination",
    href: "/practice/mock-exam/session?examType=WAEC",
    badge: "blue" as const,
    subjects: "Multi-subject · Timed",
  },
  {
    name: "JAMB",
    description: "Joint Admissions and Matriculation Board",
    href: "/practice/mock-exam/session?examType=JAMB",
    badge: "green" as const,
    subjects: "4 subjects · 180 questions",
  },
  {
    name: "NECO",
    description: "National Examination Council",
    href: "/practice/mock-exam/session?examType=NECO",
    badge: "purple" as const,
    subjects: "Multi-subject · Timed",
  },
];

export default function MockExamPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mock Exam"
        description="Simulate a real exam under timed conditions. Pick an exam type to start."
      />

      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {examTypes.map((exam) => (
          <Link
            key={exam.name}
            href={exam.href}
            className="card card-interactive group relative flex flex-col overflow-hidden p-6"
          >
            <div className="absolute -right-10 -top-14 h-36 w-36 rounded-full bg-primary/5" />
            <div className="relative flex items-center justify-between">
              <Badge variant={exam.badge}>{exam.name}</Badge>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted transition-colors group-hover:bg-primary-soft group-hover:text-primary">
                <LuZap className="h-4 w-4" />
              </span>
            </div>
            <p className="relative mt-4 text-sm font-semibold leading-relaxed text-foreground">
              {exam.description}
            </p>
            <p className="relative mt-1 flex items-center gap-1.5 text-xs text-muted">
              <LuTimer className="h-3.5 w-3.5" />
              {exam.subjects}
            </p>
            <span className="relative mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-bold text-primary">
              Start exam
              <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <LuBookOpen className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Practice by subject</h3>
            <p className="mt-0.5 text-xs text-muted">
              Prefer to focus on one subject at a time? Browse past questions by subject.
            </p>
          </div>
        </div>
        <Link href="/practice/past-questions" className={buttonClass("outline", "md")}>
          Browse past questions
          <LuChevronRight className="h-4 w-4" />
        </Link>
      </Card>
    </div>
  );
}
