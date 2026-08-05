import { LuCircleCheck, LuInfo, LuTriangleAlert } from "react-icons/lu";
import { cn } from "@/lib/utils";

const TONES = {
  error: { role: "alert" as const, icon: LuTriangleAlert, cls: "border-danger/30 bg-danger-soft text-danger" },
  success: { role: "status" as const, icon: LuCircleCheck, cls: "border-success/30 bg-success-soft text-success" },
  info: { role: "status" as const, icon: LuInfo, cls: "border-border bg-secondary text-foreground" },
};

export function StatusBanner({
  tone,
  title,
  message,
  action,
  className,
}: {
  tone: keyof typeof TONES;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  const { role, icon: Icon, cls } = TONES[tone];
  return (
    <div
      role={role}
      className={cn("flex items-start gap-3 rounded-lg border px-4 py-3", cls, className)}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {message && <p className="mt-0.5 text-sm opacity-90">{message}</p>}
      </div>
      {action}
    </div>
  );
}
