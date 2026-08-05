import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        primary: "border-primary/20 bg-primary-soft text-primary-soft-foreground",
        blue: "border-tone-blue-line bg-tone-blue-soft text-tone-blue-ink",
        green: "border-tone-green-line bg-tone-green-soft text-tone-green-ink",
        purple: "border-tone-purple-line bg-tone-purple-soft text-tone-purple-ink",
        amber: "border-tone-amber-line bg-tone-amber-soft text-tone-amber-ink",
        orange: "border-tone-orange-line bg-tone-orange-soft text-tone-orange-ink",
        red: "border-tone-red-line bg-tone-red-soft text-tone-red-ink",
        teal: "border-tone-teal-line bg-tone-teal-soft text-tone-teal-ink",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
