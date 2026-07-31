// JAMB UTME Subject Combinations by Course
// Use of English is always compulsory and implicit — these list the other 3

export type JambCombinationDef = {
  course: string;
  faculty: string;
  subjects: string[];       // Required subjects (pick all)
  alternatives?: string[];  // "Pick one from" options
  notes?: string;
};

export const JAMB_COMBINATIONS: JambCombinationDef[] = [
  // ─── Medicine & Health ─────────────────────────────
  { course: "Medicine and Surgery", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Pharmacy", faculty: "Pharmacy", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Nursing Science", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Dentistry", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Medical Laboratory Science", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Physiotherapy", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Optometry", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Radiography", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Anatomy", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Physiology", faculty: "Medicine", subjects: ["Biology", "Chemistry", "Physics"] },
  { course: "Veterinary Medicine", faculty: "Veterinary", subjects: ["Biology", "Chemistry", "Physics"] },

  // ─── Engineering ───────────────────────────────────
  { course: "Electrical Engineering", faculty: "Engineering", subjects: ["Mathematics", "Physics", "Chemistry"] },
  { course: "Mechanical Engineering", faculty: "Engineering", subjects: ["Mathematics", "Physics", "Chemistry"] },
  { course: "Civil Engineering", faculty: "Engineering", subjects: ["Mathematics", "Physics", "Chemistry"] },
  { course: "Chemical Engineering", faculty: "Engineering", subjects: ["Mathematics", "Physics", "Chemistry"] },
  { course: "Computer Engineering", faculty: "Engineering", subjects: ["Mathematics", "Physics", "Chemistry"] },
  { course: "Petroleum Engineering", faculty: "Engineering", subjects: ["Mathematics", "Physics", "Chemistry"] },

  // ─── Sciences ──────────────────────────────────────
  { course: "Computer Science", faculty: "Science", subjects: ["Mathematics", "Physics"], alternatives: ["Chemistry", "Biology", "Economics"] },
  { course: "Software Engineering", faculty: "Science", subjects: ["Mathematics", "Physics"], alternatives: ["Chemistry", "Biology"] },
  { course: "Mathematics", faculty: "Science", subjects: ["Mathematics"], alternatives: ["Physics", "Chemistry", "Economics"], notes: "Pick 2 from alternatives" },
  { course: "Physics", faculty: "Science", subjects: ["Physics", "Chemistry", "Mathematics"] },
  { course: "Chemistry", faculty: "Science", subjects: ["Chemistry", "Mathematics"], alternatives: ["Physics", "Biology"] },
  { course: "Biology", faculty: "Science", subjects: ["Biology", "Chemistry"], alternatives: ["Physics", "Mathematics"] },
  { course: "Microbiology", faculty: "Science", subjects: ["Biology", "Chemistry"], alternatives: ["Physics", "Mathematics"] },
  { course: "Biochemistry", faculty: "Science", subjects: ["Biology", "Chemistry"], alternatives: ["Physics", "Mathematics"] },
  { course: "Industrial Chemistry", faculty: "Science", subjects: ["Chemistry", "Mathematics", "Physics"] },
  { course: "Statistics", faculty: "Science", subjects: ["Mathematics"], alternatives: ["Physics", "Chemistry", "Economics", "Geography"], notes: "Pick 2 from alternatives" },
  { course: "Geology", faculty: "Science", subjects: ["Physics", "Chemistry", "Mathematics"] },

  // ─── Social Sciences ───────────────────────────────
  { course: "Accounting", faculty: "Social Sciences", subjects: ["Mathematics", "Economics"], alternatives: ["Government", "Commerce", "Geography"] },
  { course: "Economics", faculty: "Social Sciences", subjects: ["Economics", "Mathematics"], alternatives: ["Government", "Geography", "Commerce"] },
  { course: "Business Administration", faculty: "Social Sciences", subjects: ["Mathematics", "Economics"], alternatives: ["Government", "Geography"] },
  { course: "Banking and Finance", faculty: "Social Sciences", subjects: ["Mathematics", "Economics"], alternatives: ["Government", "Geography"] },
  { course: "Political Science", faculty: "Social Sciences", subjects: ["Government"], alternatives: ["Economics", "History", "Geography"], notes: "Pick 2 from alternatives" },
  { course: "Sociology", faculty: "Social Sciences", subjects: ["Government"], alternatives: ["Economics", "Geography", "Literature in English"], notes: "Pick 2" },
  { course: "Psychology", faculty: "Social Sciences", subjects: [], alternatives: ["Biology", "Chemistry", "Economics", "Government", "Geography", "Mathematics"], notes: "Pick 3 from alternatives" },
  { course: "International Relations", faculty: "Social Sciences", subjects: ["Government"], alternatives: ["Economics", "History", "Geography"], notes: "Pick 2" },
  { course: "Mass Communication", faculty: "Social Sciences", subjects: ["Literature in English"], alternatives: ["Government", "Economics", "CRS", "History"], notes: "Pick 2" },
  { course: "Public Administration", faculty: "Social Sciences", subjects: ["Government"], alternatives: ["Economics", "History", "Geography"], notes: "Pick 2" },

  // ─── Law ───────────────────────────────────────────
  { course: "Law", faculty: "Law", subjects: [], alternatives: ["Literature in English", "Government", "CRS", "IRS", "History", "Economics"], notes: "Pick 3 from Arts or Social Science subjects" },

  // ─── Arts & Humanities ─────────────────────────────
  { course: "English and Literary Studies", faculty: "Arts", subjects: ["Literature in English"], alternatives: ["Government", "CRS", "History", "French"], notes: "Pick 2 from Arts/Social Sciences" },
  { course: "History and International Studies", faculty: "Arts", subjects: ["History", "Government"], alternatives: ["Economics", "Literature in English"] },
  { course: "French", faculty: "Arts", subjects: ["French"], alternatives: ["Literature in English", "Government", "CRS"], notes: "Pick 2" },
  { course: "Philosophy", faculty: "Arts", subjects: [], alternatives: ["Government", "CRS", "IRS", "History", "Literature in English"], notes: "Pick 3" },
  { course: "Theatre Arts", faculty: "Arts", subjects: ["Literature in English"], alternatives: ["Government", "CRS", "French", "History"], notes: "Pick 2" },
  { course: "Linguistics", faculty: "Arts", subjects: [], alternatives: ["Literature in English", "Government", "CRS", "History", "Yoruba", "Igbo", "Hausa"], notes: "Pick 3" },

  // ─── Education ─────────────────────────────────────
  { course: "Education (Sciences)", faculty: "Education", subjects: [], notes: "Follows base discipline combination — e.g. Education/Physics uses Physics requirements" },
  { course: "Education (Arts)", faculty: "Education", subjects: [], notes: "Follows base discipline combination — e.g. Education/English uses English requirements" },

  // ─── Agriculture ───────────────────────────────────
  { course: "Agriculture", faculty: "Agriculture", subjects: ["Chemistry"], alternatives: ["Biology", "Agricultural Science"], notes: "Pick 1 Bio/Agric + Physics or Mathematics" },
  { course: "Animal Science", faculty: "Agriculture", subjects: ["Chemistry"], alternatives: ["Biology", "Agricultural Science"], notes: "Plus Physics or Mathematics" },
  { course: "Crop Science", faculty: "Agriculture", subjects: ["Chemistry"], alternatives: ["Biology", "Agricultural Science"], notes: "Plus Physics or Mathematics" },
  { course: "Forestry", faculty: "Agriculture", subjects: ["Chemistry"], alternatives: ["Biology", "Agricultural Science"], notes: "Plus Physics or Mathematics" },
  { course: "Fisheries", faculty: "Agriculture", subjects: ["Chemistry"], alternatives: ["Biology", "Agricultural Science"], notes: "Plus Physics or Mathematics" },

  // ─── Environmental Sciences ────────────────────────
  { course: "Architecture", faculty: "Environmental", subjects: ["Mathematics", "Physics"], alternatives: ["Fine Art", "Geography", "Chemistry"] },
  { course: "Estate Management", faculty: "Environmental", subjects: ["Mathematics", "Economics"], alternatives: ["Geography", "Physics"] },
  { course: "Urban and Regional Planning", faculty: "Environmental", subjects: ["Mathematics", "Geography"], alternatives: ["Economics", "Physics"] },
  { course: "Building Technology", faculty: "Environmental", subjects: ["Mathematics", "Physics"], alternatives: ["Chemistry", "Geography"] },
  { course: "Quantity Surveying", faculty: "Environmental", subjects: ["Mathematics", "Physics"], alternatives: ["Chemistry", "Economics"] },
];
