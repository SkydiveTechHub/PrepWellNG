import { cn } from "@/lib/utils";

// Deterministic per-user colour so the same person always gets the same tile.
const COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
];

function initials(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim()?.[0] ?? "";
  const last = lastName?.trim()?.[0] ?? "";
  return (first + last).toUpperCase() || "?";
}

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Avatar({
  image,
  firstName,
  lastName,
  className,
}: {
  image?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  className?: string;
}) {
  const label = initials(firstName, lastName);

  if (image) {
    return (
      /* Plain img rather than next/image: avatars come from Cloudinary and
         Google, and a 32px tile isn't worth coupling two remote hosts into
         next.config. */
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={`${firstName ?? ""} ${lastName ?? ""}`.trim() || "Profile photo"}
        className={cn(
          "w-9 h-9 rounded-full object-cover flex-shrink-0",
          className,
        )}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={cn(
        "w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold",
        colorFor(`${firstName ?? ""}${lastName ?? ""}`),
        className,
      )}
    >
      {label}
    </div>
  );
}
