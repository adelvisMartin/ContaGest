-- 18/51 · Odontología: lifecycle clínico explícito.
-- CareEncounter agrega estado 'review' para Borrador -> Revisión -> Firmado.
ALTER TABLE public."CareEncounter"
  DROP CONSTRAINT IF EXISTS "CareEncounter_status_check";

ALTER TABLE public."CareEncounter"
  ADD CONSTRAINT "CareEncounter_status_check"
  CHECK ("status" IN ('draft','review','signed','amended','cancelled'));
