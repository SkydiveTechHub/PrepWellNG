import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  barClassName,
  tone = "primary",
}: {
  value: number;
  className?: string;
  barClassName?: string;
  tone?: "primary" | "success" | "warning" | "danger" | "auto";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const toneClass = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    auto:
      clamped >= 70
        ? "bg-success"
        : clamped >= 40
          ? "bg-warning"
          : "bg-danger",
  }[tone];

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", toneClass, barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
