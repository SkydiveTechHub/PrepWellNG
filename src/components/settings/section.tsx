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
    <section className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted mt-1">{description}</p>}
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
      className={
        error
          ? "mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
          : "mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700"
      }
    >
      {error ?? success}
    </div>
  );
}

export const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

export const labelClass = "block text-sm font-medium mb-1.5";

export const submitClass =
  "bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50";
