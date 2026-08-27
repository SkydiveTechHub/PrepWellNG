-- AlterTable
ALTER TABLE "Flashcard" ADD COLUMN     "sourceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Flashcard_deckId_sourceKey_key" ON "Flashcard"("deckId", "sourceKey");
