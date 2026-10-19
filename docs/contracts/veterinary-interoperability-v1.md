# Veterinary interoperability v1 — bounded contract (issue #820)

Status: **partial, informational contract only**. The provider-neutral signed-webhook/inbox/outbox authority remains #772. This document does not authorize inbound writes, public patient lookup, or autonomous AI decisions.

## Export resource mapping

| Portable type | ContaGest authority | Veterinary-specific semantic note |
| --- | --- | --- |
| `AnimalPatient` | `CarePatient(kind=animal)` | Species, breed, microchip and guardian are not human `Patient` fields. |
| `GuardianContact` | Guardian fields on `CarePatient`; portal grants in `VeterinaryGuardianPortalGrant` | A contact is **not** automatically a verified owner or a consent grant. |
| `Appointment` | `CareAppointment` | Preserve clinical status verbatim; do not synthesize service completion. |
| `Immunization` | `CareImmunization` | Vaccine, lot, dose, administered date, next due date; this is **not** an official certificate. |
| `Encounter` | `CareEncounter` | Confidential sections require separate access policy; portal does not release clinical notes. |
| `LaboratoryResult` | `CareLabOrder` / `CareLabResult` | Vendor-neutral name/code; never map veterinary reference ranges to human ranges. |
| `DiagnosticStudy` | `CareDiagnosticStudy` | Attachments must be served through canonical signed-media authority; raw source paths are not a portable download contract. |
| `FinancialBalance` | `VeterinaryFinancialCase` / `SalesInvoice` | Tenant-scoped invoice authority; estimates must not be labelled as paid balances. |

Contract metadata for a future authorized export: `{schema:"contagest.veterinary.v1", source:{tenantId, generatedAt}, resources:[...]}`. `sourceRecordId` is local to the exporting tenant; importers must dedupe using a scoped origin identifier + source revision and must first support dry-run/conflict reporting. Do not place a portal bearer token or any internal signed-media token in exports.

## Permission and delivery boundaries

- The existing guardian portal uses a SHA-256 token digest, expiry and revoke; an explicit `vaccines` scope reveals only non-private vaccine fields and never internal notes or attachment paths. Existing grants do not gain the new scope automatically.
- There is no webhook endpoint for veterinary data under this work. #772 must supply verified signature, signed timestamp window, replay identity, durable inbox/outbox, dead-letter recovery and idempotent ordering before an external adapter is enabled.
- AI-generated text, if later offered, must include model/provenance, source references, an `assistive_only` marker and a human review action. It must not update diagnosis, prescription, vaccine or clinical authority autonomously.
- Hard prerequisites before completion: test portal authorization against revoked, expired, wrong tenant/patient grants; secured media URLs; PostgreSQL 17; browser/a11y; versioned import/export with dry-run, provenance and deterministic replay; external webhook contract tests.
