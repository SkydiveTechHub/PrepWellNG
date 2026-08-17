import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Diagram attached to a question, explanation or flashcard.
 *
 * The box reserves its height before the image loads, so the options below it
 * do not jump once it arrives — on a slow connection that shift used to land
 * right as the student was reaching for an answer.
 *
 * Two rendering paths, chosen by where the artwork lives:
 *
 *   * A root-relative `src` is our own file under `public/`, so it can go
 *     through `next/image` and come back as AVIF at the width the device
 *     actually needs. That matters more here than anywhere else in the app —
 *     the diagrams are the heaviest thing on the exam screen, some are over
 *     100KB as authored PNGs, and the audience is largely on metered mobile
 *     data.
 *   * Anything else is a remote host from whatever paper the question was
 *     imported from. The optimizer *throws* on a host missing from
 *     `remotePatterns`, and a hard render error mid-exam is worse than an
 *     unoptimised image, so those stay on a plain `<img>`. Add the host to
 *     `next.config.ts` to move it onto the optimised path.
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
  // Root-relative and not protocol-relative (`//host/path`), which is remote.
  const isLocal = src.startsWith("/") && !src.startsWith("//");

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
      {isLocal ? (
        <Image
          src={src}
          alt={alt}
          fill
          // The diagram spans the content column: full width on phones, and on
          // desktop the column is capped at 72rem less the 16rem sidebar and
          // the page gutters. Overstating this only costs a larger candidate,
          // so it is rounded up rather than down.
          sizes="(max-width: 1024px) 100vw, 768px"
          className="object-contain"
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
    </div>
  );
}
