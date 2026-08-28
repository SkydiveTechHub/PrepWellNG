import { CLASS_LEVELS, type ClassLevel } from "@/lib/curriculum-scope";
import { isSubscriptionTier, type SubscriptionTier } from "@/lib/subscription";
import { isAccountStatus, type AccountStatus } from "@/lib/account-status";

/**
 * Narrowing the admin student list. Pure — no Prisma, no React — so the
 * filtering rules can be tested without a database or a browser, the way
 * admin-lesson-browse.ts is.
 *
 * See docs/superpowers/specs/2026-08-27-admin-console-structure-design.md
 */

export const STUDENT_PAGE_SIZE = 25;

// Mirrors the Prisma `Track` enum. Declared here rather than imported from
// @prisma/client so this module stays database-free and testable.
export const TRACKS = ["SCIENCE", "ARTS", "COMMERCIAL"] as const;

export type Track = (typeof TRACKS)[number];

export function isTrack(value: string | undefined | null): value is Track {
  return typeof value === "string" && (TRACKS as readonly string[]).includes(value);
}

function isClassLevel(value: string | undefined | null): value is ClassLevel {
  return (
    typeof value === "string" && (CLASS_LEVELS as readonly string[]).includes(value)
  );
}

export interface RawStudentParams {
  q?: string;
  class?: string;
  track?: string;
  tier?: string;
  status?: string;
  page?: string;
}

export interface StudentFilter {
  search: string | null;
  classLevel: ClassLevel | null;
  track: Track | null;
  tier: SubscriptionTier | null;
  status: AccountStatus | null;
  page: number;
}

/**
 * Coerce raw query strings into a filter that is safe to hand to Prisma.
 *
 * An unrecognised class level, track, tier or status is dropped rather than
 * passed through as a `where` clause on an enum column, which would throw. The
 * page falls back to 1 rather than to NaN; `pageWindow` clamps the upper end
 * once the total is known.
 */
export function normaliseStudentFilter(params: RawStudentParams): StudentFilter {
  const search = params.q?.trim();
  const page = Number.parseInt(params.page ?? "", 10);

  return {
    search: search ? search : null,
    classLevel: isClassLevel(params.class) ? params.class : null,
    track: isTrack(params.track) ? params.track : null,
    tier: isSubscriptionTier(params.tier) ? params.tier : null,
    status: isAccountStatus(params.status) ? params.status : null,
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  };
}

/**
 * The filter as query params, for links that must preserve it.
 *
 * `page` is deliberately absent: Pagination owns that key, and writing it here
 * too would have the two fight over it.
 */
export function studentFilterParams(filter: StudentFilter): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.search) params.q = filter.search;
  if (filter.classLevel) params.class = filter.classLevel;
  if (filter.track) params.track = filter.track;
  if (filter.tier) params.tier = filter.tier;
  if (filter.status) params.status = filter.status;
  return params;
}

export function fullName(student: {
  firstName: string;
  lastName: string;
}): string {
  return `${student.firstName} ${student.lastName}`;
}
