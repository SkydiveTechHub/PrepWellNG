import Link from "next/link";
import { LuGraduationCap } from "react-icons/lu";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  className,
}: {
  href?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-blue-600 to-brand text-white shadow-soft">
        <LuGraduationCap className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-extrabold tracking-tight ink">
          PrepWell
        </span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] ink-faint">
          WAEC · JAMB · NECO
        </span>
      </span>
    </Link>
  );
}
