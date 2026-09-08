CREATE TYPE "ProviderCircuitState" AS ENUM ('OK', 'EXHAUSTED', 'BLOCKED');

CREATE TABLE "ProviderState" (
    "provider" "QuestionProvider" NOT NULL,
    "state" "ProviderCircuitState" NOT NULL DEFAULT 'OK',
    "cooldownUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creditsRemaining" INTEGER,

    CONSTRAINT "ProviderState_pkey" PRIMARY KEY ("provider")
);
