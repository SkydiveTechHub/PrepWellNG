import Link from "next/link";
import {
  LuFileText,
  LuTimer,
  LuMonitor,
} from "react-icons/lu";

const practiceOptions = [
  {
    title: "Past Questions",
    description:
      "Browse and practice actual WAEC, JAMB, and NECO past questions organized by subject and year. See detailed explanations for every answer.",
    href: "/practice/past-questions",
    icon: LuFileText,
    color: "text-green-600 bg-green-50 border-green-200",
    stats: "WAEC • JAMB • NECO",
  },
  {
    title: "Mock Exam",
    description:
      "Take a full-length exam under timed conditions. Simulates real WAEC (Objective + Theory) or NECO format with auto-grading.",
    href: "/practice/mock-exam",
    icon: LuTimer,
    color: "text-purple-600 bg-purple-50 border-purple-200",
    stats: "Timed • Full-length",
  },
  {
    title: "JAMB CBT Practice",
    description:
      "Simulate the JAMB Computer-Based Test. 180 questions, 4 subjects, 2 hours. Practice navigating the CBT interface under pressure.",
    href: "/practice/cbt",
    icon: LuMonitor,
    color: "text-blue-600 bg-blue-50 border-blue-200",
    stats: "180 questions • 2 hours",
  },
];

export default function PracticePage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Practice</h1>
        <p className="text-muted mt-1">
          Choose a practice mode. Past questions are the fastest way to improve
          your exam performance.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {practiceOptions.map((option) => (
          <Link
            key={option.title}
            href={option.href}
            className="flex items-start gap-5 bg-card rounded-xl border border-border p-6 hover:shadow-md hover:border-primary/30 transition-all"
          >
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center border flex-shrink-0 ${option.color}`}
            >
              <option.icon className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">{option.title}</h3>
              <p className="text-sm text-muted mt-1">{option.description}</p>
              <p className="text-xs font-medium text-primary mt-2">
                {option.stats}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
