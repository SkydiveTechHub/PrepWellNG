/**
 * The four kinds of library material, shared by the admin console and the
 * student shelf.
 *
 * Declared as a TypeScript union rather than imported from `@prisma/client` so
 * the pure rules built on it stay testable without a generated client. The
 * members match the `MaterialType` enum in `prisma/schema.prisma` by name.
 */
export const MATERIAL_TYPES = ["PDF", "IMAGE", "VIDEO", "LINK"] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

/**
 * Display text. A map rather than a CSS `capitalize`, which would render the
 * initialism "PDF" as "Pdf".
 */
export const MATERIAL_LABELS: Record<MaterialType, string> = {
  PDF: "PDF",
  IMAGE: "Image",
  VIDEO: "Video",
  LINK: "Link",
};

export function isMaterialType(value: string): value is MaterialType {
  return (MATERIAL_TYPES as readonly string[]).includes(value);
}
