// Exam configuration and grading boundaries

export const EXAM_CONFIG = {
  WAEC: {
    name: "WAEC WASSCE",
    fullName: "West African Senior School Certificate Examination",
    minSubjects: 5,
    maxSubjects: 9,
    compulsorySubjects: ["English Language", "Mathematics"],
    paperTypes: ["OBJECTIVE", "THEORY", "PRACTICAL"],
    gradingScale: "A1-F9",
    periods: ["May/June (School)", "Nov/Dec (GCE)"],
  },
  JAMB: {
    name: "JAMB UTME",
    fullName: "Unified Tertiary Matriculation Examination",
    totalSubjects: 4,
    compulsorySubject: "Use of English",
    totalMarks: 400,
    marksPerSubject: 100,
    totalQuestions: 180,
    englishQuestions: 60,
    otherSubjectQuestions: 40,
    durationMinutes: 120,
    format: "CBT",
    noNegativeMarking: true,
  },
  NECO: {
    name: "NECO SSCE",
    fullName: "National Examinations Council Senior School Certificate Examination",
    minSubjects: 5,
    maxSubjects: 9,
    compulsorySubjects: ["English Language", "Mathematics"],
    paperTypes: ["OBJECTIVE", "THEORY"],
    gradingScale: "A1-F9",
    periods: ["June/July (Internal)", "Nov/Dec (External)"],
  },
} as const;

export const GRADE_BOUNDARIES = [
  { grade: "A1", min: 75, max: 100, remark: "Excellent", isCredit: true },
  { grade: "B2", min: 70, max: 74, remark: "Very Good", isCredit: true },
  { grade: "B3", min: 65, max: 69, remark: "Good", isCredit: true },
  { grade: "C4", min: 60, max: 64, remark: "Credit", isCredit: true },
  { grade: "C5", min: 55, max: 59, remark: "Credit", isCredit: true },
  { grade: "C6", min: 50, max: 54, remark: "Credit", isCredit: true },
  { grade: "D7", min: 45, max: 49, remark: "Pass", isCredit: false },
  { grade: "E8", min: 40, max: 44, remark: "Pass", isCredit: false },
  { grade: "F9", min: 0, max: 39, remark: "Fail", isCredit: false },
] as const;

// JAMB cut-off marks by course competitiveness (approximate)
export const JAMB_CUTOFFS = {
  VERY_COMPETITIVE: 280, // Medicine, Law at top universities
  COMPETITIVE: 250,      // Engineering, Pharmacy
  MODERATE: 200,         // Sciences, Social Sciences
  STANDARD: 180,         // Arts, Education, Agriculture
  MINIMUM: 140,          // Polytechnics, Colleges of Education
} as const;

// Nigerian states (for registration)
export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo",
  "Ekiti", "Enugu", "FCT Abuja", "Gombe", "Imo", "Jigawa",
  "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara",
  "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo", "Osun",
  "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

// Boards whose content isn't ready to sit yet. JAMB is the only board with a
// complete, syllabus-tagged question bank, so WAEC and NECO are surfaced but
// held back — visible in the pickers with a "Coming soon" tag, and not
// selectable. Removing a board from this set is all it takes to ship it.
export const COMING_SOON_BOARDS = new Set<string>(["WAEC", "NECO"]);

export function isComingSoonBoard(examType: string): boolean {
  return COMING_SOON_BOARDS.has(examType);
}
