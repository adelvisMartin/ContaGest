# Control Hípico — Threat Model & Abuse Cases (#114)

## Scope

This threat model covers the complete Control Hípico trust chain:

```text
operator / participant input
        ↓
PWA / APK WebView
        ↓
local storage / IndexedDB / Service Worker
        ↓
Supabase Auth + RPC/RLS / backend
        ↓
Bridge local process + browser profile
        ↓
WhatsApp SOURCE (read-only) / LAB (write target during shadow)
        ↓
logs, spool, support bundle, release artifacts
```

The model is defensive. It does not authorize destructive penetration testing of WhatsApp or third parties.

## Protected assets

- participant/workspace data;
- race/day lifecycle history;
- monetary ledger and balances;
- shadow predictions and actuals;
- authentication tokens and refresh tokens;
- WhatsApp browser/session credentials;
- pinned SOURCE/LAB identities;
- audit trail and correlation IDs;
- release/signing artifacts;
- backup/export contents.

## Trust boundaries

### TB-01 PWA/APK → backend/Supabase

The client is untrusted. Roles/tenant/workspace authorization cannot depend on DOM, local flags or `user_metadata`. Production sensitive capabilities require authoritative RPC/RLS and fail closed when absent (#116).

### TB-02 browser storage → authenticated workspace

Cached/private state must be scoped to the authenticated workspace and removed/invalidated on logout/workspace switch. Stale/offline data cannot become monetary authority (#115).

### TB-03 WhatsApp SOURCE → parser/domain

All message text, sender labels, reply metadata and DOM attributes are attacker/untrusted input. A message can propose evidence, never bypass state machines or commit money merely because it parsed (#107/#108).

### TB-04 Bridge → WhatsApp LAB

SOURCE and LAB must have distinct pinned IDs. Every LAB write revalidates exact destination identity. SOURCE has no composition/send path (#110).

### TB-05 local spool → replay

Spool records are untrusted persisted input after restart/upgrade. Schema/parser/destination mismatch must quarantine, not auto-send (#112).

### TB-06 diagnostics → support/operator

Logs/support artifacts are potential exfiltration channels. Export is allow-listed, redacted and hashable (#113).

### TB-07 build/release → installed client

PWA/APK version, compatibility set and artifact SHA must be verifiable. Secrets/signing material stay outside source/artifacts (#118).

## Threat register

| ID | Threat | Boundary | Severity | Required control | Owner |
| --- | --- | --- | --- | --- | --- |
| T-01 | user changes client metadata/role | TB-01 | CRITICAL | app_metadata/backend authority + RLS | #116 |
| T-02 | tenant/workspace horizontal access | TB-01 | CRITICAL | restrictive owner/workspace RLS + negative matrix | #116 |
| T-03 | missing RPC silently falls back to table | TB-01 | HIGH | `HIPICO_RPC_REQUIRED`; LAB-only opt-in fallback | #116 |
| T-04 | XSS via message/name/result | TB-01/TB-03 | HIGH | no unescaped hostile data in HTML sinks; CSP | #114 |
| T-05 | WhatsApp session/cookie theft from diagnostics | TB-04/TB-06 | CRITICAL | profile never exported; central redaction | #113/#114 |
| T-06 | SOURCE/LAB spoof/misrouting | TB-04 | CRITICAL | pinned distinct IDs + exact revalidation | #110 |
| T-07 | replay/duplicate creates second effect | TB-03/TB-05 | CRITICAL | source-message idempotency + state/ledger unique keys | #107/#108/#112 |
| T-08 | legacy queue sends after upgrade | TB-05 | HIGH | schema quarantine + explicit preview/dry-run | #112 |
| T-09 | stale offline balance shown/used as live | TB-02 | HIGH | stale state + conflict/sync policy | #115 |
| T-10 | support/log leak of token/phone/JID/signed URL | TB-06 | HIGH | central recursive redaction + allow-list | #113 |
| T-11 | malicious dependency/postinstall/supply chain | TB-07 | HIGH | lockfiles, audits, no unpinned operational tooling | #114/#118 |
| T-12 | service-role bundled into PWA/APK | TB-01/TB-07 | CRITICAL | static release gate; server-only secret | #114/#116 |
| T-13 | unauthorized balance recovery/restore | TB-01/TB-02 | CRITICAL | ledger authority + restore validation/reconciliation | #108/#117 |
| T-14 | Service Worker caches private API response across user | TB-02 | HIGH | asset allow-list; API/private no-store | #115 |
| T-15 | CSP/service worker downgrade enables script injection | TB-02/TB-07 | HIGH | CSP + versioned SW/update gate | #114/#115/#118 |

## Abuse-case suite

### Authorization

1. User A authenticates normally.
2. Client-side `user_metadata.role` is changed to `admin`.
3. Expected: role remains operator and sensitive RPC/RLS still rejects unauthorized resources.

1. User A requests workspace/profile belonging to B by manipulating URL/body/ID.
2. Expected: deny/no rows; no leakage through error detail.

1. Required RPC returns 404/PGRST202.
2. Expected in pilot/production: `HIPICO_RPC_REQUIRED`; no direct table request.

### Injection/XSS

Hostile strings must be treated as text, not markup/script:

- `<img src=x onerror=alert(1)>`;
- `<svg/onload=...>`;
- quotes/backticks in participant names;
- Unicode bidi/zero-width/homoglyph text;
- oversized labels/messages;
- `javascript:` links.

Any dynamic HTML sink receiving unescaped participant/message data is a HIGH finding.

### WhatsApp session/group abuse

- DOM wrapper includes fake/extra `@g.us` ID;
- visible chat title matches LAB but pinned ID differs;
- SOURCE and LAB config resolve to same ID;
- user manually changes visible chat immediately before send;
- session/profile expired or wrong account.

Expected: fail closed; no fallback destination.

### Replay/idempotency

- same source message repeated;
- same event after restart;
- settlement replayed twice;
- reversal repeated;
- legacy parser/schema spool appears after update.

Expected: no second monetary effect/LAB send; incompatible queue quarantined.

### Diagnostics/privacy

Insert synthetic token, phone, full group JID, signed URL, cookie/session key into health/log fixture. Expected: exported support bundle contains none of the raw values.

## Promotion rule

Any unresolved `CRITICAL` or `HIGH` finding makes production promotion **NO-GO**. A green build or high parser accuracy cannot override that rule.

Findings are recorded with:

- ID;
- severity;
- affected boundary/path;
- reproducible evidence;
- owner/ticket;
- remediation;
- verification status.

## Current dependency state

- #107/#108 establish state/ledger integrity foundations.
- #110 establishes SOURCE/LAB guard rails.
- #113 adds redacted support diagnostics.
- #116 removes user-metadata privilege trust and production direct-table fallback.
- #115/#117/#118 must complete offline, restore and distribution boundaries before release.

This document is not a statement that physical/session/tenant tests have already passed. Runtime tests must remain bound to the exact candidate SHA.
