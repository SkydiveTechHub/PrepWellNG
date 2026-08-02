-- Objective outcome for graded card types (fill-in-the-blank / true-false).
-- Lets measured retention weight by the objective self-check where present.

-- AlterTable
ALTER TABLE "FlashcardReviewLog" ADD COLUMN "objectiveCorrect" BOOLEAN;
