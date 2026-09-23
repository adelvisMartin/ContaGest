-- 23/51 current hardening · inpatient vital projection uniqueness.
-- CareMeasurement remains the longitudinal measurement authority.
-- CareHospitalObservation remains the append-only hospitalization event authority.

CREATE UNIQUE INDEX IF NOT EXISTS "CareMeasurement_vet_treatment_observation_kind_unique"
  ON public."CareMeasurement" (
    "tenantId",
    (metadata->>'sourceObservationId'),
    "kind"
  )
  WHERE metadata->>'source'='veterinary-treatment-sheet'
    AND COALESCE(metadata->>'sourceObservationId','')<>'';
