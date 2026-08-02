import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = "neutral",
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  tone?: "neutral" | "primary" | "success";
}) {
  const toneClasses = {
    neutral: "bg-muted text-muted",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
  }[tone];

  return (
    <div
      className={cn(
        "card flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
            toneClasses,
          )}
        >
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
