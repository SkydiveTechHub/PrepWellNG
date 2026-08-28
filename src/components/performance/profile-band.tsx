import { Progress } from "@/components/ui/progress";
import type { Profile } from "@/engines/analytics/profile";

const BAND_LABEL: Record<string, string> = {
  BASIC: "Basic",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  UNLABELLED: "Unlabelled",
};

const PACING_COPY = {
  RUSHED: "You're answering faster than these questions are meant to take.",
  ON_PACE: "You're answering at about the expected pace.",
  SLOW: "You're taking longer than these questions are meant to take.",
} as const;

export function ProfileBand({ profile }: { profile: Profile }) {
  if (profile.status === "insufficient") {
    return (
      <div className="card mt-4 p-5">
        <p className="text-sm text-muted">
          Answer {profile.needed - profile.answered} more{" "}
          {profile.needed - profile.answered === 1 ? "question" : "questions"} here and
          you'll see how you do by difficulty, and whether your pace would survive a
          timed paper.
        </p>
      </div>
    );
  }

  return (
    <div className="card mt-4 space-y-4 p-5">
      <div>
        <p className="section-label mb-3">Accuracy by difficulty</p>
        <ul className="space-y-2.5">
          {profile.bands.map((band) => (
            <li key={band.difficulty}>
              <span className="mb-1 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">
                  {BAND_LABEL[band.difficulty] ?? band.difficulty}
                </span>
                <span className="text-muted">
                  {Math.round(band.accuracy)}% of {band.answered}
                </span>
              </span>
              <Progress value={Math.round(band.accuracy)} tone="auto" />
            </li>
          ))}
        </ul>
      </div>

      {profile.pacing && (
        <p className="text-xs leading-relaxed text-muted">
          {PACING_COPY[profile.pacing.verdict]} You average{" "}
          {Math.round(profile.pacing.meanSeconds)}s against an expected{" "}
          {Math.round(profile.pacing.expectedSeconds)}s.
        </p>
      )}

      {profile.rapidGuessRate > 0 && (
        <p className="text-xs leading-relaxed text-muted">
          {Math.round(profile.rapidGuessRate)}% of your answers were too fast to have
          been read.
        </p>
      )}
    </div>
  );
}
