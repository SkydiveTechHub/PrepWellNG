import { redirect } from "next/navigation";
import { LuTimer, LuLayers, LuShuffle } from "react-icons/lu";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { MockExamPicker } from "@/components/practice/mock-exam-picker";

const FACTS = [
  {
    icon: <LuLayers className="h-5 w-5" />,
    label: "Scoped to your syllabus",
    detail: "One term, or a run of them",
  },
  {
    icon: <LuShuffle className="h-5 w-5" />,
    label: "Randomised each time",
    detail: "Drawn from real past papers",
  },
  {
    icon: <LuTimer className="h-5 w-5" />,
    label: "Timed",
    detail: "About 90 seconds per question",
  },
];

// Mock exams scoped by class level and term, so a student can sit exactly what
// they have been taught rather than the whole subject.
export default async function MockExamPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Mock Exam"
        description="Pick an exam board, a subject, and the part of the syllabus you want tested."
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FACTS.map((fact) => (
          <div
            key={fact.label}
            className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-3.5"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
              {fact.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{fact.label}</p>
              <p className="truncate text-xs text-muted">{fact.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <MockExamPicker />
    </div>
  );
}
