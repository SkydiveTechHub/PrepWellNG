import { cn } from "@/lib/utils";

const TONE_CLS: Record<string, string> = {
  neutral: "border-border-strong bg-secondary text-muted",
  info: "border-border-strong bg-secondary text-foreground",
  // Mirrors StatusBanner's treatment (border-<tone>/30 + bg-<tone>-soft) so a
  // badge and a banner of the same tone read as the same colour.
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info" | "success" | "warning";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-lg border px-2 py-0.5 text-xs font-semibold",
        TONE_CLS[tone] ?? TONE_CLS.neutral,
      )}
    >
      {children}
    </span>
  );
}
