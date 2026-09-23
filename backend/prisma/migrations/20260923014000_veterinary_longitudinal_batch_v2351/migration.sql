-- 23/51 follow-up · retry-safe atomic veterinary vital batches.
-- CareMeasurement remains the only longitudinal measurement authority.

CREATE UNIQUE INDEX IF NOT EXISTS "CareMeasurement_vet_batch_kind_unique"
  ON public."CareMeasurement" (
    "tenantId",
    "patientId",
    (metadata->>'batchId'),
    "kind"
  )
  WHERE metadata->>'source'='veterinary-longitudinal-record'
    AND COALESCE(metadata->>'batchId','')<>'';
