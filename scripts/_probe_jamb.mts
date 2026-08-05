import { PrismaClient } from "@prisma/client";
import { getJambSubjectOptions, eligibleYearsFor, coverageForYear } from "../src/lib/jamb-availability";
import { coverageMessage, JAMB_SPEC } from "../src/lib/jamb-cbt";

const prisma = new PrismaClient();
// The lib modules import the shared singleton, so this just exercises them.
const { english, englishYears, subjects } = await getJambSubjectOptions();

console.log("English subject:", english ? `${english.code} ${english.name}` : "MISSING");
console.log(`English years with >= ${JAMB_SPEC.englishQuestions} questions:`, englishYears.length ? englishYears : "(none)");

const withYears = subjects.filter((s) => s.eligibleYears.length > 0);
console.log(`\nSubjects with >= ${JAMB_SPEC.otherQuestions} questions in some year: ${withYears.length}/${subjects.length}`);
for (const s of withYears.slice(0, 6)) {
  console.log(`  ${s.code.padEnd(4)} ${s.eligibleYears.length} years  e.g. ${s.eligibleYears.slice(0, 5).join(", ")}`);
}

if (english && withYears.length >= 3) {
  const trio = withYears.slice(0, 3);
  const years = await eligibleYearsFor(english.id, trio.map((s) => s.id));
  console.log(`\nSittable years for ${trio.map((s) => s.code).join("+")} + ENG:`, years.length ? years : "(none)");
}

// What a student would actually be told for a plausible pick.
if (english) {
  const bio = subjects.find((s) => s.code === "BIO");
  const com = subjects.find((s) => s.code === "COM");
  const phy = subjects.find((s) => s.code === "PHY");
  if (bio && com && phy) {
    const report = await coverageForYear([english, bio, com, phy], 2004);
    console.log("\nCoverage for 2004 (ENG+BIO+COM+PHY):");
    for (const r of report.requirements) {
      console.log(`  ${r.subjectCode.padEnd(4)} ${r.available}/${r.required} ${r.available >= r.required ? "OK" : "SHORT"}`);
    }
    console.log("  ok:", report.ok);
    console.log("  message:", coverageMessage(report, 2004) || "(none)");
  }
}
await prisma.$disconnect();
