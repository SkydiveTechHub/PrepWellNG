import { PrismaClient, Prisma } from "@prisma/client";
import { lintKnowledgeGraph, loadGraph } from "../src/engines/learning/graph";

// Learning Path Engine — Phase 6 content seed.
// Authors real-syllabus prerequisite edges for every populated subject, then
// lints each subject's graph as a DAG. Idempotent: existing edges are left
// untouched (skipDuplicates), so it is safe to run repeatedly.
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

const prisma = new PrismaClient();

type PrereqRef = {
  slug: string;
  /** Fraction of GATE the prerequisite must reach (default 1). */
  strength?: number;
  rationale?: string;
};

type TopicEdges = {
  topic: string;
  prereqs: PrereqRef[];
};

// Curated from the WAEC/JAMB syllabi. `strength` 1.0 = hard prerequisite
// (full 60% mastery gate); 0.5 = supporting (30% gate).
const EDGES: Record<string, TopicEdges[]> = {
  mathematics: [
    { topic: "modular-arithmetic", prereqs: [{ slug: "number-bases" }] },
    { topic: "indices-and-logarithms", prereqs: [{ slug: "number-bases", strength: 0.5 }] },
    { topic: "algebraic-expressions-factorization", prereqs: [{ slug: "simple-equations-and-inequalities", strength: 0.5 }] },
    { topic: "quadratic-equations", prereqs: [{ slug: "algebraic-expressions-factorization" }, { slug: "simple-equations-and-inequalities" }] },
    { topic: "surds", prereqs: [{ slug: "indices-and-logarithms" }] },
    { topic: "circle-theorems", prereqs: [{ slug: "plane-geometry-angles-and-polygons" }] },
    { topic: "construction-and-loci", prereqs: [{ slug: "plane-geometry-angles-and-polygons" }, { slug: "circle-theorems", strength: 0.5 }] },
    { topic: "trigonometric-ratios", prereqs: [{ slug: "plane-geometry-angles-and-polygons" }] },
    { topic: "mensuration-perimeter-area", prereqs: [{ slug: "plane-geometry-angles-and-polygons", strength: 0.5 }] },
    { topic: "mensuration-volume-and-surface-area", prereqs: [{ slug: "mensuration-perimeter-area" }] },
    { topic: "probability", prereqs: [{ slug: "statistics-mean-median-mode", strength: 0.5 }] },
    { topic: "simultaneous-linear-and-quadratic-equations", prereqs: [{ slug: "simple-equations-and-inequalities" }, { slug: "quadratic-equations" }] },
    { topic: "variation-direct-inverse-joint-partial", prereqs: [{ slug: "simple-equations-and-inequalities" }, { slug: "indices-and-logarithms", strength: 0.5 }] },
    { topic: "polynomial-functions", prereqs: [{ slug: "quadratic-equations" }, { slug: "indices-and-logarithms" }] },
    { topic: "matrices-and-determinants", prereqs: [{ slug: "sets", strength: 0.5 }, { slug: "algebraic-expressions-factorization", strength: 0.5 }] },
    { topic: "arithmetic-and-geometric-progressions", prereqs: [{ slug: "indices-and-logarithms" }] },
    { topic: "coordinate-geometry-straight-lines", prereqs: [{ slug: "simple-equations-and-inequalities" }, { slug: "sets", strength: 0.5 }] },
    { topic: "coordinate-geometry-circles-and-curves", prereqs: [{ slug: "coordinate-geometry-straight-lines" }, { slug: "quadratic-equations", strength: 0.5 }] },
    { topic: "trigonometric-functions-and-graphs", prereqs: [{ slug: "trigonometric-ratios" }, { slug: "indices-and-logarithms", strength: 0.5 }] },
    { topic: "sine-and-cosine-rules", prereqs: [{ slug: "trigonometric-ratios" }] },
    { topic: "bearings-and-distances", prereqs: [{ slug: "sine-and-cosine-rules" }, { slug: "trigonometric-ratios", strength: 0.5 }] },
    { topic: "statistics-grouped-data-and-standard-deviation", prereqs: [{ slug: "statistics-mean-median-mode" }] },
    { topic: "probability-compound-events", prereqs: [{ slug: "probability" }] },
    { topic: "introduction-to-calculus-differentiation", prereqs: [{ slug: "polynomial-functions" }, { slug: "indices-and-logarithms" }] },
    { topic: "application-of-differentiation", prereqs: [{ slug: "introduction-to-calculus-differentiation" }] },
    { topic: "integration", prereqs: [{ slug: "introduction-to-calculus-differentiation" }] },
    { topic: "application-of-integration", prereqs: [{ slug: "integration" }, { slug: "application-of-differentiation", strength: 0.5 }] },
    { topic: "vectors-in-two-dimensions", prereqs: [{ slug: "coordinate-geometry-straight-lines" }, { slug: "trigonometric-ratios", strength: 0.5 }] },
    { topic: "transformation-geometry", prereqs: [{ slug: "coordinate-geometry-straight-lines" }, { slug: "matrices-and-determinants", strength: 0.5 }] },
    { topic: "linear-inequalities-and-linear-programming", prereqs: [{ slug: "simple-equations-and-inequalities" }, { slug: "coordinate-geometry-straight-lines", strength: 0.5 }] },
    { topic: "binary-operations", prereqs: [{ slug: "number-bases" }, { slug: "modular-arithmetic", strength: 0.5 }] },
    { topic: "revision-algebra-and-number", prereqs: [{ slug: "sets" }, { slug: "quadratic-equations" }, { slug: "surds", strength: 0.5 }] },
    { topic: "revision-geometry-and-trigonometry", prereqs: [{ slug: "plane-geometry-angles-and-polygons" }, { slug: "trigonometric-ratios", strength: 0.5 }] },
    { topic: "revision-statistics-probability-calculus", prereqs: [{ slug: "statistics-grouped-data-and-standard-deviation", strength: 0.5 }, { slug: "introduction-to-calculus-differentiation", strength: 0.5 }] },
    { topic: "past-question-drill", prereqs: [{ slug: "revision-algebra-and-number", strength: 0.5 }, { slug: "revision-geometry-and-trigonometry", strength: 0.5 }] },
    { topic: "mock-waec-practice", prereqs: [{ slug: "past-question-drill" }] },
    { topic: "jamb-cbt-simulation", prereqs: [{ slug: "past-question-drill", strength: 0.5 }] },
    { topic: "final-revision-and-exam-strategy", prereqs: [{ slug: "mock-waec-practice", strength: 0.5 }] },
  ],

  physics: [
    { topic: "measurement-and-units", prereqs: [{ slug: "introduction-to-physics" }] },
    { topic: "scalar-and-vector-quantities", prereqs: [{ slug: "measurement-and-units" }, { slug: "introduction-to-physics", strength: 0.5 }] },
    { topic: "distance-displacement-speed-velocity-and-acceleration", prereqs: [{ slug: "measurement-and-units" }] },
    { topic: "equations-of-motion", prereqs: [{ slug: "distance-displacement-speed-velocity-and-acceleration" }] },
    { topic: "motion-under-gravity", prereqs: [{ slug: "equations-of-motion" }] },
    { topic: "position-distance-and-displacement", prereqs: [{ slug: "distance-displacement-speed-velocity-and-acceleration", strength: 0.5 }] },
    { topic: "force", prereqs: [{ slug: "scalar-and-vector-quantities" }, { slug: "distance-displacement-speed-velocity-and-acceleration", strength: 0.5 }] },
    { topic: "friction", prereqs: [{ slug: "force" }] },
    { topic: "viscosity-and-terminal-velocity", prereqs: [{ slug: "force" }, { slug: "friction", strength: 0.5 }] },
    { topic: "simple-machines", prereqs: [{ slug: "force" }, { slug: "work-energy-and-power", strength: 0.5 }] },
    { topic: "work-energy-and-power", prereqs: [{ slug: "force" }, { slug: "distance-displacement-speed-velocity-and-acceleration", strength: 0.5 }] },
    { topic: "pressure", prereqs: [{ slug: "force" }, { slug: "density-and-relative-density", strength: 0.5 }] },
    { topic: "density-and-relative-density", prereqs: [{ slug: "measurement-and-units" }] },
    { topic: "elasticity-hookes-law", prereqs: [{ slug: "force" }] },
    { topic: "temperature-and-thermometers", prereqs: [{ slug: "measurement-and-units" }] },
    { topic: "heat-energy-and-heat-transfer", prereqs: [{ slug: "temperature-and-thermometers" }] },
    { topic: "linear-and-volume-expansivity", prereqs: [{ slug: "temperature-and-thermometers" }] },
    { topic: "specific-heat-capacity-and-latent-heat", prereqs: [{ slug: "heat-energy-and-heat-transfer" }, { slug: "linear-and-volume-expansivity", strength: 0.5 }] },
    { topic: "vapour-pressure-and-humidity", prereqs: [{ slug: "specific-heat-capacity-and-latent-heat", strength: 0.5 }, { slug: "pressure", strength: 0.5 }] },
    { topic: "gas-laws", prereqs: [{ slug: "pressure" }, { slug: "temperature-and-thermometers", strength: 0.5 }] },
    { topic: "properties-of-waves", prereqs: [{ slug: "wave-motion-and-types-of-waves" }] },
    { topic: "sound-waves", prereqs: [{ slug: "properties-of-waves" }] },
    { topic: "light-reflection-at-plane-and-curved-surfaces", prereqs: [{ slug: "properties-of-waves" }] },
    { topic: "refraction-of-light", prereqs: [{ slug: "light-reflection-at-plane-and-curved-surfaces" }] },
    { topic: "optical-instruments", prereqs: [{ slug: "refraction-of-light" }, { slug: "light-reflection-at-plane-and-curved-surfaces", strength: 0.5 }] },
    { topic: "dispersion-of-light-and-electromagnetic-spectrum", prereqs: [{ slug: "refraction-of-light" }] },
    { topic: "capacitors-and-capacitance", prereqs: [{ slug: "electrostatics-electric-charges-and-fields" }] },
    { topic: "current-electricity-ohms-law", prereqs: [{ slug: "electrostatics-electric-charges-and-fields" }] },
    { topic: "electrical-circuits-series-and-parallel", prereqs: [{ slug: "current-electricity-ohms-law" }] },
    { topic: "electrical-energy-and-power", prereqs: [{ slug: "current-electricity-ohms-law" }, { slug: "work-energy-and-power", strength: 0.5 }] },
    { topic: "electromagnetic-induction", prereqs: [{ slug: "magnets-and-magnetic-fields" }, { slug: "electrical-circuits-series-and-parallel", strength: 0.5 }] },
    { topic: "alternating-current-circuits", prereqs: [{ slug: "electromagnetic-induction" }, { slug: "electrical-circuits-series-and-parallel", strength: 0.5 }] },
    { topic: "electromagnetic-waves", prereqs: [{ slug: "properties-of-waves" }, { slug: "dispersion-of-light-and-electromagnetic-spectrum", strength: 0.5 }] },
    { topic: "nuclear-reactions-fission-and-fusion", prereqs: [{ slug: "atomic-structure-and-radioactivity" }] },
    { topic: "photoelectric-effect", prereqs: [{ slug: "atomic-structure-and-radioactivity" }, { slug: "electromagnetic-waves", strength: 0.5 }] },
    { topic: "wave-particle-duality", prereqs: [{ slug: "photoelectric-effect" }, { slug: "properties-of-waves", strength: 0.5 }] },
    { topic: "electronics-semiconductors-and-logic-gates", prereqs: [{ slug: "current-electricity-ohms-law" }, { slug: "electrostatics-electric-charges-and-fields", strength: 0.5 }] },
    { topic: "revision-mechanics", prereqs: [{ slug: "force" }, { slug: "equations-of-motion" }, { slug: "work-energy-and-power", strength: 0.5 }] },
    { topic: "revision-waves-and-optics", prereqs: [{ slug: "properties-of-waves" }, { slug: "refraction-of-light", strength: 0.5 }] },
    { topic: "revision-electricity-and-magnetism", prereqs: [{ slug: "electrical-circuits-series-and-parallel", strength: 0.5 }, { slug: "electromagnetic-induction", strength: 0.5 }] },
    { topic: "past-question-drill", prereqs: [{ slug: "revision-mechanics", strength: 0.5 }, { slug: "revision-waves-and-optics", strength: 0.5 }] },
    { topic: "mock-waec-practice", prereqs: [{ slug: "past-question-drill" }] },
    { topic: "jamb-cbt-simulation", prereqs: [{ slug: "past-question-drill", strength: 0.5 }] },
    { topic: "final-revision-and-exam-strategy", prereqs: [{ slug: "mock-waec-practice", strength: 0.5 }] },
  ],

  biology: [
    { topic: "cell-division", prereqs: [{ slug: "cell-structure-and-organization" }] },
    { topic: "nutrition-in-plants", prereqs: [{ slug: "cell-structure-and-organization", strength: 0.5 }, { slug: "classification-of-living-things", strength: 0.5 }] },
    { topic: "nutrition-in-animals", prereqs: [{ slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "transport-system-in-plants", prereqs: [{ slug: "nutrition-in-plants" }, { slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "transport-system-in-animals", prereqs: [{ slug: "nutrition-in-animals" }, { slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "respiration", prereqs: [{ slug: "nutrition-in-animals", strength: 0.5 }, { slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "excretion", prereqs: [{ slug: "transport-system-in-animals", strength: 0.5 }, { slug: "respiration", strength: 0.5 }] },
    { topic: "skeletal-and-muscular-systems", prereqs: [{ slug: "classification-of-living-things", strength: 0.5 }, { slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "nervous-system-and-sense-organs", prereqs: [{ slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "endocrine-system", prereqs: [{ slug: "nervous-system-and-sense-organs", strength: 0.5 }] },
    { topic: "homeostasis-and-coordination", prereqs: [{ slug: "endocrine-system" }, { slug: "nervous-system-and-sense-organs", strength: 0.5 }] },
    { topic: "reproduction-in-plants", prereqs: [{ slug: "cell-division" }, { slug: "nutrition-in-plants", strength: 0.5 }] },
    { topic: "reproduction-in-animals", prereqs: [{ slug: "cell-division" }, { slug: "nutrition-in-animals", strength: 0.5 }] },
    { topic: "growth-and-development", prereqs: [{ slug: "cell-division" }] },
    { topic: "genetics-and-heredity", prereqs: [{ slug: "cell-division" }, { slug: "reproduction-in-plants", strength: 0.5 }, { slug: "reproduction-in-animals", strength: 0.5 }] },
    { topic: "evolution", prereqs: [{ slug: "genetics-and-heredity", strength: 0.5 }, { slug: "classification-of-living-things", strength: 0.5 }] },
    { topic: "microorganisms-and-disease", prereqs: [{ slug: "classification-of-living-things", strength: 0.5 }, { slug: "cell-structure-and-organization", strength: 0.5 }] },
    { topic: "ecology", prereqs: [{ slug: "classification-of-living-things", strength: 0.5 }] },
  ],

  "english-language": [
    { topic: "summary-writing", prereqs: [{ slug: "comprehension", strength: 0.5 }] },
    { topic: "tenses-and-aspects", prereqs: [{ slug: "parts-of-speech" }] },
    { topic: "essay-writing-descriptive", prereqs: [{ slug: "essay-writing-narrative", strength: 0.5 }, { slug: "parts-of-speech", strength: 0.5 }] },
    { topic: "comprehension-practice", prereqs: [{ slug: "comprehension" }] },
    { topic: "summary-techniques", prereqs: [{ slug: "summary-writing" }, { slug: "comprehension-practice", strength: 0.5 }] },
    { topic: "oral-english-consonant-sounds", prereqs: [{ slug: "oral-english-vowel-sounds" }] },
    { topic: "active-and-passive-voice", prereqs: [{ slug: "tenses-and-aspects" }] },
    { topic: "clauses-and-sentence-structure", prereqs: [{ slug: "parts-of-speech" }, { slug: "tenses-and-aspects", strength: 0.5 }] },
    { topic: "idioms-and-figures-of-speech", prereqs: [{ slug: "comprehension", strength: 0.5 }, { slug: "parts-of-speech", strength: 0.5 }] },
    { topic: "essay-writing-argumentative", prereqs: [{ slug: "essay-writing-narrative" }, { slug: "essay-writing-descriptive", strength: 0.5 }] },
    { topic: "speech-work-and-stress-patterns", prereqs: [{ slug: "oral-english-vowel-sounds" }, { slug: "oral-english-consonant-sounds", strength: 0.5 }] },
    { topic: "grammar-and-usage", prereqs: [{ slug: "parts-of-speech" }, { slug: "tenses-and-aspects", strength: 0.5 }] },
    { topic: "comprehension-drills", prereqs: [{ slug: "comprehension-practice" }] },
    { topic: "summary-drills", prereqs: [{ slug: "summary-techniques" }, { slug: "comprehension-drills", strength: 0.5 }] },
    { topic: "past-question-practice", prereqs: [{ slug: "comprehension-drills", strength: 0.5 }, { slug: "summary-drills", strength: 0.5 }, { slug: "grammar-and-usage", strength: 0.5 }] },
  ],

  "civic-education": [
    { topic: "the-nigerian-constitution", prereqs: [{ slug: "citizenship", strength: 0.5 }] },
    { topic: "rule-of-law", prereqs: [{ slug: "the-nigerian-constitution" }] },
    { topic: "fundamental-human-rights", prereqs: [{ slug: "the-nigerian-constitution" }, { slug: "rule-of-law", strength: 0.5 }] },
    { topic: "democracy-and-national-development", prereqs: [{ slug: "rule-of-law" }, { slug: "fundamental-human-rights", strength: 0.5 }] },
    { topic: "civic-responsibilities", prereqs: [{ slug: "citizenship" }] },
    { topic: "government-and-governance", prereqs: [{ slug: "the-nigerian-constitution" }, { slug: "democracy-and-national-development", strength: 0.5 }] },
    { topic: "national-consciousness", prereqs: [{ slug: "citizenship" }, { slug: "values-and-integrity", strength: 0.5 }] },
    { topic: "values-and-integrity", prereqs: [{ slug: "citizenship" }] },
    { topic: "electoral-processes", prereqs: [{ slug: "democracy-and-national-development" }, { slug: "fundamental-human-rights", strength: 0.5 }] },
    { topic: "public-service", prereqs: [{ slug: "government-and-governance" }, { slug: "civic-responsibilities", strength: 0.5 }] },
    { topic: "civil-society-organizations", prereqs: [{ slug: "public-service" }, { slug: "government-and-governance", strength: 0.5 }] },
    { topic: "international-organizations", prereqs: [{ slug: "democracy-and-national-development", strength: 0.5 }, { slug: "national-consciousness", strength: 0.5 }] },
    { topic: "national-security", prereqs: [{ slug: "citizenship", strength: 0.5 }, { slug: "government-and-governance", strength: 0.5 }] },
    { topic: "examination-ethics", prereqs: [{ slug: "values-and-integrity" }] },
  ],

  chemistry: [
    { topic: "separation-techniques", prereqs: [{ slug: "introduction-to-chemistry" }] },
    { topic: "particulate-nature-of-matter", prereqs: [{ slug: "introduction-to-chemistry" }, { slug: "separation-techniques", strength: 0.5 }] },
  ],
};

async function main() {
  const subjects = await prisma.subject.findMany({
    where: { slug: { in: Object.keys(EDGES) } },
    select: { id: true, slug: true, name: true },
  });
  const subjectIds = new Set(subjects.map((s) => s.id));

  const topics = await prisma.topic.findMany({
    where: { subjectId: { in: [...subjectIds] } },
    select: { id: true, subjectId: true, slug: true, title: true },
  });
  const idBySubjectSlug = new Map<string, Map<string, string>>();
  for (const subject of subjects) {
    idBySubjectSlug.set(
      subject.slug,
      new Map(
        topics
          .filter((t) => t.subjectId === subject.id)
          .map((t) => [t.slug, t.id]),
      ),
    );
  }

  const toCreate: Prisma.TopicEdgeCreateManyInput[] = [];
  const missing: string[] = [];
  for (const [subjectSlug, entries] of Object.entries(EDGES)) {
    const ids = idBySubjectSlug.get(subjectSlug);
    if (!ids) {
      missing.push(`subject ${subjectSlug}`);
      continue;
    }
    for (const entry of entries) {
      const topicId = ids.get(entry.topic);
      if (!topicId) {
        missing.push(`${subjectSlug}:${entry.topic}`);
        continue;
      }
      for (const prereq of entry.prereqs) {
        const prereqTopicId = ids.get(prereq.slug);
        if (!prereqTopicId) {
          missing.push(`${subjectSlug}:${prereq.slug}`);
          continue;
        }
        toCreate.push({
          prereqTopicId,
          topicId,
          kind: "PREREQUISITE",
          strength: prereq.strength ?? 1,
          rationale: prereq.rationale ?? null,
        });
      }
    }
  }

  if (missing.length > 0) {
    console.warn(`⚠ Skipped ${missing.length} unresolved refs:\n  ${missing.join("\n  ")}`);
  }

  if (toCreate.length > 0) {
    const result = await prisma.topicEdge.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
    console.log(`Created ${result.count} edges (${toCreate.length} authored).`);
  } else {
    console.log("No edges to create.");
  }

  // Lint every seeded subject's graph for DAG violations.
  let failures = 0;
  const coreSubjectIds = new Set(subjects.map((s) => s.id));
  for (const subject of subjects) {
    const graph = await loadGraph(prisma, subject.id, { includeLegacy: false });
    const issues = lintKnowledgeGraph(graph, { coreSubjectIds });
    if (issues.length > 0) {
      failures += 1;
      console.error(`\n✗ ${subject.name} (${subject.slug}) — ${issues.length} lint issue(s):`);
      for (const issue of issues) console.error(`  [${issue.code}] ${issue.message}`);
    } else {
      console.log(`✓ ${subject.name} (${subject.slug}) — ${graph.edges.length} edges, DAG clean.`);
    }
  }

  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
