import Link from "next/link";
import { LuFileText, LuTimer, LuMonitor, LuArrowRight } from "react-icons/lu";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

const practiceOptions = [
  {
    title: "Past Questions",
    description:
      "Browse and practice actual JAMB past questions organized by subject and year, with detailed explanations for every answer. WAEC and NECO papers are coming soon.",
    href: "/practice/past-questions",
    icon: LuFileText,
    tile: "bg-tone-green-soft text-tone-green-ink",
    stats: "JAMB",
    badge: "green" as const,
    comingSoon: "WAEC & NECO coming soon",
  },
  {
    title: "Mock Exam",
    description:
      "Take a full-length exam under timed conditions, with auto-grading. JAMB format today; WAEC (Objective + Theory) and NECO are coming soon.",
    href: "/practice/mock-exam",
    icon: LuTimer,
    tile: "bg-tone-purple-soft text-tone-purple-ink",
    stats: "Timed • Full-length",
    badge: "purple" as const,
    comingSoon: "WAEC & NECO coming soon",
  },
  {
    title: "JAMB CBT Practice",
    description:
      "Simulate the JAMB Computer-Based Test. 180 questions, 4 subjects, 2 hours. Practice navigating the CBT interface under pressure.",
    href: "/practice/cbt",
    icon: LuMonitor,
    tile: "bg-tone-blue-soft text-tone-blue-ink",
    stats: "180 questions • 2 hours",
    badge: "blue" as const,
    comingSoon: null,
  },
];

export default function PracticePage() {
  return (
    <div>
      <PageHeader
        title="Practice"
        description="Pick a mode that fits your focus level. Past questions are the fastest way to improve your exam performance."
      />

      <div className="grid grid-cols-1 gap-4">
        {practiceOptions.map((option) => (
          <Link
            key={option.title}
            href={option.href}
            className="card card-interactive group flex items-start gap-5 p-6"
          >
            <div
              className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${option.tile}`}
            >
              <option.icon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-foreground">{option.title}</h3>
                <Badge variant={option.badge}>{option.stats}</Badge>
                {option.comingSoon && <Badge>{option.comingSoon}</Badge>}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {option.description}
              </p>
            </div>
            <LuArrowRight className="mt-1 h-5 w-5 flex-shrink-0 text-muted transition-all group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
