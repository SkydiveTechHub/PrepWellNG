// PrepWell NG — Database Seed
// Run: npx prisma db seed
// Seeds all subjects + curriculum structure for Physics and Mathematics (SS1–SS3)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Subject Definitions ──────────────────────────

const SUBJECTS = [
  { name: "English Language", code: "ENG", trackCategory: "CORE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Mathematics", code: "MTH", trackCategory: "CORE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Civic Education", code: "CVE", trackCategory: "CORE" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Physics", code: "PHY", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Chemistry", code: "CHM", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Biology", code: "BIO", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Further Mathematics", code: "FMT", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Agricultural Science", code: "AGR", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Computer Studies", code: "CMP", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Technical Drawing", code: "TDR", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Geography", code: "GEO", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Health Education", code: "HED", trackCategory: "SCIENCE" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Literature in English", code: "LIT", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Government", code: "GOV", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "History", code: "HIS", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Christian Religious Studies", code: "CRS", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Islamic Studies", code: "IRS", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "French", code: "FRN", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Yoruba", code: "YOR", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Igbo", code: "IGB", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Hausa", code: "HAU", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Fine Art", code: "FNA", trackCategory: "ARTS" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Music", code: "MUS", trackCategory: "ARTS" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Arabic", code: "ARB", trackCategory: "ARTS" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Economics", code: "ECO", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Commerce", code: "COM", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Financial Accounting", code: "ACC", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: true, isNeco: true },
  { name: "Marketing", code: "MKT", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Insurance", code: "INS", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Office Practice", code: "OFP", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Store Management", code: "STM", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Business Management", code: "BUM", trackCategory: "COMMERCIAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Data Processing", code: "DTP", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Foods and Nutrition", code: "FNT", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Home Management", code: "HMG", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: true },
  { name: "Catering", code: "CAT", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Textiles", code: "TXT", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Tourism", code: "TRM", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Building Construction", code: "BLD", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Woodwork", code: "WDW", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Welding", code: "WLD", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Auto Mechanical Work", code: "AMW", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Basic Electricity", code: "BEL", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
  { name: "Book Keeping", code: "BKP", trackCategory: "VOCATIONAL" as const, isWaec: true, isJamb: false, isNeco: false },
];

// ─── Physics Curriculum (SS1–SS3) ─────────────────

type TopicDef = { title: string; estimatedMinutes: number; waecWeight: number; jambWeight: number };
type TermTopics = { classLevel: "SS1" | "SS2" | "SS3"; term: "FIRST" | "SECOND" | "THIRD"; topics: TopicDef[] };

const PHYSICS_CURRICULUM: TermTopics[] = [
  // SS1
  { classLevel: "SS1", term: "FIRST", topics: [
    { title: "Introduction to Physics", estimatedMinutes: 30, waecWeight: 0.2, jambWeight: 0.1 },
    { title: "Measurement and Units", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.6 },
    { title: "Scalar and Vector Quantities", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.5 },
    { title: "Distance, Displacement, Speed, Velocity and Acceleration", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Equations of Motion", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Motion Under Gravity", estimatedMinutes: 45, waecWeight: 0.7, jambWeight: 0.7 },
  ]},
  { classLevel: "SS1", term: "SECOND", topics: [
    { title: "Position, Distance and Displacement", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.4 },
    { title: "Force", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Friction", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.5 },
    { title: "Viscosity and Terminal Velocity", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.3 },
    { title: "Simple Machines", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.6 },
    { title: "Work, Energy and Power", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
  ]},
  { classLevel: "SS1", term: "THIRD", topics: [
    { title: "Pressure", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.6 },
    { title: "Density and Relative Density", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.5 },
    { title: "Elasticity: Hooke's Law", estimatedMinutes: 45, waecWeight: 0.7, jambWeight: 0.6 },
    { title: "Temperature and Thermometers", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.4 },
    { title: "Heat Energy and Heat Transfer", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.7 },
    { title: "Linear and Volume Expansivity", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.5 },
  ]},
  // SS2
  { classLevel: "SS2", term: "FIRST", topics: [
    { title: "Specific Heat Capacity and Latent Heat", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.7 },
    { title: "Vapour Pressure and Humidity", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.4 },
    { title: "Gas Laws", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Wave Motion and Types of Waves", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Properties of Waves", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Sound Waves", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
  ]},
  { classLevel: "SS2", term: "SECOND", topics: [
    { title: "Light: Reflection at Plane and Curved Surfaces", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Refraction of Light", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Optical Instruments", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.4 },
    { title: "Dispersion of Light and Electromagnetic Spectrum", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.6 },
    { title: "Electrostatics: Electric Charges and Fields", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Capacitors and Capacitance", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.6 },
  ]},
  { classLevel: "SS2", term: "THIRD", topics: [
    { title: "Current Electricity: Ohm's Law", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Electrical Circuits: Series and Parallel", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Electrical Energy and Power", estimatedMinutes: 45, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Magnets and Magnetic Fields", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.5 },
    { title: "Electromagnetic Induction", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.7 },
    { title: "Alternating Current Circuits", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.5 },
  ]},
  // SS3
  { classLevel: "SS3", term: "FIRST", topics: [
    { title: "Electromagnetic Waves", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.6 },
    { title: "Atomic Structure and Radioactivity", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Nuclear Reactions: Fission and Fusion", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.5 },
    { title: "Photoelectric Effect", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Wave-Particle Duality", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.5 },
    { title: "Electronics: Semiconductors and Logic Gates", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.6 },
  ]},
  { classLevel: "SS3", term: "SECOND", topics: [
    { title: "Revision: Mechanics", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
    { title: "Revision: Waves and Optics", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
    { title: "Revision: Electricity and Magnetism", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
    { title: "Past Question Drill", estimatedMinutes: 120, waecWeight: 1.0, jambWeight: 1.0 },
  ]},
  { classLevel: "SS3", term: "THIRD", topics: [
    { title: "Mock WAEC Practice", estimatedMinutes: 150, waecWeight: 1.0, jambWeight: 0.5 },
    { title: "JAMB CBT Simulation", estimatedMinutes: 120, waecWeight: 0.5, jambWeight: 1.0 },
    { title: "Final Revision and Exam Strategy", estimatedMinutes: 60, waecWeight: 1.0, jambWeight: 1.0 },
  ]},
];

// ─── Mathematics Curriculum (SS1–SS3) ─────────────

const MATHEMATICS_CURRICULUM: TermTopics[] = [
  // SS1
  { classLevel: "SS1", term: "FIRST", topics: [
    { title: "Number Bases", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.6 },
    { title: "Modular Arithmetic", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.4 },
    { title: "Indices and Logarithms", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Sets", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Simple Equations and Inequalities", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Algebraic Expressions: Factorization", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
  ]},
  { classLevel: "SS1", term: "SECOND", topics: [
    { title: "Quadratic Equations", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Surds", estimatedMinutes: 45, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Logical Reasoning", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.3 },
    { title: "Plane Geometry: Angles and Polygons", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.6 },
    { title: "Circle Theorems", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Construction and Loci", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.3 },
  ]},
  { classLevel: "SS1", term: "THIRD", topics: [
    { title: "Trigonometric Ratios", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Mensuration: Perimeter, Area", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Mensuration: Volume and Surface Area", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Statistics: Mean, Median, Mode", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Probability", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
  ]},
  // SS2
  { classLevel: "SS2", term: "FIRST", topics: [
    { title: "Simultaneous Linear and Quadratic Equations", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Variation: Direct, Inverse, Joint, Partial", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Polynomial Functions", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Matrices and Determinants", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Arithmetic and Geometric Progressions", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
  ]},
  { classLevel: "SS2", term: "SECOND", topics: [
    { title: "Coordinate Geometry: Straight Lines", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Coordinate Geometry: Circles and Curves", estimatedMinutes: 45, waecWeight: 0.6, jambWeight: 0.5 },
    { title: "Trigonometric Functions and Graphs", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Sine and Cosine Rules", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Bearings and Distances", estimatedMinutes: 45, waecWeight: 0.7, jambWeight: 0.6 },
  ]},
  { classLevel: "SS2", term: "THIRD", topics: [
    { title: "Statistics: Grouped Data and Standard Deviation", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Probability: Compound Events", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Introduction to Calculus: Differentiation", estimatedMinutes: 60, waecWeight: 0.9, jambWeight: 0.9 },
    { title: "Application of Differentiation", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
    { title: "Integration", estimatedMinutes: 60, waecWeight: 0.8, jambWeight: 0.8 },
  ]},
  // SS3
  { classLevel: "SS3", term: "FIRST", topics: [
    { title: "Application of Integration", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Vectors in Two Dimensions", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
    { title: "Transformation Geometry", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.4 },
    { title: "Linear Inequalities and Linear Programming", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.5 },
    { title: "Binary Operations", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.5 },
  ]},
  { classLevel: "SS3", term: "SECOND", topics: [
    { title: "Revision: Algebra and Number", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
    { title: "Revision: Geometry and Trigonometry", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
    { title: "Revision: Statistics, Probability, Calculus", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
    { title: "Past Question Drill", estimatedMinutes: 120, waecWeight: 1.0, jambWeight: 1.0 },
  ]},
  { classLevel: "SS3", term: "THIRD", topics: [
    { title: "Mock WAEC Practice", estimatedMinutes: 150, waecWeight: 1.0, jambWeight: 0.5 },
    { title: "JAMB CBT Simulation", estimatedMinutes: 120, waecWeight: 0.5, jambWeight: 1.0 },
    { title: "Final Revision and Exam Strategy", estimatedMinutes: 60, waecWeight: 1.0, jambWeight: 1.0 },
  ]},
];

// ─── Biology Curriculum (SS1–SS3) ─────────────────

// Titles here must slugify to the topicSlug values used by the question files
// in data/questions/jamb-biology-*.json, or the importer can't resolve them.
//
// jambWeight is derived from the real distribution across those 1114 questions,
// normalised against the most-examined topic (Ecology, 107 questions).
// waecWeight mirrors it: WAEC and JAMB cover the same SSCE Biology syllabus, but
// no WAEC Biology corpus has been imported yet, so treat it as an estimate.
const BIOLOGY_CURRICULUM: TermTopics[] = [
  // SS1 — organisation of life, then nutrition
  { classLevel: "SS1", term: "FIRST", topics: [
    { title: "Classification of Living Things", estimatedMinutes: 60, waecWeight: 0.5, jambWeight: 0.5 },
    { title: "Cell Structure and Organization", estimatedMinutes: 60, waecWeight: 0.7, jambWeight: 0.7 },
  ]},
  { classLevel: "SS1", term: "SECOND", topics: [
    { title: "Cell Division", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
    { title: "Nutrition in Plants", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.6 },
  ]},
  { classLevel: "SS1", term: "THIRD", topics: [
    { title: "Nutrition in Animals", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.6 },
    { title: "Transport System in Plants", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
  ]},
  // SS2 — transport, gas exchange, and the control systems
  { classLevel: "SS2", term: "FIRST", topics: [
    { title: "Transport System in Animals", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.6 },
    { title: "Respiration", estimatedMinutes: 60, waecWeight: 0.4, jambWeight: 0.4 },
  ]},
  { classLevel: "SS2", term: "SECOND", topics: [
    { title: "Excretion", estimatedMinutes: 45, waecWeight: 0.5, jambWeight: 0.5 },
    { title: "Skeletal and Muscular Systems", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
  ]},
  { classLevel: "SS2", term: "THIRD", topics: [
    { title: "Nervous System and Sense Organs", estimatedMinutes: 60, waecWeight: 0.5, jambWeight: 0.5 },
    { title: "Endocrine System", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
  ]},
  // SS3 — continuity of life, then ecology and evolution
  { classLevel: "SS3", term: "FIRST", topics: [
    { title: "Homeostasis and Coordination", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
    { title: "Reproduction in Plants", estimatedMinutes: 60, waecWeight: 0.5, jambWeight: 0.5 },
  ]},
  { classLevel: "SS3", term: "SECOND", topics: [
    { title: "Reproduction in Animals", estimatedMinutes: 60, waecWeight: 0.4, jambWeight: 0.4 },
    { title: "Growth and Development", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
    { title: "Genetics and Heredity", estimatedMinutes: 90, waecWeight: 0.7, jambWeight: 0.7 },
  ]},
  { classLevel: "SS3", term: "THIRD", topics: [
    { title: "Evolution", estimatedMinutes: 45, waecWeight: 0.4, jambWeight: 0.4 },
    { title: "Microorganisms and Disease", estimatedMinutes: 60, waecWeight: 0.6, jambWeight: 0.6 },
    { title: "Ecology", estimatedMinutes: 90, waecWeight: 1.0, jambWeight: 1.0 },
  ]},
];

// ─── Seed Function ────────────────────────────────

async function seedSubjects() {
  console.log("Seeding subjects...");

  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({
      where: { code: subject.code },
      update: {},
      create: {
        name: subject.name,
        slug: slugify(subject.name),
        code: subject.code,
        description: `${subject.name} for Nigerian Senior Secondary School (SS1–SS3). Covers the WAEC and JAMB syllabus.`,
        trackCategory: subject.trackCategory,
        isWaec: subject.isWaec,
        isJamb: subject.isJamb,
        isNeco: subject.isNeco,
      },
    });
  }

  console.log(`  ✓ ${SUBJECTS.length} subjects seeded`);
}

async function seedCurriculum(
  subjectCode: string,
  curriculum: TermTopics[]
) {
  const subject = await prisma.subject.findUnique({
    where: { code: subjectCode },
  });
  if (!subject) throw new Error(`Subject ${subjectCode} not found`);

  console.log(`Seeding curriculum for ${subject.name}...`);
  let topicCount = 0;
  let globalOrder = 0;

  for (const termData of curriculum) {
    // Create or find the curriculum level
    const level = await prisma.curriculumLevel.upsert({
      where: {
        subjectId_classLevel_term: {
          subjectId: subject.id,
          classLevel: termData.classLevel,
          term: termData.term,
        },
      },
      update: {},
      create: {
        subjectId: subject.id,
        classLevel: termData.classLevel,
        term: termData.term,
        description: `${subject.name} — ${termData.classLevel} ${termData.term} Term`,
      },
    });

    for (const topicDef of termData.topics) {
      await prisma.topic.upsert({
        where: {
          subjectId_slug: {
            subjectId: subject.id,
            slug: slugify(topicDef.title),
          },
        },
        update: {},
        create: {
          subjectId: subject.id,
          curriculumLevelId: level.id,
          title: topicDef.title,
          slug: slugify(topicDef.title),
          description: `${topicDef.title} — ${subject.name} ${termData.classLevel} ${termData.term} Term`,
          orderIndex: globalOrder++,
          estimatedMinutes: topicDef.estimatedMinutes,
          waecWeight: topicDef.waecWeight,
          jambWeight: topicDef.jambWeight,
        },
      });
      topicCount++;
    }
  }

  console.log(`  ✓ ${topicCount} topics seeded for ${subject.name}`);
}

async function seedAchievements() {
  console.log("Seeding achievements...");

  const achievements = [
    { title: "First Step", description: "Complete your first lesson", criteriaType: "lessons_completed", criteriaValue: 1 },
    { title: "Question Starter", description: "Answer your first 10 questions", criteriaType: "questions_answered", criteriaValue: 10 },
    { title: "Century", description: "Answer 100 questions", criteriaType: "questions_answered", criteriaValue: 100 },
    { title: "Thousand Club", description: "Answer 1,000 questions", criteriaType: "questions_answered", criteriaValue: 1000 },
    { title: "3-Day Streak", description: "Study for 3 consecutive days", criteriaType: "streak_days", criteriaValue: 3 },
    { title: "7-Day Streak", description: "Study for 7 consecutive days", criteriaType: "streak_days", criteriaValue: 7 },
    { title: "30-Day Streak", description: "Study for 30 consecutive days", criteriaType: "streak_days", criteriaValue: 30 },
    { title: "Sharp Shooter", description: "Score 100% on a quiz", criteriaType: "perfect_score", criteriaValue: 1 },
    { title: "Subject Master", description: "Reach 'Strong' mastery in any subject", criteriaType: "subject_mastery", criteriaValue: 1 },
    { title: "Mock Champion", description: "Score above 70% on a full mock exam", criteriaType: "mock_score_70", criteriaValue: 1 },
  ];

  for (const ach of achievements) {
    await prisma.achievement.upsert({
      where: { title: ach.title },
      update: {},
      create: ach,
    });
  }

  console.log(`  ✓ ${achievements.length} achievements seeded`);
}

// ─── Subject Resources ────────────────────────────

type ResourceDef = {
  title: string;
  description: string;
  resourceType: string;
  url: string;
  author: string;
  isFree: boolean;
  orderIndex: number;
};

const SUBJECT_RESOURCES: Record<string, ResourceDef[]> = {
  PHY: [
    { title: "New School Physics for Senior Secondary Schools", description: "Comprehensive physics textbook covering SS1–SS3 syllabus with worked examples and practice questions.", resourceType: "textbook", url: "#", author: "M. W. Anyakoha", isFree: false, orderIndex: 0 },
    { title: "WAEC Physics Past Questions & Answers", description: "Compilation of past WAEC physics questions with detailed solutions from 2010–2024.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "JAMB Physics Key Points", description: "Concise revision notes covering high-yield JAMB physics topics with formula summaries.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
    { title: "Physics Practical Manual", description: "Step-by-step guide to physics practical experiments with diagrams and expected results.", resourceType: "textbook", url: "#", author: "NECO", isFree: false, orderIndex: 3 },
    { title: "Physics Formula Sheet", description: "Quick reference sheet of all essential physics formulas for WAEC and JAMB.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 4 },
  ],
  MTH: [
    { title: "New General Mathematics for Senior Secondary Schools", description: "Complete mathematics coursebook aligned with the Nigerian national curriculum.", resourceType: "textbook", url: "#", author: "M. F. Macrae et al.", isFree: false, orderIndex: 0 },
    { title: "New General Mathematics SS1", description: "Full PDF textbook for Mathematics SS1 — Teacher's Guide.", resourceType: "textbook", url: "/resources/mathematics/new-general-mathematics-ss1.pdf", author: "Pearson Education", isFree: true, orderIndex: 1 },
    { title: "New General Mathematics SS2", description: "Full PDF textbook for Mathematics SS2 — Teacher's Guide.", resourceType: "textbook", url: "/resources/mathematics/new-general-mathematics-ss2.pdf", author: "Pearson Education", isFree: true, orderIndex: 2 },
    { title: "New General Mathematics SS3", description: "Full PDF textbook for Mathematics SS3 — Teacher's Guide.", resourceType: "textbook", url: "/resources/mathematics/new-general-mathematics-ss3.pdf", author: "Pearson Education", isFree: true, orderIndex: 3 },
    { title: "JAMB Mathematics Past Questions", description: "Past JAMB mathematics questions organised by topic with answer explanations.", resourceType: "past_paper", url: "#", author: "JAMB", isFree: true, orderIndex: 4 },
    { title: "Mathematics Formula Handbook", description: "All key mathematical formulas, theorems, and identities for SS1–SS3.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 5 },
    { title: "Further Mathematics Textbook", description: "Advanced mathematics topics including calculus, vectors, and statistics.", resourceType: "textbook", url: "#", author: "P. N. Okeke", isFree: false, orderIndex: 6 },
    { title: "WAEC Mathematics Objective Tests", description: "500+ objective questions covering the entire WAEC mathematics syllabus.", resourceType: "worksheet", url: "#", author: "WAEC", isFree: true, orderIndex: 7 },
  ],
  ENG: [
    { title: "New Oxford English for Senior Secondary Schools", description: "Comprehensive English language textbook covering comprehension, grammar, and summary writing.", resourceType: "textbook", url: "#", author: "Oxford University Press", isFree: false, orderIndex: 0 },
    { title: "WAEC English Language Past Questions", description: "Past WAEC English Language papers including objective, theory, and oral English sections.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "Essay Writing Guide", description: "Step-by-step guide to writing excellent essays for WAEC and JAMB English.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
    { title: "JAMB Use of English Key Points", description: "Strategic revision notes for JAMB Use of English with comprehension strategies.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 3 },
    { title: "Oral English Practice Audio", description: "Audio recordings for oral English vowel and consonant sound practice.", resourceType: "video", url: "#", author: "PrepWell", isFree: true, orderIndex: 4 },
  ],
  CHM: [
    { title: "New School Chemistry for Senior Secondary Schools", description: "Complete chemistry textbook with practical experiments and theoretical explanations.", resourceType: "textbook", url: "#", author: "O. Y. Ababio", isFree: false, orderIndex: 0 },
    { title: "JAMB Chemistry Past Questions", description: "Past JAMB chemistry questions with detailed step-by-step solutions.", resourceType: "past_paper", url: "#", author: "JAMB", isFree: true, orderIndex: 1 },
    { title: "Chemistry Practical Handbook", description: "Guide to qualitative and quantitative analysis for WAEC chemistry practical.", resourceType: "textbook", url: "#", author: "NECO", isFree: false, orderIndex: 2 },
    { title: "Organic Chemistry Reaction Summary", description: "Chart of all organic chemistry reactions, functional groups, and mechanisms.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 3 },
    { title: "Periodic Table & Data Booklet", description: "Printable periodic table with atomic properties and standard electrode potentials.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 4 },
  ],
  BIO: [
    { title: "New School Biology for Senior Secondary Schools", description: "Comprehensive biology textbook covering all SS1–SS3 topics with diagrams.", resourceType: "textbook", url: "#", author: "P. N. Okonkwo", isFree: false, orderIndex: 0 },
    { title: "WAEC Biology Past Questions & Answers", description: "Past WAEC biology questions with model answers and marking scheme insights.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "Biology Practical Drawing Guide", description: "Guide to drawing and labelling biological specimens for practical exams.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
    { title: "JAMB Biology Key Topics", description: "Topic-by-topic revision notes for JAMB biology with frequently tested concepts.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 3 },
    { title: "Ecology Field Study Notes", description: "Field study methodology and ecological concepts for practical exams.", resourceType: "textbook", url: "#", author: "N. O. Adedipe", isFree: false, orderIndex: 4 },
  ],
  ECO: [
    { title: "Comprehensive Economics for Senior Secondary Schools", description: "Full economics textbook covering micro and macroeconomics for WAEC and JAMB.", resourceType: "textbook", url: "#", author: "O. A. Lawal", isFree: false, orderIndex: 0 },
    { title: "WAEC Economics Past Questions", description: "Past WAEC economics questions with answers and examiner comments.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "Economics Graph & Diagram Guide", description: "Visual guide to all essential economics graphs and their interpretations.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
    { title: "JAMB Economics Key Points", description: "Concise revision notes for JAMB economics with key definitions and theories.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 3 },
  ],
  CVE: [
    { title: "Civic Education for Senior Secondary Schools", description: "Textbook covering Nigerian constitution, human rights, and civic responsibilities.", resourceType: "textbook", url: "#", author: "F. A. Adigwe", isFree: false, orderIndex: 0 },
    { title: "WAEC Civic Education Past Questions", description: "Past WAEC civic education questions with model answers.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
  ],
  GOV: [
    { title: "Comprehensive Government for Senior Secondary Schools", description: "In-depth coverage of Nigerian government systems, constitutions, and political history.", resourceType: "textbook", url: "#", author: "O. A. Olusola", isFree: false, orderIndex: 0 },
    { title: "WAEC Government Past Questions", description: "Past WAEC government questions organised by topic with marking scheme.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "Nigerian Constitution Summary", description: "Simplified summary of the 1999 Nigerian Constitution key provisions.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
  ],
  LIT: [
    { title: "Exam Focus: Literature in English", description: "Study guide covering all WAEC and JAMB recommended texts with analysis.", resourceType: "textbook", url: "#", author: "O. O. Ogunyemi", isFree: false, orderIndex: 0 },
    { title: "WAEC Literature Past Questions", description: "Past questions on prose, poetry, and drama with model essay answers.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "Poetic Devices & Literary Terms Handbook", description: "Complete glossary of literary terms and poetic devices with examples.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
  ],
  ACC: [
    { title: "Financial Accounting for Senior Secondary Schools", description: "Comprehensive accounting textbook covering principles, ledgers, and final accounts.", resourceType: "textbook", url: "#", author: "F. O. Ogun", isFree: false, orderIndex: 0 },
    { title: "WAEC Accounting Past Questions", description: "Past WAEC financial accounting questions with detailed solutions.", resourceType: "past_paper", url: "#", author: "WAEC", isFree: true, orderIndex: 1 },
    { title: "Accounting Equation & Format Guide", description: "Quick reference for all accounting formats, equations, and journal entries.", resourceType: "pdf", url: "#", author: "PrepWell", isFree: true, orderIndex: 2 },
  ],
};

async function seedSubjectResources() {
  console.log("Seeding subject resources...");
  let count = 0;

  for (const [code, resources] of Object.entries(SUBJECT_RESOURCES)) {
    const subject = await prisma.subject.findUnique({ where: { code } });
    if (!subject) {
      console.warn(`  ⚠ Subject ${code} not found, skipping resources`);
      continue;
    }

    for (const r of resources) {
      await prisma.subjectResource.upsert({
        where: { id: `${subject.id}-${slugify(r.title)}` },
        update: {},
        create: {
          id: `${subject.id}-${slugify(r.title)}`,
          subjectId: subject.id,
          title: r.title,
          description: r.description,
          resourceType: r.resourceType,
          url: r.url,
          author: r.author,
          isFree: r.isFree,
          orderIndex: r.orderIndex,
        },
      });
      count++;
    }
  }

  console.log(`  ✓ ${count} resources seeded`);
}

// ─── Topics for every subject (SS1–SS3) ────────────
// Topic titles are slugified at seed time; the Commerce titles below are
// chosen to produce exactly the topicSlug values used in the question files.

type ClassTopics = Record<"SS1" | "SS2" | "SS3", string[]>;

const SUBJECT_TOPICS: Record<string, ClassTopics> = {
  ENG: {
    SS1: ["Comprehension", "Summary Writing", "Essay Writing: Narrative", "Oral English: Vowel Sounds", "Parts of Speech", "Tenses and Aspects"],
    SS2: ["Essay Writing: Descriptive", "Comprehension Practice", "Summary Techniques", "Oral English: Consonant Sounds", "Active and Passive Voice", "Clauses and Sentence Structure", "Idioms and Figures of Speech"],
    SS3: ["Essay Writing: Argumentative", "Speech Work and Stress Patterns", "Grammar and Usage", "Comprehension Drills", "Summary Drills", "Past Question Practice"],
  },
  CVE: {
    SS1: ["Citizenship", "The Nigerian Constitution", "Rule of Law", "Fundamental Human Rights", "Democracy and National Development"],
    SS2: ["Civic Responsibilities", "Government and Governance", "National Consciousness", "Values and Integrity", "Electoral Processes"],
    SS3: ["Public Service", "Civil Society Organizations", "International Organizations", "National Security", "Examination Ethics"],
  },
  CHM: {
    SS1: ["Introduction to Chemistry", "Separation Techniques", "Particulate Nature of Matter", "Atomic Structure", "The Periodic Table", "Chemical Bonding"],
    SS2: ["Chemical Reactions and Equations", "Acids, Bases and Salts", "Oxidation and Reduction", "Electrolysis", "Organic Chemistry: Hydrocarbons", "Rates of Chemical Reactions"],
    SS3: ["Organic Chemistry: Alkanols and Alkanoic Acids", "Fats, Oils and Soaps", "Qualitative Analysis", "Quantitative Analysis", "Nuclear Chemistry", "Industrial Chemistry"],
  },
  FMT: {
    SS1: ["Set Theory and Logic", "Surds and Indices", "Polynomials", "Trigonometric Ratios and Identities", "Coordinate Geometry"],
    SS2: ["Differentiation", "Application of Differentiation", "Integration", "Vectors", "Mechanics: Force and Equilibrium", "Statistics and Probability"],
    SS3: ["Matrices and Determinants", "Complex Numbers", "Differential Equations", "Mechanics: Motion", "Revision and Past Questions"],
  },
  AGR: {
    SS1: ["Introduction to Agriculture", "Farm Tools and Equipment", "Soil Science", "Crop Production", "Animal Production"],
    SS2: ["Agricultural Ecology", "Farm Management", "Agricultural Economics", "Livestock Management", "Fishery and Forestry"],
    SS3: ["Agricultural Extension", "Modern Agricultural Systems", "Agricultural Marketing", "Agricultural Records and Book Keeping"],
  },
  CMP: {
    SS1: ["Fundamentals of Computer", "History of Computing", "Computer Hardware", "Computer Software", "Data and Information"],
    SS2: ["Computer Networks", "Internet and World Wide Web", "Word Processing", "Spreadsheets", "Databases"],
    SS3: ["Programming Fundamentals", "System Development", "Computer Ethics and Safety", "Emerging Technologies"],
  },
  TDR: {
    SS1: ["Introduction to Technical Drawing", "Geometric Construction", "Lines and Lettering", "Plane Figures"],
    SS2: ["Orthographic Projection", "Isometric Drawing", "Oblique Drawing", "Dimensioning"],
    SS3: ["Building Drawing", "Mechanical Drawing", "Pictorial Sketching", "Production Drawing"],
  },
  GEO: {
    SS1: ["Introduction to Geography", "The Earth as a Planet", "Weather and Climate", "Landforms", "Map Reading"],
    SS2: ["World Population", "Agriculture", "Transportation", "Industrialization", "Settlement"],
    SS3: ["Nigeria: Physical and Human Geography", "Economic Geography", "Environmental Problems", "Regional Geography"],
  },
  HED: {
    SS1: ["Introduction to Health Education", "Personal Hygiene", "Nutrition and Health", "Communicable Diseases"],
    SS2: ["Non-communicable Diseases", "Reproductive Health", "First Aid", "Environmental Health"],
    SS3: ["Community Health", "Health Services", "Drug Abuse", "Family Life Education"],
  },
  LIT: {
    SS1: ["Introduction to Literature", "The Prose", "Poetry", "Drama", "Figures of Speech"],
    SS2: ["African Prose", "Non-African Prose", "African Poetry", "Non-African Poetry", "African Drama", "Non-African Drama"],
    SS3: ["Comprehension of Literary Works", "Essay Writing in Literature", "Literary Appreciation", "Revision and Past Questions"],
  },
  GOV: {
    SS1: ["Introduction to Government", "Basic Concepts of Government", "Constitution and Constitutionalism", "Citizenship", "Rule of Law"],
    SS2: ["Political Parties", "Electoral Systems", "Pressure Groups", "Public Opinion", "Federalism"],
    SS3: ["Nigerian Government and Politics", "International Relations", "Foreign Policy", "Economic Communities"],
  },
  HIS: {
    SS1: ["Introduction to History", "Pre-colonial Nigeria", "The Trans-Atlantic Slave Trade", "The Scramble for Africa"],
    SS2: ["Colonial Rule in Nigeria", "Nationalism", "Independence Movements", "Post-independence Nigeria"],
    SS3: ["The Nigerian Civil War", "Military Rule", "Democratic Transitions", "Contemporary African History"],
  },
  CRS: {
    SS1: ["The Sovereignty of God", "Creation Stories", "Faith and Covenant", "Leadership in Israel"],
    SS2: ["The Life and Teachings of Jesus Christ", "The Sermon on the Mount", "The Parables of Jesus", "The Miracles of Jesus"],
    SS3: ["The Early Church", "The Epistles", "Christian Living", "The Second Coming of Christ"],
  },
  IRS: {
    SS1: ["The Quran: Revelation and Content", "The Hadith: Classification", "Tawhid: Oneness of God", "Prayer and Worship"],
    SS2: ["Islamic Law: Fiqh", "Marriage and Family in Islam", "Morality in Islam", "The Life of Prophet Muhammad"],
    SS3: ["Islamic Economics", "Islamic Civilization", "Contemporary Issues in Islam", "Revision and Past Questions"],
  },
  FRN: {
    SS1: ["Greetings and Introductions", "The Alphabet and Numbers", "Family and School", "Basic Grammar"],
    SS2: ["Daily Activities", "Food and Shopping", "Travel and Transport", "French Literature"],
    SS3: ["Essay Writing in French", "Comprehension in French", "Translation", "Revision and Past Questions"],
  },
  YOR: {
    SS1: ["Introduction to Yoruba Language", "Yoruba Alphabet and Tones", "Greetings and Courtesies", "Basic Grammar"],
    SS2: ["Yoruba Literature: Prose and Poetry", "Yoruba Drama", "Oral Literature", "Culture and Tradition"],
    SS3: ["Essay Writing in Yoruba", "Comprehension", "Proverbs and Idioms", "Revision and Past Questions"],
  },
  IGB: {
    SS1: ["Introduction to Igbo Language", "Igbo Alphabet and Tones", "Greetings and Courtesies", "Basic Grammar"],
    SS2: ["Igbo Literature: Prose and Poetry", "Igbo Drama", "Oral Literature", "Culture and Tradition"],
    SS3: ["Essay Writing in Igbo", "Comprehension", "Proverbs and Idioms", "Revision and Past Questions"],
  },
  HAU: {
    SS1: ["Introduction to Hausa Language", "Hausa Alphabet and Tones", "Greetings and Courtesies", "Basic Grammar"],
    SS2: ["Hausa Literature: Prose and Poetry", "Hausa Drama", "Oral Literature", "Culture and Tradition"],
    SS3: ["Essay Writing in Hausa", "Comprehension", "Proverbs and Idioms", "Revision and Past Questions"],
  },
  FNA: {
    SS1: ["Introduction to Fine Art", "Drawing", "Painting", "Colour Theory"],
    SS2: ["Design", "Sculpture", "Art History", "Crafts"],
    SS3: ["Creative Composition", "Art Appreciation", "Portfolio Development", "Revision and Past Questions"],
  },
  MUS: {
    SS1: ["Introduction to Music", "Musical Notation", "Rhythm and Pitch", "Musical Instruments"],
    SS2: ["Music Theory", "Harmony", "African Music", "Western Music"],
    SS3: ["Composition", "Music History", "Performance Practice", "Revision and Past Questions"],
  },
  ARB: {
    SS1: ["Arabic Alphabet", "Basic Vocabulary", "Arabic Grammar", "Reading and Comprehension"],
    SS2: ["Arabic Literature", "Translation", "Essay Writing"],
    SS3: ["Advanced Arabic", "Comprehension", "Revision and Past Questions"],
  },
  ECO: {
    SS1: ["Introduction to Economics", "Basic Economic Concepts", "Demand and Supply", "Production", "Market Structures"],
    SS2: ["Money and Banking", "Financial Institutions", "National Income", "Inflation", "International Trade"],
    SS3: ["Economic Development", "Agriculture and Industry", "Population", "Economic Planning"],
  },
  COM: {
    SS1: ["Introduction to Commerce", "Production", "Trade", "Transportation", "Warehousing", "Communication"],
    SS2: ["Banking and Finance", "Insurance", "Marketing", "Advertising and Sales Promotion", "Stock Exchange", "Business Organizations"],
    SS3: ["Business Environment", "Business Finance", "Business Law", "Management and Organization", "Labour and Trade Unions", "International Trade", "Consumer Protection", "Economic Integration", "Information Technology", "Government and Business", "Accounting Basics"],
  },
  ACC: {
    SS1: ["Introduction to Accounting", "Source Documents", "Books of Accounts", "The Ledger", "Trial Balance"],
    SS2: ["Final Accounts", "Adjustments", "Depreciation", "Control Accounts", "Bank Reconciliation"],
    SS3: ["Partnership Accounts", "Company Accounts", "Manufacturing Accounts", "Interpretation of Accounts", "Public Sector Accounting"],
  },
  MKT: {
    SS1: ["Introduction to Marketing", "The Marketing Concept", "Market Segmentation", "The Marketing Mix"],
    SS2: ["Product Decisions", "Pricing Decisions", "Distribution Decisions", "Promotion Decisions"],
    SS3: ["Consumer Behaviour", "Marketing Research", "Digital Marketing", "Marketing Strategy"],
  },
  INS: {
    SS1: ["Introduction to Insurance", "Principles of Insurance", "Types of Insurance"],
    SS2: ["Insurance Contracts", "Underwriting", "Claims"],
    SS3: ["Marine and Aviation Insurance", "Life Assurance", "Insurance Law and Regulation"],
  },
  OFP: {
    SS1: ["Introduction to Office Practice", "The Office Environment", "Office Equipment", "Office Correspondence"],
    SS2: ["Filing and Records Management", "Communication in the Office", "The Receptionist", "Office Machines"],
    SS3: ["Office Management", "Meetings and Minutes", "The Computerized Office", "Secretarial Duties"],
  },
  STM: {
    SS1: ["Introduction to Store Management", "Store Layout", "Stock Control"],
    SS2: ["Receiving and Issuing Stock", "Store Records", "Storage Methods"],
    SS3: ["Stock Taking", "Store Security", "Store Personnel", "Materials Handling"],
  },
  BUM: {
    SS1: ["Introduction to Business Management", "Management Functions", "Business Ownership"],
    SS2: ["Human Resource Management", "Marketing Management", "Production Management"],
    SS3: ["Financial Management", "Business Communication", "Small Business Management", "Business Ethics"],
  },
  DTP: {
    SS1: ["Introduction to Data Processing", "History of Computing", "Computer Hardware", "Computer Software", "Data and Information"],
    SS2: ["Data Management", "Word Processing", "Spreadsheets", "Presentation Software", "Databases"],
    SS3: ["Networking", "The Internet", "Programming Basics", "Data Processing Systems"],
  },
  FNT: {
    SS1: ["Introduction to Foods and Nutrition", "Food Groups", "Nutrients", "Food Hygiene"],
    SS2: ["Meal Planning", "Food Preparation", "Food Preservation", "Kitchen Management"],
    SS3: ["Dietetics", "Nutrition Across the Lifespan", "Nigerian Foods", "Food Technology"],
  },
  HMG: {
    SS1: ["Introduction to Home Management", "The Family", "The Home", "Household Resources"],
    SS2: ["Housing", "Home Furnishing", "Household Equipment", "Family Finance"],
    SS3: ["Home Maintenance", "Interior Decoration", "Consumer Education", "Home Management Projects"],
  },
  CAT: {
    SS1: ["Introduction to Catering", "Catering Establishments", "Food Service"],
    SS2: ["Kitchen Operations", "Menu Planning", "Food Preparation for Catering"],
    SS3: ["Catering Management", "Event Catering", "Catering Hygiene and Safety"],
  },
  TXT: {
    SS1: ["Introduction to Textiles", "Textile Fibres", "Fabric Construction"],
    SS2: ["Textile Finishing", "Dyeing and Printing", "Clothing Construction"],
    SS3: ["Textile Care", "Garment Design", "The Textile Industry in Nigeria"],
  },
  TRM: {
    SS1: ["Introduction to Tourism", "The Tourism Industry", "Tourist Attractions"],
    SS2: ["Tourism Products", "Travel and Transport in Tourism", "Hospitality"],
    SS3: ["Tourism Marketing", "Tourism Management", "Sustainable Tourism"],
  },
  BLD: {
    SS1: ["Introduction to Building Construction", "Building Materials", "Site Preparation"],
    SS2: ["Foundations", "Walls", "Concrete Work"],
    SS3: ["Roofing", "Finishing Works", "Building Services", "Building Inspection"],
  },
  WDW: {
    SS1: ["Introduction to Woodwork", "Wood Materials", "Woodworking Tools"],
    SS2: ["Woodwork Processes", "Wood Joints", "Woodworking Machines"],
    SS3: ["Furniture Construction", "Finishing", "Woodwork Projects"],
  },
  WLD: {
    SS1: ["Introduction to Welding", "Welding Safety", "Welding Tools and Equipment"],
    SS2: ["Arc Welding", "Gas Welding", "Weld Joints"],
    SS3: ["Welding Defects", "Advanced Welding Techniques", "Welding Projects"],
  },
  AMW: {
    SS1: ["Introduction to Auto Mechanics", "Vehicle Components", "Workshop Safety"],
    SS2: ["Engine Systems", "Fuel Systems", "Electrical Systems"],
    SS3: ["Transmission Systems", "Braking Systems", "Vehicle Servicing"],
  },
  BEL: {
    SS1: ["Introduction to Electricity", "Electrical Safety", "Simple Circuits"],
    SS2: ["Ohm's Law", "Series and Parallel Circuits", "Electrical Measurements"],
    SS3: ["Electrical Power", "Wiring Systems", "Electric Motors"],
  },
  BKP: {
    SS1: ["Introduction to Book Keeping", "Source Documents", "The Cash Book"],
    SS2: ["Ledger Accounts", "Trial Balance", "Petty Cash"],
    SS3: ["Final Accounts", "Control Accounts", "Correction of Errors"],
  },
};

/** Distribute a subject's per-class topic list across the three terms. */
function buildCurriculum(code: string, byClass: ClassTopics): TermTopics[] {
  const terms = ["FIRST", "SECOND", "THIRD"] as const;
  const out: TermTopics[] = [];

  for (const [cls, titles] of Object.entries(byClass)) {
    const perTerm = Math.max(1, Math.ceil(titles.length / terms.length));
    for (let t = 0; t < terms.length; t++) {
      const slice = titles.slice(t * perTerm, (t + 1) * perTerm);
      if (slice.length === 0) continue;
      out.push({
        classLevel: cls as "SS1" | "SS2" | "SS3",
        term: terms[t],
        topics: slice.map((title) => ({
          title,
          estimatedMinutes: 45,
          waecWeight: 0.5,
          jambWeight: 0.5,
        })),
      });
    }
  }

  return out;
}

async function main() {
  console.log("🌱 Starting PrepWell NG database seed...\n");

  await seedSubjects();
  await seedCurriculum("PHY", PHYSICS_CURRICULUM);
  await seedCurriculum("MTH", MATHEMATICS_CURRICULUM);
  await seedCurriculum("BIO", BIOLOGY_CURRICULUM);

  for (const [code, byClass] of Object.entries(SUBJECT_TOPICS)) {
    await seedCurriculum(code, buildCurriculum(code, byClass));
  }

  await seedAchievements();
  await seedSubjectResources();

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
