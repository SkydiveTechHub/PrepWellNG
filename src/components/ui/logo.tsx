import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { siteName } from "@/lib/seo/site";

/**
 * The brand lockup already contains the mark, the wordmark and the
 * "LEARN · PRACTICE · PASS" tagline, so there is no text beside it.
 *
 * Two files ship because the artwork is flat ink rather than a themeable
 * SVG: the navy-and-blue lockup reads on light surfaces, the reversed white
 * one on dark. Both are rendered and `.theme-light-only` / `.theme-dark-only`
 * (globals.css) pick one, following the same prefers-color-scheme +
 * `data-theme` rules as the colour tokens so a future toggle needs no change
 * here. `priority` because the logo sits in the fixed header, above the fold
 * on every page.
 *
 * The width/height pairs are the rendered box, not the PNG's intrinsic size —
 * next/image builds its srcset from these, and the source dimensions would
 * have it ship a 644px asset for a 150px slot. Both files are trimmed to the
 * ink, so one CSS height renders both lockups at the same visual size; the
 * widths still differ because the two exports are not the same aspect ratio.
 *
 * Size is the `h-12` default rather than a call-site choice so the nav and
 * footer cannot drift apart; the dashboard chrome, which has less room, opts
 * out through `imageClassName`.
 *
 * `href={null}` renders a plain span instead of a link — for the places the
 * lockup is a heading rather than a way back home, like the mobile drawer.
 */
export function Logo({
  href = "/",
  prefetch,
  className,
  imageClassName,
}: {
  href?: string | null;
  /** Passed through to the link. The dashboard suppresses it mid-exam. */
  prefetch?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  const imageClasses = cn("h-18 w-auto", imageClassName);
  const wrapperClasses = cn("flex items-center", className);

  // Both images are decorative and the name lives on the wrapper: whichever
  // lockup the theme hides is `display:none` and so invisible to a screen
  // reader, which would otherwise leave the dark-mode logo unlabelled.
  const lockup = (
    <>
      <Image
        src="/logo-on-light.png"
        alt=""
        aria-hidden
        width={154}
        height={48}
        priority
        className={cn(imageClasses, "theme-light-only")}
      />
      <Image
        src="/logo-on-dark.png"
        alt=""
        aria-hidden
        width={177}
        height={48}
        priority
        className={cn(imageClasses, "theme-dark-only")}
      />
    </>
  );

  if (href === null) {
    return (
      <span role="img" aria-label={siteName} className={wrapperClasses}>
        {lockup}
      </span>
    );
  }

  return (
    <Link
      href={href}
      prefetch={prefetch}
      aria-label={siteName}
      className={wrapperClasses}
    >
      {lockup}
    </Link>
  );
}
