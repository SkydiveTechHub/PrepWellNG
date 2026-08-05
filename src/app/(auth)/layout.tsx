import { redirect } from "next/navigation";
import { LuGraduationCap, LuCheck, LuSparkles, LuClipboardCheck, LuCalendarClock } from "react-icons/lu";
import { auth } from "@/lib/auth";

const BENEFITS = [
  {
    icon: LuClipboardCheck,
    title: "Thousands of past questions",
    text: "Real WAEC, JAMB & NECO questions with explanations.",
  },
  {
    icon: LuSparkles,
    title: "Mock exams that feel real",
    text: "Timed, full-length simulations that build exam-day calm.",
  },
  {
    icon: LuCalendarClock,
    title: "A plan that adapts to you",
    text: "Study plans that flex with your performance and pace.",
  },
];

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Signed-in users belong on the dashboard, not the login screen.
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="flex min-h-full">
      {/* Left panel — branding */}
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden bg-gradient-to-br from-hero-from via-hero-via to-hero-to p-12 lg:flex">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -right-20 h-[28rem] w-[28rem] rounded-full bg-white/10" />
        <div className="absolute right-16 top-24 h-16 w-16 rounded-2xl bg-white/10" />
        <div className="absolute bottom-40 left-12 h-10 w-10 rounded-full bg-white/10" />

        <div className="relative max-w-md">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <LuGraduationCap className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                PrepWell
              </h1>
              <p className="text-xs font-semibold uppercase tracking-widest text-hero-ink">
                WAEC · JAMB · NECO
              </p>
            </div>
          </div>

          <h2 className="text-3xl font-bold leading-tight text-white">
            Your exam score is built question by question.
          </h2>
          <p className="mt-4 leading-relaxed text-hero-ink">
            Structured lessons from SS1 to SS3, thousands of past questions,
            mock exams under real conditions, and study plans that adapt to you.
          </p>

          <ul className="mt-10 space-y-4">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
                  <benefit.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold text-white">{benefit.title}</p>
                  <p className="text-sm text-hero-ink/90">{benefit.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
            <LuCheck className="h-5 w-5 flex-shrink-0 text-emerald-300" />
            <p className="text-sm text-hero-ink">
              Trusted by students preparing for Nigeria&apos;s biggest exams.
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
