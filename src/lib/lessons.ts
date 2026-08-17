import type { Prisma, PrismaClient } from "@prisma/client";
import {
  lintLessonBlocks,
  type LessonBlock,
} from "./lesson-engine";

// Auto-generated lessons
// Every topic gets a single "Core Concepts" lesson so students can study
// before attempting a topic quiz. Content is generated from the topic title;
// keep the copy definition-safe (no fabricated facts or numbers).

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function buildLessonBlocks(title: string, subjectName: string): LessonBlock[] {
  return [
    {
      type: "concept",
      id: "c1",
      title: "The big idea",
      text: `${title} is a core topic in ${subjectName}. It is tested regularly across WAEC, JAMB and NECO. Start with the core definitions and basic principles, then practise applying them to exam-style problems.`,
      reveal: `Mastering the definitions first makes every past question on ${lowerFirst(title)} easier to read.`,
    },
    {
      type: "tip",
      id: "t1",
      text: `Examiners often rephrase the same idea in different words. Learn the meaning of ${lowerFirst(title)}, not just the word.`,
      examType: "JAMB",
    },
    {
      type: "mistake",
      id: "m1",
      wrong: "Skipping the definitions and jumping straight to problem solving.",
      right: "Learning the key terms first, then applying them to questions.",
    },
    {
      type: "mnemonic",
      id: "n1",
      phrase: "**P**repare · **R**eview · **E**valuate · **P**ractise",
      encoded: [
        "Prepare — read the core notes on " + lowerFirst(title),
        "Review — revisit the key points",
        "Evaluate — take the knowledge checks",
        "Practise — solve the past questions",
      ],
    },
    {
      type: "example",
      id: "e1",
      title: "How to study this topic",
      mode: "worked",
      problem: `A student has 20 minutes to start ${lowerFirst(title)}. What is the best sequence?`,
      steps: [
        "Read the definitions and key terms once.",
        "Work through one example step by step.",
        "Answer the knowledge check to confirm understanding.",
      ],
      answer: `Read, work an example, then check yourself — that is the shortest reliable path to a first grasp of ${lowerFirst(title)}.`,
    },
    {
      type: "check",
      id: "k1",
      question: `To start studying ${lowerFirst(title)} for WAEC and JAMB, the best first step is to:`,
      options: {
        A: "Master the core definitions and basic principles",
        B: "Memorise past answers without reading the notes",
        C: "Skip straight to advanced problems",
        D: "Ignore the topic and guess in the exam",
      },
      answer: "A",
      explanation: `Mastering definitions and principles builds the foundation for applying ${lowerFirst(title)} to exam-style problems.`,
      afterCard: "e1",
    },
  ];
}

export function generateLesson(topic: { title: string }, subjectName: string) {
  const title = topic.title;

  const objectives = [
    `Explain the meaning and importance of ${lowerFirst(title)}.`,
    `Identify the key terms, concepts, and relationships used in ${lowerFirst(title)}.`,
    `Apply the principles of ${lowerFirst(title)} to solve exam-style problems.`,
    `Connect ${lowerFirst(title)} to the wider ${subjectName} syllabus and past examination questions.`,
  ];

  const keyPoints = [
    `${title} is tested regularly across WAEC, JAMB, and NECO examinations.`,
    `Mastering the core definitions and basic principles is the foundation of this topic.`,
    `Work through examples step by step to see how each principle is applied.`,
    `Use the past questions in the question bank to test and reinforce your understanding.`,
    `Review ${lowerFirst(title)} alongside related topics to see the full picture.`,
  ];

  const mistakes = [
    "Skipping the definitions and jumping straight to problem solving.",
    "Memorising answers instead of understanding the underlying concepts.",
    "Ignoring units, conditions, and assumptions that examiners love to test.",
  ];

  const studyTips = [
    "Read the lesson notes, then take the topic quiz to check what you have retained.",
    "Focus on the key points — they summarise what examiners most often test.",
    "Practise a few questions every day and review the explanations for the ones you miss.",
  ];

  const content = [
    `## Introduction`,
    `${title} is a core topic in ${subjectName}. This lesson introduces the key ideas, definitions, and skills you need to understand ${lowerFirst(title)} and to answer WAEC, JAMB, and NECO questions on it.`,
    ``,
    `## Learning Objectives`,
    `By the end of this lesson, you should be able to:`,
    ...objectives.map((o) => `- ${o}`),
    ``,
    `## Key Concepts`,
    `The study of ${lowerFirst(title)} in ${subjectName} is built on a few central ideas. Start by mastering the definitions and basic principles, then practise applying them to worked examples and past questions.`,
    ``,
    ...keyPoints.map((k) => `- ${k}`),
    ``,
    `## Common Mistakes to Avoid`,
    ...mistakes.map((m) => `- ${m}`),
    ``,
    `## Study Tips`,
    ...studyTips.map((s) => `- ${s}`),
  ].join("\n");

  const summary = `${title} is an important ${subjectName} topic that requires a clear grasp of its core definitions and principles. Master the key concepts, avoid the common mistakes above, and reinforce your learning with the topic quiz and past questions.`;

  const blocks = buildLessonBlocks(title, subjectName);

  return { content, summary, keyPoints, blocks };
}

export async function seedLessons(
  prisma: PrismaClient,
  opts?: { topicIds?: string[] },
) {
  console.log("Seeding auto-generated lessons...");

  const topics = await prisma.topic.findMany({
    where: opts?.topicIds ? { id: { in: opts.topicIds } } : undefined,
    include: { subject: { select: { name: true } } },
  });

  // Authoring lint — fail the seed on invalid blocks so broken lessons never
  // reach the player. Runs before any writes.
  let lintFailures = 0;
  for (const topic of topics) {
    const { blocks } = generateLesson(topic, topic.subject.name);
    const issues = lintLessonBlocks(blocks);
    if (issues.length > 0) {
      lintFailures++;
      console.error(`  ✗ Lint: ${topic.title} (${topic.id})`);
      for (const issue of issues) {
        console.error(`    - ${issue.blockId ? `[${issue.blockId}] ` : ""}${issue.message}`);
      }
    }
  }
  if (lintFailures > 0) {
    throw new Error(`${lintFailures} lesson(s) failed the authoring lint.`);
  }

  // Upsert so a re-run refreshes content and blocks on existing lessons.
  let subtopicsCreated = 0;
  let lessonsCreated = 0;
  let lessonsUpdated = 0;

  for (const topic of topics) {
    const subtopicId = `${topic.id}-core`;
    const { content, summary, keyPoints, blocks } = generateLesson(
      topic,
      topic.subject.name,
    );

    const existingSubtopic = await prisma.subtopic.findUnique({
      where: { id: subtopicId },
      select: { id: true },
    });

    const subtopic = await prisma.subtopic.upsert({
      where: { id: subtopicId },
      update: {},
      create: {
        id: subtopicId,
        topicId: topic.id,
        title: "Core Concepts",
        description: `Core concepts and study notes for ${topic.title}.`,
        orderIndex: 0,
      },
    });
    if (!existingSubtopic) subtopicsCreated++;

    const existing = await prisma.lesson.findUnique({
      where: { id: `${subtopicId}-lesson` },
      select: { id: true },
    });
    const data: Prisma.LessonCreateInput = {
      id: `${subtopicId}-lesson`,
      subtopic: { connect: { id: subtopic.id } },
      title: topic.title,
      content,
      summary,
      keyPoints,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      workedExamples: [],
      difficulty: "INTERMEDIATE",
      estimatedMinutes: Math.min(Math.max(topic.estimatedMinutes, 15), 45),
      createdBy: "system",
    };
    await prisma.lesson.upsert({
      where: { id: `${subtopicId}-lesson` },
      update: {
        title: topic.title,
        content,
        summary,
        keyPoints,
        blocks: blocks as unknown as Prisma.InputJsonValue,
        estimatedMinutes: Math.min(Math.max(topic.estimatedMinutes, 15), 45),
      },
      create: data,
    });

    if (existing) lessonsUpdated++;
    else lessonsCreated++;
  }

  console.log(
    `  ✓ ${subtopicsCreated} subtopics and ${lessonsCreated} lessons created, ${lessonsUpdated} refreshed (${topics.length} topics total)`
  );
}
