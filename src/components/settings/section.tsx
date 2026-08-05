import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

/** Shared card chrome for each independently-saved settings section. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-base font-bold tracking-tight text-foreground">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function FormMessage({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (!error && !success) return null;

  return (
    <div
      role="status"
      className={cn(
        "mb-4 rounded-xl border p-3 text-sm",
        error
          ? "border-danger/20 bg-danger-soft text-danger"
          : "border-success/20 bg-success-soft text-success",
      )}
    >
      {error ?? success}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-soft outline-none transition-all duration-150 placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-primary/15";

export const labelClass = "mb-1.5 block text-sm font-semibold text-foreground";

export const submitClass = buttonClass("primary", "md");
