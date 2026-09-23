import { LuCalendarDays } from "react-icons/lu";
import { activeExamBanner } from "@/lib/exam-banner";

// Two shapes of the same fact, because the sidebar has a whole footer to fill
// and the mobile drawer has one line. Both are server components streamed into
// their client shells as slots, so the chrome renders without waiting on the
// pooler — and `activeExamBanner` is request-cached, so they share one query.

type Props = { userId: string; classLevel?: string | null };

async function load(props: Props) {
  try {
    return await activeExamBanner(props);
  } catch (error) {
    // A countdown is never worth a broken sidebar.
    console.error("Loading the exam countdown failed:", error);
    return null;
  }
}

/** The sidebar footer card. Renders nothing without a plan counting down. */
export async function ExamCountdownCard(props: Props) {
  const banner = await load(props);
  if (!banner) return null;

  return (
    <div className="px-4 py-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-hero-from to-hero-to p-4 shadow-lift">
        <div className="absolute -right-4 -top-6 h-20 w-20 rounded-full bg-white/10" />
        <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center gap-1.5">
            <LuCalendarDays className="h-3.5 w-3.5 text-white/80" />
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
              {banner.label}
            </p>
          </div>
          <p className="mt-1 text-2xl font-bold text-white">
            {banner.daysToExam}
            <span className="ml-1 text-sm font-semibold text-white/80">days</span>
          </p>
          <p className="text-xs text-white/80">
            Every question today counts. Keep going!
          </p>
        </div>
      </div>
    </div>
  );
}

/** The single line at the foot of the mobile drawer. */
export async function ExamCountdownRow(props: Props) {
  const banner = await load(props);
  if (!banner) return null;

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-center justify-between rounded-xl bg-secondary px-4 py-3">
        <div className="flex items-center gap-2">
          <LuCalendarDays className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {banner.label}
          </span>
        </div>
        <span className="text-sm font-bold text-primary">
          {banner.daysToExam} days
        </span>
      </div>
    </div>
  );
}
