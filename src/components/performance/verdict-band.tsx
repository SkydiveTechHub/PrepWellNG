import { Badge } from "@/components/ui/badge";
import type { SubjectVerdict } from "@/lib/analytics/subject-view";

function gradeVariant(grade: string): "green" | "blue" | "amber" | "orange" | "red" {
  switch (grade) {
    case "A": return "green";
    case "B": return "blue";
    case "C": return "amber";
    case "D": return "orange";
    default: return "red";
  }
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
          {verdict.accuracy === null
            ? `You haven't answered any ${subjectName} questions yet.`
            : `You're at ${Math.round(verdict.accuracy)}% accuracy in ${subjectName} across ${verdict.answered} ${verdict.answered === 1 ? "question" : "questions"} — a ${verdict.grade}.`}
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
