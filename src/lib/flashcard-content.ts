// Flashcard content model: typed payloads, authoring lint, and the
// deterministic lesson → deck generator (the "AI-generated" path).
// See docs/superpowers/specs/2026-08-01-flashcards-design.md.

import { parseBlocks, wordCount } from "./lesson-engine";
import type { AuthoredDifficulty } from "./spaced-repetition";

export type FlashcardType =
  | "DEFINITION"
  | "FORMULA"
  | "IMAGE"
  | "DIAGRAM"
  | "FILL_IN_BLANK"
  | "COMPARE_CONTRAST"
  | "TRUE_FALSE"
  | "SCENARIO"
  | "PROCESS";

// ─── Typed payloads ─────────────────────────────────────────

export type DefinitionPayload = {
  term: string;
  definition: string;
  example?: string;
  imageUrl?: string;
};

export type FormulaPayload = {
  name: string;
  latex: string;
  variables?: { symbol: string; meaning: string }[];
  note?: string;
};

export type ImagePayload = {
  imageUrl: string;
  prompt?: string;
  answer: string;
  caption?: string;
};

export type DiagramHotspot = {
  id: string;
  label: string;
  text: string;
  x?: number;
  y?: number;
};

export type DiagramPayload = {
  svg: string;
  hotspots?: DiagramHotspot[];
  caption?: string;
};

export type Blank = { id: string; answer: string };

export type FillInBlankPayload = {
  sentence: string;
  blanks: Blank[];
  hint?: string;
  explanation?: string;
};

export type CompareContrastPayload = {
  itemA: string;
  itemB: string;
  onlyA: string[];
  onlyB: string[];
  shared: string[];
};

export type TrueFalsePayload = {
  statement: string;
  answer: boolean;
  explanation?: string;
};

export type ScenarioPayload = {
  scenario: string;
  question: string;
  answer: string;
  explanation?: string;
};

export type ProcessPayload = {
  title: string;
  steps: string[];
};

export type FlashcardPayload =
  | DefinitionPayload
  | FormulaPayload
  | ImagePayload
  | DiagramPayload
  | FillInBlankPayload
  | CompareContrastPayload
  | TrueFalsePayload
  | ScenarioPayload
  | ProcessPayload;

export const CARD_TYPES: FlashcardType[] = [
  "DEFINITION",
  "FORMULA",
  "IMAGE",
  "DIAGRAM",
  "FILL_IN_BLANK",
  "COMPARE_CONTRAST",
  "TRUE_FALSE",
  "SCENARIO",
  "PROCESS",
];

export const CARD_TYPE_LABEL: Record<FlashcardType, string> = {
  DEFINITION: "Definition",
  FORMULA: "Formula",
  IMAGE: "Image",
  DIAGRAM: "Diagram",
  FILL_IN_BLANK: "Fill in the blank",
  COMPARE_CONTRAST: "Compare & contrast",
  TRUE_FALSE: "True or false",
  SCENARIO: "Scenario",
  PROCESS: "Process",
};

export const CARD_TYPE_BADGE: Record<FlashcardType, string> = {
  DEFINITION: "blue",
  FORMULA: "purple",
  IMAGE: "teal",
  DIAGRAM: "amber",
  FILL_IN_BLANK: "green",
  COMPARE_CONTRAST: "orange",
  TRUE_FALSE: "red",
  SCENARIO: "purple",
  PROCESS: "teal",
};

// ─── Authoring lint ─────────────────────────────────────────

const MAX_CARD_WORDS = 120;

export type CardLintIssue = { cardType: FlashcardType; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function requireText(
  payload: Record<string, unknown>,
  keys: string[],
  cardType: FlashcardType,
  issues: CardLintIssue[],
) {
  for (const key of keys) {
    if (!isString(payload[key]) || !payload[key].trim()) {
      issues.push({ cardType, message: `payload missing non-empty "${key}".` });
    }
  }
}

/** Returns human-readable issues; an empty array means the card is valid. */
export function lintFlashcard(
  cardType: FlashcardType,
  payload: unknown,
): CardLintIssue[] {
  const issues: CardLintIssue[] = [];
  if (!isRecord(payload)) {
    return [{ cardType, message: "payload must be a JSON object." }];
  }

  switch (cardType) {
    case "DEFINITION": {
      requireText(payload, ["term", "definition"], cardType, issues);
      const defWords =
        wordCount(payload.definition as string) +
        wordCount(payload.example as string) +
        wordCount(payload.term as string);
      if (defWords > MAX_CARD_WORDS) {
        issues.push({
          cardType,
          message: `definition is ${defWords} words — cards must be ≤ ${MAX_CARD_WORDS}.`,
        });
      }
      break;
    }
    case "FORMULA":
      requireText(payload, ["name", "latex"], cardType, issues);
      if (
        payload.variables !== undefined &&
        !Array.isArray(payload.variables)
      ) {
        issues.push({ cardType, message: "variables must be an array." });
      }
      break;
    case "IMAGE":
      requireText(payload, ["imageUrl", "answer"], cardType, issues);
      break;
    case "DIAGRAM":
      requireText(payload, ["svg"], cardType, issues);
      break;
    case "FILL_IN_BLANK": {
      requireText(payload, ["sentence"], cardType, issues);
      if (!isStringArray((payload as Record<string, unknown>).blanks)) {
        issues.push({ cardType, message: "blanks must be an array." });
      } else if (
        (payload.sentence as string)?.includes("___") !== true
      ) {
        issues.push({
          cardType,
          message: 'sentence must contain at least one "___" placeholder.',
        });
      } else if ((payload.blanks as Blank[]).length === 0) {
        issues.push({ cardType, message: "blanks cannot be empty." });
      }
      break;
    }
    case "COMPARE_CONTRAST":
      requireText(payload, ["itemA", "itemB"], cardType, issues);
      if (
        !isStringArray(payload.onlyA) ||
        !isStringArray(payload.onlyB) ||
        !isStringArray(payload.shared)
      ) {
        issues.push({
          cardType,
          message: "onlyA, onlyB and shared must be string arrays.",
        });
      }
      break;
    case "TRUE_FALSE":
      requireText(payload, ["statement"], cardType, issues);
      if (typeof payload.answer !== "boolean") {
        issues.push({ cardType, message: 'answer must be true or false.' });
      }
      break;
    case "SCENARIO":
      requireText(payload, ["scenario", "question", "answer"], cardType, issues);
      break;
    case "PROCESS": {
      requireText(payload, ["title"], cardType, issues);
      if (!isStringArray(payload.steps) || (payload.steps as string[]).length < 2) {
        issues.push({ cardType, message: "steps needs at least 2 steps." });
      }
      break;
    }
  }

  return issues;
}

// ─── Lesson → deck generation ───────────────────────────────

export type GeneratedCard = {
  cardType: FlashcardType;
  prompt: string;
  payload: FlashcardPayload;
  difficulty: AuthoredDifficulty;
};

export type GeneratedDeck = {
  title: string;
  description: string;
  cards: GeneratedCard[];
};

function shortLabel(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function conceptToCards(block: {
  title?: string;
  text: string;
  reveal?: string;
}): GeneratedCard {
  const term = block.title?.trim() || shortLabel(block.text, 40);
  const payload: DefinitionPayload = {
    term,
    definition: block.text,
    ...(block.reveal ? { example: block.reveal } : {}),
  };
  return { cardType: "DEFINITION", prompt: term, payload, difficulty: "BASIC" };
}

function checkToCard(block: {
  question: string;
  options: Record<string, string>;
  answer: string;
  explanation: string;
}): GeneratedCard {
  const answer = block.options[block.answer];
  const payload: ScenarioPayload = {
    scenario: block.question,
    question: "Which option is correct?",
    answer: answer ?? block.answer,
    explanation: block.explanation,
  };
  return {
    cardType: "SCENARIO",
    prompt: shortLabel(block.question, 40),
    payload,
    difficulty: "INTERMEDIATE",
  };
}

function mistakeToCard(block: { wrong: string; right: string }): GeneratedCard {
  const payload: TrueFalsePayload = {
    statement: block.wrong,
    answer: false,
    explanation: block.right,
  };
  return {
    cardType: "TRUE_FALSE",
    prompt: shortLabel(block.wrong, 40),
    payload,
    difficulty: "INTERMEDIATE",
  };
}

function mnemonicToCard(block: {
  phrase: string;
  encoded: string[];
}): GeneratedCard {
  const payload: DefinitionPayload = {
    term: block.phrase,
    definition: `"${block.phrase}" encodes:\n${block.encoded.join(", ")}`,
  };
  return {
    cardType: "DEFINITION",
    prompt: block.phrase,
    payload,
    difficulty: "BASIC",
  };
}

function exampleToCard(block: {
  problem: string;
  steps: string[];
  answer: string;
}): GeneratedCard {
  const payload: ScenarioPayload = {
    scenario: block.problem,
    question: "Solve it, then check your working.",
    answer: block.answer,
    explanation: block.steps.join("\n"),
  };
  return {
    cardType: "SCENARIO",
    prompt: shortLabel(block.problem, 40),
    payload,
    difficulty: "ADVANCED",
  };
}

function tipToCard(block: { text: string }): GeneratedCard {
  const payload: DefinitionPayload = {
    term: "Exam tip",
    definition: block.text,
  };
  return {
    cardType: "DEFINITION",
    prompt: "Exam tip",
    payload,
    difficulty: "BASIC",
  };
}

/** Derives flashcards from a lesson's blocks. Deterministic; each block → one card. */
export function generateCardsFromLesson(lesson: {
  title: string;
  blocks?: unknown;
}): GeneratedDeck {
  const blocks = parseBlocks(lesson.blocks);
  const cards: GeneratedCard[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "concept":
        cards.push(conceptToCards(block));
        break;
      case "check":
        cards.push(checkToCard(block));
        break;
      case "mistake":
        cards.push(mistakeToCard(block));
        break;
      case "mnemonic":
        cards.push(mnemonicToCard(block));
        break;
      case "example":
        cards.push(exampleToCard(block));
        break;
      case "tip":
        cards.push(tipToCard(block));
        break;
      default:
        break;
    }
  }

  return {
    title: `${lesson.title} — Cards`,
    description: `Spaced-repetition cards derived from the lesson "${lesson.title}".`,
    cards,
  };
}
