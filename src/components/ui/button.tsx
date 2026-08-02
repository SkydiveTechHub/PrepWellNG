import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover active:scale-[0.98]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-border active:scale-[0.98]",
        outline:
          "border border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary-soft active:scale-[0.98]",
        ghost: "text-foreground hover:bg-secondary active:scale-[0.98]",
        success:
          "bg-success text-success-foreground shadow-soft hover:brightness-105 active:scale-[0.98]",
        danger:
          "bg-danger text-danger-foreground shadow-soft hover:brightness-105 active:scale-[0.98]",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export function buttonClass(variant?: ButtonVariants["variant"], size?: ButtonVariants["size"], className?: string) {
  return cn(buttonVariants({ variant, size }), className);
}

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariants) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
