import { redirect } from "next/navigation";
import { LuGraduationCap } from "react-icons/lu";
import { auth } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Signed-in users belong on the dashboard, not the login screen.
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="min-h-full flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-white">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
              <LuGraduationCap className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">PrepWell NG</h1>
              <p className="text-sm text-blue-200">Nigeria</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold leading-tight mb-4">
            Ace your WAEC, JAMB &amp; NECO
          </h2>
          <p className="text-blue-100 leading-relaxed">
            Structured lessons from SS1 to SS3. Thousands of past questions with
            explanations. Mock exams under real conditions. Personalized study
            plans that adapt to your performance.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">44+</p>
              <p className="text-xs text-blue-200">Subjects</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">3</p>
              <p className="text-xs text-blue-200">Exam Bodies</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">SS1–3</p>
              <p className="text-xs text-blue-200">Full Coverage</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
