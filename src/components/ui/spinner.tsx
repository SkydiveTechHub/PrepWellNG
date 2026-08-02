import { cn } from "@/lib/utils";

export function Spinner({
  label,
  className,
  iconClassName,
}: {
  label?: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-20", className)}>
      <div
        className={cn(
          "h-10 w-10 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin",
          iconClassName,
        )}
        role="status"
        aria-label={label ?? "Loading"}
      />
      {label && (
        <p className="mt-4 text-sm text-muted animate-pulse">{label}</p>
      )}
    </div>
  );
}
