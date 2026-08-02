import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-border bg-secondary text-secondary-foreground",
        primary: "border-primary/20 bg-primary-soft text-primary-soft-foreground",
        blue: "border-blue-200 bg-blue-100 text-blue-700",
        green: "border-green-200 bg-green-100 text-green-700",
        purple: "border-purple-200 bg-purple-100 text-purple-700",
        amber: "border-amber-200 bg-amber-100 text-amber-700",
        orange: "border-orange-200 bg-orange-100 text-orange-700",
        red: "border-red-200 bg-red-100 text-red-700",
        teal: "border-teal-200 bg-teal-100 text-teal-700",
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
