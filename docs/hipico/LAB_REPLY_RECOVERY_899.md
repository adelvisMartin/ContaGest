# #899 · LAB reply recovery after backend commit / lost HTTP

## Authority and constraints
The source of truth remains `HipicoResponseReceipt` (#152) plus the existing
canonical channel/transport persistence. **SOURCE is read-only** (#728). No
financial/domain command is created, no new WhatsApp transport is introduced,
and the LAB browser's durable `lab-test-reply-journal` remains the **only**
delivery acknowledgement authority.

## Nominal recovery
1. Inbound pinned LAB message is validated and persisted by `/bridge/events`.
2. Conversation, AppSec, handoff and canonical race query produce a safe response.
3. `HipicoResponseReceipt` is written first; an eligible non-financial reply
   is snapshotted in the *same receipt row* before HTTP 202.
4. When HTTP 202 is lost **before** the local journal `prepare`, the Bridge
   retries the same immutable message identity. The backend discovers the
   previous receipt. It verifies scope fingerprint, policy, short expiry, text
   hash, safety/handoff and fresh canonical data digest, then returns that
   candidate without running domain commands.
5. The Bridge still uses `prepare → sending → confirmed`; an ambiguous
   Enter is never retried automatically, only reconciled with a visible tag.

## Gates
- 90-second maximum replay window; SHA-256 scope digest contains channel,
  group, sender JID, message ID, timestamp and a digest of message content.
- Only bounded static greetings/help or explicitly authorized read-only race
  queries can be cached. Offers, saldos, results asserted by a participant,
  corrections, settlements and any financial commands cannot qualify.
- A changed race/provisional/official result invalidates the full canonical
  read digest; an unavailable/ambiguous query, operator takeover, AppSec
  flag, duplicate rate limit or changed policy holds the reply.
- An unrecoverable duplicate produces `LAB_REPLAY_REVIEW_REQUIRED` in the
  Bridge's redacted operational log and never publishes automatically.
- Text is short-lived **for reuse**; expired snapshots are cleared from DB
  opportunistically (100 per inbound eligible snapshot). A scheduled cleanup
  job is still required for hard wall-clock retention during prolonged idle.

## Deployment/rollback
Migration: `backend/prisma/migrations/20261012142500_hipico_lab_response_recovery/migration.sql`.
It adds nullable fields and bounded CHECK constraints to an existing response
receipt. Schema must be deployed before code. On rollback, disable the replay
code path first; the added nullable columns can remain until a coordinated
retention cleanup. Do not drop receipts/audit history.

## Verification status
New pure policy/unit + source-boundary regressions are included. Still required:
- `npm ci`, backend typecheck and `npm run test:hipico` on candidate SHA;
- ephemeral isolated PostgreSQL with migration, lost-HTTP/restart fault
  injection, two send workers and forced handoff/stale-result scenarios;
- Chromium, Windows LAB physical QA (#119), 24-hour soak (#120), and exact-SHA
  CI required checks.

No source-group send, official WhatsApp capability or 24-hour uptime is implied
by a source-level implementation.
