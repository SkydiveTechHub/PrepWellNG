-- Papers retired by an empty wallet rather than a permanent cause.
--
-- classifyStatus used to fold "Insufficient credit" into the same terminal
-- class as a revoked key, so drawOnce wrote FAILED and both ensureQuestionsCached
-- and saturate then refused to look at the filter again.
--
-- drawCount is deliberately preserved, exactly as resetFailedFetch does: a
-- filter that failed on its ninth draw must not receive twelve fresh ones.
-- startedAt is backdated past the lease window so the next caller draws
-- immediately rather than mistaking the reset for an in-flight claim.
UPDATE "ProviderFetch"
SET
  "status"      = 'PENDING',
  "error"       = NULL,
  "completedAt" = NULL,
  "startedAt"   = now() - interval '5 minutes'
WHERE "status" = 'FAILED'
  AND "error" ILIKE '%insufficient credit%';
