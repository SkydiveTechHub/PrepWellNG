import { PrismaClient } from "@prisma/client";
import {
  migrateLegacyPrerequisites,
  lintKnowledgeGraph,
} from "../src/engines/learning/graph";

// Idempotent — safe to run multiple times. Converts legacy
// `Topic.prerequisiteTopicId` rows into TopicEdge rows, then lints every
// subject's graph for DAG violations.

const prisma = new PrismaClient();

async function lintAllSubjects() {
  const subjects = await prisma.subject.findMany({ select: { id: true } });
  let failures = 0;
  for (const subject of subjects) {
    const topics = await prisma.topic.findMany({
      where: { subjectId: subject.id },
      select: {
        id: true,
        subjectId: true,
        title: true,
        slug: true,
        orderIndex: true,
        estimatedMinutes: true,
        waecWeight: true,
        jambWeight: true,
        prerequisiteTopicId: true,
      },
    });
    const edges = await prisma.topicEdge.findMany({
      where: {
        OR: [
          { prereqTopicId: { in: topics.map((t) => t.id) } },
          { topicId: { in: topics.map((t) => t.id) } },
        ],
      },
      select: {
        id: true,
        prereqTopicId: true,
        topicId: true,
        kind: true,
        strength: true,
        rationale: true,
      },
    });
    const graph = {
      nodes: new Map(topics.map((t) => [t.id, t])),
      edges: edges.map((e) => ({
        id: e.id,
        from: e.prereqTopicId,
        to: e.topicId,
        kind: e.kind,
        strength: e.strength,
        rationale: e.rationale,
      })),
    };
    const issues = lintKnowledgeGraph(graph);
    if (issues.length > 0) {
      failures++;
      console.error(`  ✗ Lint: subject ${subject.id}`);
      for (const issue of issues) {
        console.error(`    - [${issue.code}] ${issue.message}`);
      }
    }
  }
  return failures;
}

migrateLegacyPrerequisites(prisma)
  .then(async (result) => {
    console.log(
      `  ✓ migrated: ${result.created} created, ${result.existing} existing, ${result.processed} processed, ${result.skipped} skipped`,
    );
    const failures = await lintAllSubjects();
    if (failures > 0) {
      throw new Error(`${failures} subject graph(s) failed the DAG lint.`);
    }
    console.log("\n✅ Topic edges migrated and all graphs linted successfully!");
  })
  .catch((e) => {
    console.error("Topic edge migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
