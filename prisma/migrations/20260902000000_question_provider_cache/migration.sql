-- Question provider cache. Purely additive: no existing table is altered.

CREATE TYPE "QuestionProvider" AS ENUM ('SDASH');
CREATE TYPE "ProviderFetchStatus" AS ENUM ('PENDING', 'SATURATED', 'FAILED');
CREATE TYPE "ProviderQuestionStatus" AS ENUM ('PENDING', 'PROMOTED', 'REJECTED');

CREATE TABLE "ProviderFetch" (
    "id" TEXT NOT NULL,
    "provider" "QuestionProvider" NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "status" "ProviderFetchStatus" NOT NULL DEFAULT 'PENDING',
    "subjectId" TEXT,
    "examType" "ExamType",
    "examYear" INTEGER,
    "drawCount" INTEGER NOT NULL DEFAULT 0,
    "rawCount" INTEGER NOT NULL DEFAULT 0,
    "newInLastDraw" INTEGER NOT NULL DEFAULT 0,
    "promotedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "ProviderFetch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderFetch_provider_cacheKey_key" ON "ProviderFetch"("provider", "cacheKey");
CREATE INDEX "ProviderFetch_subjectId_examType_examYear_idx" ON "ProviderFetch"("subjectId", "examType", "examYear");

CREATE TABLE "ProviderQuestion" (
    "id" TEXT NOT NULL,
    "fetchId" TEXT NOT NULL,
    "provider" "QuestionProvider" NOT NULL,
    "providerQuestionId" TEXT,
    "fingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ProviderQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReasons" JSONB,
    "mapperVersion" INTEGER NOT NULL DEFAULT 1,
    "questionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    CONSTRAINT "ProviderQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderQuestion_questionId_key" ON "ProviderQuestion"("questionId");
CREATE UNIQUE INDEX "ProviderQuestion_fetchId_providerQuestionId_key" ON "ProviderQuestion"("fetchId", "providerQuestionId");
CREATE UNIQUE INDEX "ProviderQuestion_fetchId_fingerprint_key" ON "ProviderQuestion"("fetchId", "fingerprint");
CREATE INDEX "ProviderQuestion_status_mapperVersion_idx" ON "ProviderQuestion"("status", "mapperVersion");

ALTER TABLE "ProviderQuestion" ADD CONSTRAINT "ProviderQuestion_fetchId_fkey" FOREIGN KEY ("fetchId") REFERENCES "ProviderFetch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderQuestion" ADD CONSTRAINT "ProviderQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProviderCatalogue" (
    "id" TEXT NOT NULL,
    "provider" "QuestionProvider" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "examYear" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderCatalogue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderCatalogue_provider_subjectId_examType_examYear_key" ON "ProviderCatalogue"("provider", "subjectId", "examType", "examYear");
CREATE INDEX "ProviderCatalogue_examType_examYear_idx" ON "ProviderCatalogue"("examType", "examYear");

ALTER TABLE "ProviderCatalogue" ADD CONSTRAINT "ProviderCatalogue_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
