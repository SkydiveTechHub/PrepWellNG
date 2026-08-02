// PrepWell NG — Flashcard Seed
// Run: npx tsx scripts/seed-flashcards.ts
// Seeds a few authored decks that exercise every card type (definition, formula,
// fill-in-the-blank, true/false, compare & contrast, scenario, process, diagram).

import { PrismaClient } from "@prisma/client";
import type { FlashcardType } from "../src/lib/flashcard-content";

const prisma = new PrismaClient();

type SeedCard = {
  cardType: FlashcardType;
  prompt: string;
  payload: Record<string, unknown>;
  difficulty: "BASIC" | "INTERMEDIATE" | "ADVANCED";
};

type SeedDeck = {
  slug: string;
  title: string;
  description: string;
  subjectCode: string;
  topicTitle: string;
  cards: SeedCard[];
};

const DECKS: SeedDeck[] = [
  {
    slug: "biology-the-cell",
    title: "Biology · The Cell",
    description:
      "Cell structure and function for WAEC & JAMB Biology. Definitions, true/false traps, fill-in-the-blanks and one diagram.",
    subjectCode: "BIO",
    topicTitle: "Cell Structure and Organization",
    cards: [
      {
        cardType: "DEFINITION",
        prompt: "Mitochondrion",
        difficulty: "BASIC",
        payload: {
          term: "Mitochondrion",
          definition:
            "The organelle that produces ATP through cellular respiration — the powerhouse of the cell.",
          example: "Skeletal muscle cells pack many mitochondria to meet high energy demand.",
        },
      },
      {
        cardType: "DEFINITION",
        prompt: "Prokaryotic cell",
        difficulty: "INTERMEDIATE",
        payload: {
          term: "Prokaryotic cell",
          definition:
            "A cell that lacks a true nucleus and membrane-bound organelles. Genetic material floats freely in the cytoplasm.",
          example: "Bacteria are the classic prokaryotes.",
        },
      },
      {
        cardType: "TRUE_FALSE",
        prompt: "The mitochondrion is the site of protein synthesis",
        difficulty: "BASIC",
        payload: {
          statement: "The mitochondrion is the site of protein synthesis in the cell.",
          answer: false,
          explanation:
            "Protein synthesis happens on ribosomes (free in the cytoplasm or on the rough ER). The mitochondrion makes ATP.",
        },
      },
      {
        cardType: "FILL_IN_BLANK",
        prompt: "Fluid mosaic model",
        difficulty: "INTERMEDIATE",
        payload: {
          sentence:
            "The cell membrane is described by the ___ model: a bilayer of ___ with proteins floating in it.",
          blanks: [
            { id: "b1", answer: "fluid mosaic" },
            { id: "b2", answer: "phospholipids" },
          ],
          hint: "The two words describe both its movement and its patchwork of parts.",
          explanation:
            "Lipids give the bilayer structure; proteins move within it, so the model is called the fluid mosaic.",
        },
      },
      {
        cardType: "COMPARE_CONTRAST",
        prompt: "Plant vs animal cell",
        difficulty: "INTERMEDIATE",
        payload: {
          itemA: "Plant cell",
          itemB: "Animal cell",
          onlyA: ["cell wall", "chloroplasts", "large central vacuole"],
          onlyB: ["centrioles", "small temporary vacuoles"],
          shared: ["nucleus", "mitochondria", "endoplasmic reticulum", "ribosomes"],
        },
      },
      {
        cardType: "SCENARIO",
        prompt: "Ruptured red blood cell",
        difficulty: "ADVANCED",
        payload: {
          scenario:
            "A red blood cell is placed in pure distilled water. The cell swells and bursts.",
          question: "Explain what happened in terms of osmosis.",
          answer:
            "Water moved into the cell by osmosis because the cytoplasm has a higher solute concentration than the distilled water (the cell is hypotonic to the environment, so it is hypertonic to the water).",
          explanation:
            "Osmosis moves water from a region of higher water potential (distilled water) to lower water potential (the cell's cytoplasm). With no cell wall, the membrane cannot resist the inflow and the cell lyses.",
        },
      },
      {
        cardType: "PROCESS",
        prompt: "Protein export pathway",
        difficulty: "ADVANCED",
        payload: {
          title: "Pathway a secreted protein follows",
          steps: [
            "Ribosome synthesises the protein into the rough ER lumen",
            "Vesicle buds off the rough ER and fuses with the Golgi apparatus",
            "Golgi modifies and packages the protein",
            "Vesicle carries the protein to the cell membrane",
            "Exocytosis releases the protein outside the cell",
          ],
        },
      },
      {
        cardType: "DIAGRAM",
        prompt: "Animal cell",
        difficulty: "INTERMEDIATE",
        payload: {
          svg: '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="150" rx="170" ry="120" fill="#eef2ff" stroke="#4f46e5" stroke-width="3"/><circle cx="200" cy="130" r="55" fill="#c7d2fe" stroke="#4338ca" stroke-width="2"/><ellipse cx="200" cy="130" rx="28" ry="12" fill="#312e81" opacity="0.8"/><ellipse cx="120" cy="90" rx="26" ry="14" fill="#a7f3d0" stroke="#059669" stroke-width="2"/><ellipse cx="120" cy="90" rx="12" ry="6" fill="#064e3b" opacity="0.7"/><circle cx="290" cy="70" r="10" fill="#fbcfe8" stroke="#db2777" stroke-width="2"/><circle cx="300" cy="200" r="12" fill="#fde68a" stroke="#d97706" stroke-width="2"/><text x="230" y="240" font-size="12" fill="#374151">nucleus</text></svg>',
          hotspots: [
            { id: "h1", label: "Cell membrane", text: "Controls what enters and leaves the cell." },
            { id: "h2", label: "Nucleus", text: "Contains DNA and controls cell activities." },
            { id: "h3", label: "Mitochondrion", text: "Site of ATP production." },
          ],
          caption: "A labelled animal cell.",
        },
      },
    ],
  },
  {
    slug: "physics-equations-of-motion",
    title: "Physics · Equations of Motion",
    description:
      "The kinematic equations for WAEC & JAMB Physics. Formulas, variables, and a worked scenario.",
    subjectCode: "PHY",
    topicTitle: "Equations of Motion",
    cards: [
      {
        cardType: "FORMULA",
        prompt: "Second equation of motion",
        difficulty: "BASIC",
        payload: {
          name: "s = ut + ½at²",
          latex: "s = ut + \\tfrac{1}{2}at^2",
          variables: [
            { symbol: "s", meaning: "displacement (m)" },
            { symbol: "u", meaning: "initial velocity (m/s)" },
            { symbol: "t", meaning: "time (s)" },
            { symbol: "a", meaning: "acceleration (m/s²)" },
          ],
          note: "Used when time is known but final velocity is not.",
        },
      },
      {
        cardType: "FORMULA",
        prompt: "Third equation of motion",
        difficulty: "BASIC",
        payload: {
          name: "v² = u² + 2as",
          latex: "v^2 = u^2 + 2as",
          variables: [
            { symbol: "v", meaning: "final velocity (m/s)" },
            { symbol: "u", meaning: "initial velocity (m/s)" },
            { symbol: "a", meaning: "acceleration (m/s²)" },
            { symbol: "s", meaning: "displacement (m)" },
          ],
          note: "Used when time is not given.",
        },
      },
      {
        cardType: "TRUE_FALSE",
        prompt: "Acceleration is always positive",
        difficulty: "BASIC",
        payload: {
          statement:
            "A body moving in a straight line always has a positive acceleration.",
          answer: false,
          explanation:
            "Acceleration is a vector. A decelerating body has acceleration opposite to its motion, so its sign is negative.",
        },
      },
      {
        cardType: "SCENARIO",
        prompt: "Braking car",
        difficulty: "ADVANCED",
        payload: {
          scenario:
            "A car travelling at 20 m/s brakes with a uniform deceleration of 5 m/s² and comes to rest.",
          question: "How far does it travel while braking?",
          answer:
            "Using v² = u² + 2as with v = 0, u = 20, a = −5: 0 = 400 − 10s, so s = 40 m.",
          explanation:
            "Deceleration means a is negative. Setting v = 0 and solving 0 = 20² + 2(−5)s gives s = 40 m.",
        },
      },
      {
        cardType: "FILL_IN_BLANK",
        prompt: "First equation of motion",
        difficulty: "BASIC",
        payload: {
          sentence: "The first equation of motion is ___, linking final velocity to initial velocity.",
          blanks: [{ id: "b1", answer: "v = u + at" }],
          hint: "Three letters and the letters u, a, t.",
          explanation: "v = u + at: final velocity equals initial velocity plus the change from acceleration over time.",
        },
      },
    ],
  },
  {
    slug: "maths-quadratics",
    title: "Mathematics · Quadratic Equations",
    description:
      "Quadratics for WAEC & JAMB Mathematics. Factorising, the formula, and common traps.",
    subjectCode: "MTH",
    topicTitle: "Quadratic Equations",
    cards: [
      {
        cardType: "FORMULA",
        prompt: "Quadratic formula",
        difficulty: "BASIC",
        payload: {
          name: "x = [−b ± √(b² − 4ac)] / 2a",
          latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
          variables: [
            { symbol: "a", meaning: "coefficient of x²" },
            { symbol: "b", meaning: "coefficient of x" },
            { symbol: "c", meaning: "constant term" },
          ],
          note: "The discriminant b² − 4ac decides how many real roots there are.",
        },
      },
      {
        cardType: "DEFINITION",
        prompt: "Discriminant",
        difficulty: "INTERMEDIATE",
        payload: {
          term: "Discriminant",
          definition:
            "The value b² − 4ac in the quadratic formula. It tells you how many real roots a quadratic has.",
          example:
            "If b² − 4ac > 0 there are two distinct real roots; = 0 gives one repeated root; < 0 gives no real roots.",
        },
      },
      {
        cardType: "SCENARIO",
        prompt: "x² − 5x + 6 = 0",
        difficulty: "INTERMEDIATE",
        payload: {
          scenario: "Solve x² − 5x + 6 = 0 by factorising.",
          question: "What are the two roots?",
          answer: "x = 2 and x = 3",
          explanation:
            "x² − 5x + 6 = (x − 2)(x − 3) = 0, so x − 2 = 0 or x − 3 = 0.",
        },
      },
      {
        cardType: "TRUE_FALSE",
        prompt: "Sum of roots sign",
        difficulty: "ADVANCED",
        payload: {
          statement:
            "For ax² + bx + c = 0, the sum of the roots is −b/a.",
          answer: true,
          explanation:
            "For x² − 5x + 6 = 0 the sum of roots is 2 + 3 = 5, and −b/a = −(−5)/1 = 5. Correct.",
        },
      },
      {
        cardType: "FILL_IN_BLANK",
        prompt: "Completing the square",
        difficulty: "ADVANCED",
        payload: {
          sentence: "Completing the square turns x² + 6x into ___.",
          blanks: [{ id: "b1", answer: "(x + 3)² − 9" }],
          hint: "Half of 6, then subtract its square.",
          explanation: "(x + 3)² = x² + 6x + 9, so x² + 6x = (x + 3)² − 9.",
        },
      },
    ],
  },
];

async function main() {
  console.log("🌱 Seeding flashcards...\n");

  for (const deckDef of DECKS) {
    const subject = await prisma.subject.findUnique({
      where: { code: deckDef.subjectCode },
      select: { id: true },
    });
    if (!subject) {
      console.log(`  ⏭ Skipping ${deckDef.title}: subject ${deckDef.subjectCode} not found.`);
      continue;
    }

    const topic = await prisma.topic.findFirst({
      where: { subjectId: subject.id, title: deckDef.topicTitle },
      select: { id: true },
    });
    if (!topic) {
      console.log(`  ⏭ Skipping ${deckDef.title}: topic "${deckDef.topicTitle}" not found.`);
      continue;
    }

    const existingDeck = await prisma.flashcardDeck.findFirst({
      where: { slug: deckDef.slug },
      select: { id: true },
    });
    const deck = existingDeck
      ? await prisma.flashcardDeck.update({
          where: { id: existingDeck.id },
          data: { title: deckDef.title, description: deckDef.description },
        })
      : await prisma.flashcardDeck.create({
          data: {
            slug: deckDef.slug,
            title: deckDef.title,
            description: deckDef.description,
            source: "AUTHORED",
            subjectId: subject.id,
            topicId: topic.id,
          },
        });

    await prisma.flashcard.deleteMany({ where: { deckId: deck.id } });
    await prisma.flashcard.createMany({
      data: deckDef.cards.map((card, index) => ({
        deckId: deck.id,
        cardType: card.cardType,
        prompt: card.prompt,
        payload: card.payload,
        difficulty: card.difficulty,
        orderIndex: index,
      })),
    });

    console.log(`  ✓ ${deckDef.title} (${deckDef.cards.length} cards)`);
  }

  console.log("\n✅ Flashcard seed complete!");
}

main()
  .catch((e) => {
    console.error("Flashcard seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
