import { PrismaClient } from "@prisma/client";
import { loadGraph } from "../src/engines/learning/graph";
import { computeTopicState } from "../src/engines/learning/mastery";
import { loadPretestPassed } from "../src/engines/learning/availability";
import { recommendNext } from "../src/engines/learning/recommend";

const prisma = new PrismaClient();

async function main() {
  const subject = await prisma.subject.findFirst({
    where: { slug: "mathematics" },
    select: { id: true, name: true },
  });
  if (!subject) throw new Error("subject not found");
  const student = await prisma.student.findFirst({ select: { id: true } });
  if (!student) throw new Error("no student");

  const t0 = Date.now();
  const graph = await loadGraph(prisma, subject.id);
  const t1 = Date.now();
  const [state, pretestPassed] = await Promise.all([
    computeTopicState(prisma, student.id, graph),
    loadPretestPassed(prisma, student.id, subject.id),
  ]);
  const t2 = Date.now();
  const next = recommendNext(state, graph, { k: 1, pretestPassed });
  console.log(
    `${subject.name}: ${graph.nodes.size} nodes, ${graph.edges.length} edges, ` +
      `state=${state.size} topics, pretest=${pretestPassed.size}, next=${next[0]?.slug ?? "(none)"}, ` +
      `loadGraph=${t1 - t0}ms, state+pretest=${t2 - t1}ms`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
