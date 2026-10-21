# #814 · Tenant-safe veterinary diagnostic imaging references

**Observed risk:** `POST /veterinary/studies` created a CareDiagnosticStudy from a tenant-bound animal but accepted optional `encounterId` and `professionalId` without checking their tenant/patient. A known foreign ID could form an unauthorized clinical relation. `GET /studies` also joined patient and professional by ID alone.

**Correction:** the same server-side INSERT SELECT now requires any optional encounter to have `tenantId=$1` and `patientId=p.id`, and professional `tenantId=$1`. A no-row result is HTTP422 without foreign-tenant existence disclosure. List joins also match tenant. This does not create or amend notes, lab results, surgery, ledger or attachments.

**Verification:** `node --test tests/vet_diagnostic_study_scope_v814.test.mjs`. Still required: PostgreSQL17 2-tenant API/RBAC, historical orphaned data analysis, imaging results revision/signature/surgery/anesthesia/checklists, media IDOR tests, clinical/browser QA, release checks. `SOURCE_REUSE=NONE`. Rollback scoped source + test + doc.