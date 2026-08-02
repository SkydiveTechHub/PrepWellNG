-- Flashcards (Spaced Repetition System)
-- Adds decks, cards, per-student scheduling state, review history, and enrollment.
-- See docs/superpowers/specs/2026-08-01-flashcards-design.md

-- CreateEnum
CREATE TYPE "FlashcardType" AS ENUM ('DEFINITION', 'FORMULA', 'IMAGE', 'DIAGRAM', 'FILL_IN_BLANK', 'COMPARE_CONTRAST', 'TRUE_FALSE', 'SCENARIO', 'PROCESS');

-- CreateEnum
CREATE TYPE "FlashcardSource" AS ENUM ('AUTHORED', 'LESSON', 'AI');

-- CreateEnum
CREATE TYPE "FlashcardState" AS ENUM ('NEW', 'LEARNING', 'REVIEW', 'RELEARNING');

-- CreateEnum
CREATE TYPE "ReviewRating" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateTable
CREATE TABLE "FlashcardDeck" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "source" "FlashcardSource" NOT NULL DEFAULT 'AUTHORED',
    "subjectId" TEXT,
    "topicId" TEXT,
    "lessonId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashcardDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardType" "FlashcardType" NOT NULL,
    "prompt" TEXT,
    "payload" JSONB NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'INTERMEDIATE',
    "tags" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardReview" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "state" "FlashcardState" NOT NULL DEFAULT 'NEW',
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "intervalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "retention" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlashcardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardReviewLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "flashcardId" TEXT NOT NULL,
    "rating" "ReviewRating" NOT NULL,
    "responseTimeMs" INTEGER,
    "scheduledDays" DOUBLE PRECISION,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlashcardEnrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardDeck_lessonId_source_key" ON "FlashcardDeck"("lessonId", "source");

-- CreateIndex
CREATE INDEX "FlashcardDeck_subjectId_idx" ON "FlashcardDeck"("subjectId");

-- CreateIndex
CREATE INDEX "FlashcardDeck_topicId_idx" ON "FlashcardDeck"("topicId");

-- CreateIndex
CREATE INDEX "Flashcard_deckId_orderIndex_idx" ON "Flashcard"("deckId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardReview_studentId_flashcardId_key" ON "FlashcardReview"("studentId", "flashcardId");

-- CreateIndex
CREATE INDEX "FlashcardReview_studentId_dueAt_idx" ON "FlashcardReview"("studentId", "dueAt");

-- CreateIndex
CREATE INDEX "FlashcardReview_studentId_state_idx" ON "FlashcardReview"("studentId", "state");

-- CreateIndex
CREATE INDEX "FlashcardReviewLog_studentId_reviewedAt_idx" ON "FlashcardReviewLog"("studentId", "reviewedAt");

-- CreateIndex
CREATE INDEX "FlashcardReviewLog_studentId_flashcardId_reviewedAt_idx" ON "FlashcardReviewLog"("studentId", "flashcardId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FlashcardEnrollment_studentId_deckId_key" ON "FlashcardEnrollment"("studentId", "deckId");

-- CreateIndex
CREATE INDEX "FlashcardEnrollment_deckId_idx" ON "FlashcardEnrollment"("deckId");

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardDeck" ADD CONSTRAINT "FlashcardDeck_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "FlashcardDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReview" ADD CONSTRAINT "FlashcardReview_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReviewLog" ADD CONSTRAINT "FlashcardReviewLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardReviewLog" ADD CONSTRAINT "FlashcardReviewLog_flashcardId_fkey" FOREIGN KEY ("flashcardId") REFERENCES "Flashcard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardEnrollment" ADD CONSTRAINT "FlashcardEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlashcardEnrollment" ADD CONSTRAINT "FlashcardEnrollment_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "FlashcardDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
