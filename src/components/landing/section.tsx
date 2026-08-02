import { LuSparkles } from "react-icons/lu";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  const centered = align === "center";
  return (
    <Reveal className={cn(centered && "text-center", className)}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-primary-soft-foreground">
        <LuSparkles className="h-3 w-3" />
        {eyebrow}
      </span>
      <h2 className="mt-4 text-3xl font-extrabold leading-[1.15] tracking-tight ink sm:text-4xl lg:text-[2.6rem]">
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-4 max-w-2xl text-base leading-relaxed ink-muted sm:text-lg",
            centered && "mx-auto",
          )}
        >
          {description}
        </p>
      ) : null}
    </Reveal>
  );
}
