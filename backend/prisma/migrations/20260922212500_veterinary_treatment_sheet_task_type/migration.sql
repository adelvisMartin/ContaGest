ALTER TABLE public."CareHospitalObservation"
  DROP CONSTRAINT IF EXISTS "CareHospitalObservation_type_check";

ALTER TABLE public."CareHospitalObservation"
  ADD CONSTRAINT "CareHospitalObservation_type_check"
  CHECK ("type" IN ('vitals','medication','feeding','fluid','procedure','note','task'));
