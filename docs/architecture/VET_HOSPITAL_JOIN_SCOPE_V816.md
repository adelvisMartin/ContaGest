# #816 · Hospitalization read-model tenant joins

**Risk:** List endpoint was already scoped by CareHospitalization.tenantId but used ID-only joins for the linked CarePatient and observation count. Incorrectly associated or legacy duplicate IDs could expose another tenant's species/name or inflate the patient's observation evidence.

**Scoped fix:** append `p.tenantId=h.tenantId` and `o.tenantId=h.tenantId` to the patient and observation joins. Professional already uses this boundary. Keeps GROUP BY, filters, results and writes unchanged. No new admissions, medications, kennel allocations, bed occupancy, discharge, lab, payments or schema.

**Next:** PostgreSQL17 real two-tenant with mismatched/orphan synthetic records, privilege/RLS tests, eventual bed concurrency/med-admin idempotency, append-only rounds and state guard, mobile/browser. `SOURCE_REUSE=NONE`. Test `node --test tests/vet_hospital_join_scope_v816.test.mjs`. Rollback limited to source test/docs.