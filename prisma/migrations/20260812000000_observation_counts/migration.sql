-- AlterTable
ALTER TABLE "TopicMastery" ADD COLUMN     "accObservations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lessonObservations" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "srsObservations" INTEGER NOT NULL DEFAULT 0;

