# Relational Normalization & Constraints Audit — #633

## Purpose

#633 adds a reproducible relational inventory for the complete ContaGest application schema. It does not normalize by dogma and does not mutate production. The audit consumes the PostgreSQL schema produced by the canonical #632 database gate and records structure, ownership and prioritized findings for every public application table.

Baseline for this implementation: `main@3295bdeb7add7b0962f549887287606f7448993d`.

## Canonical flow

Preferred execution is through a PostgreSQL 17 local/isolated environment already prepared by #632:

```powershell
node scripts/relational-normalization-audit-v633.mjs
```

When `DATABASE_URL` is already present, it must point to the same loopback ephemeral database contract accepted by #632 (`*_e2e`, `*_drill` or `*_restore`). When it is absent, the script reuses #630's ephemeral lifecycle and executes #632 first before introspection. Production is never used for destructive QA.

The audit reads only PostgreSQL catalog metadata (`pg_class`, `pg_attribute`, `pg_constraint`, `pg_index`, defaults and constraint definitions). It never selects application rows, so manifests contain no PII or business data.

## Inventory contract

`config/relational-normalization-v633.json` is the reviewable policy for:

- expected application-table coverage (`113` at the #633 baseline);
- bounded-context ownership rules;
- known external/polymorphic identifiers that must not be converted blindly into FKs;
- known implicit local relations requiring follow-up;
- historical/regulated table patterns where `ON DELETE CASCADE` deserves lifecycle review;
- natural-key review candidates;
- remediation issue mapping for every P0/P1 category currently emitted.

For every table, the generated manifest records:

- owner/bounded context and the rule that assigned it;
- columns, type, nullability and defaults;
- primary key;
- foreign keys including referenced columns and `ON DELETE/UPDATE`;
- UNIQUE constraints;
- CHECK constraints;
- indexes and indexed column order;
- JSON/JSONB columns;
- tenant column and whether it has a physical FK;
- created/updated/soft-delete or status lifecycle signals;
- classified findings and remediation issue.

Artifacts are written to:

- `artifacts/relational-normalization-v633/<exact-sha>/manifest.json`
- `artifacts/relational-normalization-v633/<exact-sha>/report.md`

The manifest hash is deterministic for the same candidate and schema; explicit temporal metadata is excluded from the digest.

## Finding policy

The stable catalog remains:

`MISSING_FK | WEAK_UNIQUE | MISSING_CHECK | ORPHAN_RISK | DENORMALIZED_AUTHORITY | DERIVED_DATA_DRIFT | JSON_OVERUSE | CASCADE_RISK | INDEX_GAP | OWNERSHIP_AMBIGUOUS`.

The automated layer intentionally emits only findings that can be supported structurally without inventing business rules:

- `MISSING_FK` P1 for tenant columns without FK and explicitly classified local `*Id` relations;
- `INDEX_GAP` P1 when an FK has no leading supporting index;
- `CASCADE_RISK` P1 on ledger/audit/fiscal/legal historical surfaces;
- `WEAK_UNIQUE` P2 for review when a configured natural-key candidate is not protected;
- `JSON_OVERUSE` P2 only above the configured JSON threshold;
- `OWNERSHIP_AMBIGUOUS` P2 if a new table falls through to the fallback owner.

`MISSING_CHECK`, `DENORMALIZED_AUTHORITY` and `DERIVED_DATA_DRIFT` are not fabricated from weak heuristics. They remain available for explicit rules when a concrete invariant is known.

The command fails if table coverage differs from policy or if any P0/P1 finding lacks a remediation issue.

## Read-only production observations on 2026-09-29

A catalog-only inspection of Supabase project `soxzatxiwlfsvtblrqal` confirmed 113 public tables and no table without a primary key. This inspection is context/evidence only; the repository + #632 ephemeral schema remains the authority for the reproducible gate.

Material observations were separated instead of changing production inside #633:

- tenant/local relation integrity, including `BankMovement.tenantId` and `InventoryMovement.tenantId`: #634;
- explicit local `*Id` relations without physical FK, including `BankMovement.ledgerEntryId` and `CareCommunicationLog.templateId`: #683;
- FK supporting-index gaps observed at `budgetwallet_purchase_events.owner_id` and `budgetwallet_security_events.owner_id`: #684;
- historical cascade policy for audit/ledger/fiscal/legal surfaces: #685.

This satisfies the #633 rule that P0/P1 integrity debt has either a correction in scope or an explicit owner/ticket. No destructive DDL is introduced by the audit itself.

## JSON and intentional denormalization

JSON/JSONB is not considered a defect by default. It is acceptable for open-ended integration payloads, settings, analytics/audit evidence and provider metadata where the payload is not the relational authority. Structured domain entities, tenant ownership, financial posting relationships and referentially significant identifiers must remain relationally protected rather than hidden in JSON.

The manifest records JSON columns so future tickets can challenge each use with evidence. Only tables crossing the configured review threshold receive `JSON_OVERUSE` P2; that is a review signal, not an automatic migration request.

## Regression coverage

`tests/relational_normalization_audit_v633.test.mjs` locks:

- deterministic owner classification;
- all 113 baseline tables mapped to an explicit owner rule;
- tenant missing-FK classification to #634;
- FK index-gap classification to #684;
- external-ID false-positive prevention;
- historical cascade classification to #685;
- exact table coverage;
- P0/P1 remediation ownership;
- deterministic manifest hashing;
- catalog-only introspection with no application-row reads.

Any future table addition must update both the canonical migration chain and this ownership/coverage policy deliberately.
