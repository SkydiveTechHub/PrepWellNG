import { PrismaClient } from "@prisma/client";
import { pickRandomQuestionIds, countQuestionsMatching } from "../src/lib/question-pool";
import { getMockExamAvailability, countForRange } from "../src/lib/mock-exam-availability";
import { expandScopeRange, describeScopeRange, type ScopePoint } from "../src/lib/curriculum-scope";

const prisma = new PrismaClient();
const at = (c: string, t: string) => ({ classLevel: c, term: t }) as ScopePoint;

for (const board of ["WAEC", "JAMB", "NECO"]) {
  const subs = await getMockExamAvailability(board);
  console.log(`\n${board}: ${subs.length} subject(s) scoped`);
  for (const s of subs) console.log(`   ${s.code.padEnd(4)} total ${String(s.total).padStart(4)}  slots ${s.scopes.length}`);
}

// The user's first example: WAEC + Physics + SS2 + 2nd term.
const waec = await getMockExamAvailability("WAEC");
const phy = waec.find((s) => s.code === "PHY");
if (phy) {
  const single = at("SS2", "SECOND");
  const n = await countForRange({ subjectId: phy.id, examType: "WAEC", from: single, to: single });
  console.log(`\nWAEC Physics ${describeScopeRange(single, single)} -> ${n} question(s)`);
  const ids = await pickRandomQuestionIds(prisma, {
    subjectId: phy.id, examType: "WAEC", scopes: expandScopeRange(single, single),
  }, 40);
  console.log(`  picked ${ids.length}`);
}

// The user's range example: SS1 1st term to SS1 3rd term.
const jamb = await getMockExamAvailability("JAMB");
const bio = jamb.find((s) => s.code === "BIO");
if (bio) {
  const from = at("SS1", "FIRST"), to = at("SS1", "THIRD");
  const n = await countForRange({ subjectId: bio.id, examType: "JAMB", from, to });
  console.log(`\nJAMB Biology ${describeScopeRange(from, to)} -> ${n} question(s)`);
  const ids = await pickRandomQuestionIds(prisma, {
    subjectId: bio.id, examType: "JAMB", scopes: expandScopeRange(from, to),
  }, 40);
  console.log(`  picked ${ids.length}, unique ${new Set(ids).size === ids.length}`);

  // Every picked question must genuinely sit inside the scope.
  const rows = await prisma.$queryRaw<{ classLevel: string; term: string; n: number }[]>`
    SELECT cl."classLevel", cl.term, COUNT(*)::int n
    FROM "Question" q JOIN "Topic" t ON t.id=q."topicId"
    JOIN "CurriculumLevel" cl ON cl.id=t."curriculumLevelId"
    WHERE q.id = ANY(${ids}) GROUP BY cl."classLevel", cl.term ORDER BY cl."classLevel", cl.term`;
  console.log("  actual slots of picked questions:", rows.map(r => `${r.classLevel} ${r.term}:${r.n}`).join(", "));
  const leaked = rows.filter(r => r.classLevel !== "SS1");
  console.log("  OUT-OF-SCOPE LEAKS:", leaked.length === 0 ? "none" : JSON.stringify(leaked));

  // Single term must be a strict subset.
  const one = await countForRange({ subjectId: bio.id, examType: "JAMB", from: at("SS1","FIRST"), to: at("SS1","FIRST") });
  console.log(`  SS1 1st term alone -> ${one} (must be < ${n})`, one < n ? "OK" : "FAIL");

  // Reversed range must equal the forward one.
  const rev = await countForRange({ subjectId: bio.id, examType: "JAMB", from: to, to: from });
  console.log(`  reversed range -> ${rev}`, rev === n ? "OK" : "FAIL");

  // Untagged questions must never appear.
  const untagged = await countQuestionsMatching(prisma, {
    subjectId: bio.id, examType: "JAMB", scopes: expandScopeRange(at("SS1","FIRST"), at("SS3","THIRD")),
  });
  const all = await countQuestionsMatching(prisma, { subjectId: bio.id, examType: "JAMB" });
  console.log(`  full syllabus ${untagged} vs unscoped ${all} (untagged excluded: ${untagged <= all})`);
}
await prisma.$disconnect();
