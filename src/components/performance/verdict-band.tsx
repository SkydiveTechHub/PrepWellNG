import { Badge } from "@/components/ui/badge";
import { MIN_GRADED_ANSWERS, type SubjectVerdict } from "@/lib/analytics/subject-view";

function gradeVariant(grade: string): "green" | "blue" | "amber" | "orange" | "red" {
  switch (grade) {
    case "A": return "green";
    case "B": return "blue";
    case "C": return "amber";
    case "D": return "orange";
    default: return "red";
  }
}

/** "an A", "a B" — the vowel sound is in the letter's name, not its spelling. */
function gradeArticle(grade: string): "a" | "an" {
  return grade === "A" || grade === "F" ? "an" : "a";
}

function verdictSentence(verdict: SubjectVerdict, subjectName: string): string {
  if (verdict.answered === 0) {
    return `You haven't answered any ${subjectName} questions yet.`;
  }
  if (verdict.accuracy === null || verdict.grade === null) {
    const remaining = MIN_GRADED_ANSWERS - verdict.answered;
    return `You've answered ${verdict.answered} ${verdict.answered === 1 ? "question" : "questions"} in ${subjectName} so far — answer ${remaining} more and I'll show you a grade.`;
  }
  return `You're at ${Math.round(verdict.accuracy)}% accuracy in ${subjectName} across ${verdict.answered} ${verdict.answered === 1 ? "question" : "questions"} — ${gradeArticle(verdict.grade)} ${verdict.grade}.`;
}

export function VerdictBand({
  subjectName,
  verdict,
}: {
  subjectName: string;
  verdict: SubjectVerdict;
}) {
  const hours = verdict.secondsSpent / 3600;
  const figures = [
    {
      label: "Accuracy",
      value: verdict.accuracy === null ? "—" : `${Math.round(verdict.accuracy)}%`,
    },
    { label: "Questions", value: String(verdict.answered) },
    {
      label: "Topics covered",
      value: `${verdict.topicsCovered}/${verdict.topicsInScope}`,
    },
    {
      label: "Time",
      value: hours >= 1 ? `${hours.toFixed(1)}h` : `${Math.round(verdict.secondsSpent / 60)}m`,
    },
  ];

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm font-semibold leading-relaxed text-foreground">
          {verdictSentence(verdict, subjectName)}
        </p>
        {verdict.grade && (
          <Badge variant={gradeVariant(verdict.grade)}>{verdict.grade}</Badge>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-xl bg-secondary/40 p-3">
            <dt className="text-xs font-semibold text-muted">{figure.label}</dt>
            <dd className="mt-0.5 text-lg font-bold tracking-tight text-foreground">
              {figure.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
