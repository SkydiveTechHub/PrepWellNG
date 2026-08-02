import type { PrismaClient } from "@prisma/client";
import type { EdgeKind } from "@/types/prisma";

// Learning Path Engine — knowledge-graph load, DAG lint, and legacy
// prerequisite migration.
// See docs/superpowers/specs/2026-08-02-learning-path-engine-design.md

export type GraphNode = {
  id: string;
  subjectId: string;
  title: string;
  slug: string;
  orderIndex: number;
  estimatedMinutes: number;
  waecWeight: number;
  jambWeight: number;
  prerequisiteTopicId: string | null;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  strength: number;
  rationale: string | null;
};

export type KnowledgeGraph = {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
};

const TOPIC_SELECT = {
  id: true,
  subjectId: true,
  title: true,
  slug: true,
  orderIndex: true,
  estimatedMinutes: true,
  waecWeight: true,
  jambWeight: true,
  prerequisiteTopicId: true,
} as const;

const EDGE_SELECT = {
  id: true,
  prereqTopicId: true,
  topicId: true,
  kind: true,
  strength: true,
  rationale: true,
} as const;

export function buildGraph(
  topics: GraphNode[],
  edges: GraphEdge[],
): KnowledgeGraph {
  const nodes = new Map<string, GraphNode>();
  for (const topic of topics) nodes.set(topic.id, topic);
  return { nodes, edges };
}

/** Edges where `topicId` is the prerequisite of another topic. */
export function outgoingEdges(
  graph: KnowledgeGraph,
  topicId: string,
): GraphEdge[] {
  return graph.edges.filter((edge) => edge.from === topicId);
}

/** Edges where `topicId` depends on a prerequisite topic. */
export function incomingEdges(
  graph: KnowledgeGraph,
  topicId: string,
): GraphEdge[] {
  return graph.edges.filter((edge) => edge.to === topicId);
}

/** Kahn's algorithm. Returns an ordering with prerequisites before dependents. */
export function topologicalOrder(graph: KnowledgeGraph): string[] {
  const indegree = new Map<string, number>();
  for (const id of graph.nodes.keys()) indegree.set(id, 0);
  for (const edge of graph.edges) {
    if (!graph.nodes.has(edge.from) || !graph.nodes.has(edge.to)) continue;
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = [...indegree.keys()].filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    order.push(id);
    for (const edge of outgoingEdges(graph, id)) {
      const current = indegree.get(edge.to);
      if (current === undefined) continue;
      const next = current - 1;
      indegree.set(edge.to, next);
      if (next === 0) queue.push(edge.to);
    }
  }
  return order;
}

/**
 * When the graph has a cycle, returns one cycle as an ordered path of node
 * ids; otherwise null. Undefined for graphs with orphan edge endpoints.
 */
export function findCycle(graph: KnowledgeGraph): string[] | null {
  const ordered = new Set(topologicalOrder(graph));
  const cycleNodes = new Set(
    [...graph.nodes.keys()].filter((id) => !ordered.has(id)),
  );
  if (cycleNodes.size === 0) return null;

  const start = [...cycleNodes][0] as string;
  const path: string[] = [];
  const position = new Map<string, number>();
  let current: string | undefined = start;
  while (current !== undefined) {
    const seenAt = position.get(current);
    if (seenAt !== undefined) return path.slice(seenAt);
    position.set(current, path.length);
    path.push(current);
    current = outgoingEdges(graph, current).find((edge) =>
      cycleNodes.has(edge.to),
    )?.to;
  }
  return path;
}

export type GraphLintIssue = {
  code:
    | "EMPTY_GRAPH"
    | "SELF_EDGE"
    | "DUPLICATE_EDGE"
    | "INVALID_STRENGTH"
    | "ORPHAN_REF"
    | "CROSS_SUBJECT"
    | "CYCLE";
  message: string;
  nodes?: string[];
};

/**
 * Seed/import-time lint. Returns human-readable issues; an empty array means
 * the graph is a valid DAG.
 */
export function lintKnowledgeGraph(
  graph: KnowledgeGraph,
  options?: { coreSubjectIds?: ReadonlySet<string> },
): GraphLintIssue[] {
  const issues: GraphLintIssue[] = [];

  if (graph.nodes.size === 0) {
    issues.push({ code: "EMPTY_GRAPH", message: "Graph has no topics." });
    return issues;
  }

  const seen = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) {
      issues.push({
        code: "DUPLICATE_EDGE",
        message: `Duplicate edge ${key}.`,
        nodes: [edge.from, edge.to],
      });
    }
    seen.add(key);

    if (edge.from === edge.to) {
      issues.push({
        code: "SELF_EDGE",
        message: `Self-referential edge on "${edge.from}".`,
        nodes: [edge.from],
      });
    }

    if (!(edge.strength > 0 && edge.strength <= 1)) {
      issues.push({
        code: "INVALID_STRENGTH",
        message: `Edge ${key} has strength ${edge.strength}; expected a value in (0, 1].`,
        nodes: [edge.from, edge.to],
      });
    }

    const from = graph.nodes.get(edge.from);
    const to = graph.nodes.get(edge.to);
    if (!from) {
      issues.push({
        code: "ORPHAN_REF",
        message: `Edge ${key} references unknown topic "${edge.from}".`,
        nodes: [edge.from],
      });
    }
    if (!to) {
      issues.push({
        code: "ORPHAN_REF",
        message: `Edge ${key} references unknown topic "${edge.to}".`,
        nodes: [edge.to],
      });
    }

    if (from && to && from.subjectId !== to.subjectId) {
      if (!options?.coreSubjectIds?.has(from.subjectId)) {
        issues.push({
          code: "CROSS_SUBJECT",
          message: `Edge ${key} crosses subjects; only CORE subjects may gate another subject.`,
          nodes: [edge.from, edge.to],
        });
      }
    }
  }

  const cycle = findCycle(graph);
  if (cycle) {
    issues.push({
      code: "CYCLE",
      message: `Prerequisite cycle: ${cycle
        .map((id) => graph.nodes.get(id)?.slug ?? id)
        .join(" -> ")}.`,
      nodes: cycle,
    });
  }

  return issues;
}

/**
 * Loads a subject's knowledge graph. Cross-subject edges pull in the CORE
 * prerequisite topics they reference so the lint can inspect them. When a
 * subject has no authored edges yet, falls back to the legacy
 * `prerequisiteTopicId` scalar so the engine never sees an empty graph.
 */
export async function loadGraph(
  prisma: Pick<PrismaClient, "topic" | "topicEdge">,
  subjectId: string,
  options?: { includeLegacy?: boolean },
): Promise<KnowledgeGraph> {
  const topics = await prisma.topic.findMany({
    where: { subjectId },
    orderBy: { orderIndex: "asc" },
    select: TOPIC_SELECT,
  });
  const topicIds = topics.map((topic) => topic.id);

  const edgeRows = await prisma.topicEdge.findMany({
    where: {
      OR: [{ prereqTopicId: { in: topicIds } }, { topicId: { in: topicIds } }],
    },
    select: EDGE_SELECT,
  });

  let edges: GraphEdge[] = edgeRows.map((row) => ({
    id: row.id,
    from: row.prereqTopicId,
    to: row.topicId,
    kind: row.kind,
    strength: row.strength,
    rationale: row.rationale,
  }));

  if (edges.length === 0 && options?.includeLegacy !== false) {
    edges = topics
      .filter(
        (topic) =>
          topic.prerequisiteTopicId && topic.prerequisiteTopicId !== topic.id,
      )
      .map((topic) => ({
        id: `legacy:${topic.prerequisiteTopicId}->${topic.id}`,
        from: topic.prerequisiteTopicId as string,
        to: topic.id,
        kind: "PREREQUISITE" as const,
        strength: 1,
        rationale: null,
      }));
  }

  const referenced = new Set<string>(
    edges.flatMap((edge) => [edge.from, edge.to]),
  );
  const extraTopics = await prisma.topic.findMany({
    where: { id: { in: [...referenced] }, NOT: { id: { in: topicIds } } },
    select: TOPIC_SELECT,
  });

  return buildGraph(
    [...topics, ...extraTopics] as unknown as GraphNode[],
    edges,
  );
}

/**
 * Converts legacy `Topic.prerequisiteTopicId` rows into TopicEdge rows.
 * Idempotent — existing edges are left untouched. Safe to run at seed time.
 */
export async function migrateLegacyPrerequisites(
  prisma: Pick<PrismaClient, "topic" | "topicEdge">,
): Promise<{ processed: number; created: number; existing: number; skipped: number }> {
  const topics = await prisma.topic.findMany({
    where: { prerequisiteTopicId: { not: null } },
    select: { id: true, prerequisiteTopicId: true },
  });

  const candidates = topics.filter(
    (topic) =>
      topic.prerequisiteTopicId && topic.prerequisiteTopicId !== topic.id,
  );

  const existingRows = await prisma.topicEdge.findMany({
    where: {
      OR: candidates.map((topic) => ({
        prereqTopicId: topic.prerequisiteTopicId as string,
        topicId: topic.id,
      })),
    },
    select: { prereqTopicId: true, topicId: true },
  });
  const existingKeys = new Set(
    existingRows.map((row) => `${row.prereqTopicId}:${row.topicId}`),
  );

  const toCreate = candidates.filter(
    (topic) => !existingKeys.has(`${topic.prerequisiteTopicId}:${topic.id}`),
  );

  if (toCreate.length > 0) {
    await prisma.topicEdge.createMany({
      data: toCreate.map((topic) => ({
        prereqTopicId: topic.prerequisiteTopicId as string,
        topicId: topic.id,
        kind: "PREREQUISITE" as const,
        strength: 1,
      })),
      skipDuplicates: true,
    });
  }

  return {
    processed: candidates.length,
    created: toCreate.length,
    existing: existingRows.length,
    skipped: topics.length - candidates.length,
  };
}
