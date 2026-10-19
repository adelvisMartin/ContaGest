-- #832 / critical: the original Care tables granted authenticated DML and
-- relied only on tenant RLS. A direct Supabase client could therefore skip
-- backend clinical signature, appointment and privacy authorization.
-- Preserve backend runtime and trusted service privileges; the browser uses
-- the authenticated ContaGest API, not raw public Care table access.
DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'CareProfessional','CarePatient','CareAppointment','CareEncounter',
    'CareMeasurement','CarePrescription','CareConsent','CareImmunization',
    'CareLabOrder','CareLabResult','CareDiagnosticStudy',
    'CareHospitalization','CareHospitalObservation','CareProcedure',
    'CareCommunicationLog'
  ] LOOP
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
        EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',table_name,role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;
