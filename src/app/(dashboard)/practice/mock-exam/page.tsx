import Link from "next/link";
import { LuTimer, LuArrowRight, LuBookOpen, LuZap } from "react-icons/lu";

const examTypes = [
  {
    name: "WAEC",
    description: "West African Senior School Certificate Examination",
    href: "/practice/mock-exam/session?examType=WAEC",
    color: "bg-blue-100 text-blue-700 border-blue-200",
    subjects: "Multi-subject · Timed",
  },
  {
    name: "JAMB",
    description: "Joint Admissions and Matriculation Board",
    href: "/practice/mock-exam/session?examType=JAMB",
    color: "bg-green-100 text-green-700 border-green-200",
    subjects: "4 subjects · 180 questions",
  },
  {
    name: "NECO",
    description: "National Examination Council",
    href: "/practice/mock-exam/session?examType=NECO",
    color: "bg-purple-100 text-purple-700 border-purple-200",
    subjects: "Multi-subject · Timed",
  },
];

export default function MockExamPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Mock Exam</h1>
        <p className="text-muted mt-1">
          Simulate a real exam under timed conditions. Pick an exam type to start.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {examTypes.map((exam) => (
          <Link
            key={exam.name}
            href={exam.href}
            className="block bg-card rounded-xl border border-border p-6 hover:shadow-md hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <span className={`text-xs font-bold px-3 py-1 rounded-full border ${exam.color}`}>
                {exam.name}
              </span>
              <LuZap className="w-5 h-5 text-muted group-hover:text-primary transition-colors" />
            </div>
            <p className="text-sm text-foreground mb-2">{exam.description}</p>
            <p className="text-xs text-muted mb-4">{exam.subjects}</p>
            <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
              Start exam <LuArrowRight className="w-4 h-4" />
            </span>
          </Link>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-3">
          <LuBookOpen className="w-5 h-5 text-muted mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Practice by subject</h3>
            <p className="text-sm text-muted mt-1">
              Prefer to focus on one subject at a time?{" "}
              <Link
                href="/practice/past-questions"
                className="text-primary hover:underline font-medium"
              >
                Browse past questions by subject.
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
