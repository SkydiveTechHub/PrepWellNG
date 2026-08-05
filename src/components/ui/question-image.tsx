import { cn } from "@/lib/utils";

/**
 * Diagram attached to a question, explanation or flashcard.
 *
 * The box reserves its height before the image loads, so the options below it
 * do not jump once it arrives — on a slow connection that shift used to land
 * right as the student was reaching for an answer.
 *
 * Deliberately a plain `<img>` rather than `next/image`: question artwork comes
 * from whatever host the imported paper used, and the optimizer throws on any
 * host missing from `remotePatterns`. A layout shift is bad; a hard render
 * error mid-exam is worse. Switch to `next/image` once the bank's image hosts
 * are known and pinned in next.config.
 */
export function QuestionImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border bg-secondary",
        className,
      )}
      // 16/10 suits most exam diagrams; `object-contain` letterboxes anything
      // taller or wider rather than cropping it.
      style={{ aspectRatio: "16 / 10" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}
