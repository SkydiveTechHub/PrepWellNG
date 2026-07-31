export const TRACK_CATEGORIES = [
  "CORE",
  "SCIENCE",
  "ARTS",
  "COMMERCIAL",
  "VOCATIONAL",
] as const;

export type TrackCategory = (typeof TRACK_CATEGORIES)[number];

export const TRACK_LABELS: Record<TrackCategory, string> = {
  CORE: "Core",
  SCIENCE: "Science",
  ARTS: "Arts",
  COMMERCIAL: "Commercial",
  VOCATIONAL: "Vocational",
};

export const TRACK_COLORS: Record<TrackCategory, string> = {
  CORE: "bg-blue-50 border-blue-200 text-blue-700",
  SCIENCE: "bg-green-50 border-green-200 text-green-700",
  ARTS: "bg-purple-50 border-purple-200 text-purple-700",
  COMMERCIAL: "bg-orange-50 border-orange-200 text-orange-700",
  VOCATIONAL: "bg-teal-50 border-teal-200 text-teal-700",
};

/**
 * Which subject categories matter to a student on the given track.
 *
 * CORE is always included: every Nigerian candidate sits English Language and
 * Mathematics regardless of whether they're a Science, Arts, or Commercial
 * student, so filtering to the track alone would hide their compulsory subjects.
 *
 * A student with no track recorded sees everything — better than showing them
 * an arbitrary slice.
 */
export function relevantTrackCategories(
  track?: string | null,
): readonly TrackCategory[] {
  if (!track || !TRACK_CATEGORIES.includes(track as TrackCategory)) {
    return TRACK_CATEGORIES;
  }
  return ["CORE", track as TrackCategory];
}

export function isRelevantSubject(
  trackCategory: string,
  track?: string | null,
) {
  return relevantTrackCategories(track).includes(trackCategory as TrackCategory);
}
