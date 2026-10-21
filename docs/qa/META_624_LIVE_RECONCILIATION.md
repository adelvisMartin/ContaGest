# #624 — Live issue census and closeout guard (2026-10-21)

The primary `#624` META issue is historical and has a live reconciliation section. This code provides a **read-only**, locally reproducible view of a curated set of 44 original and derived children and release dependencies. It complements, not replaces, the canonical ordered execution backlog `#661`, the closure criteria of individual tickets, and the release GO/NO-GO `#669`.

## Run

From the repo root on Node.js 22:

```bash
node --test tests/meta_backlog_gate_v624.test.mjs
GITHUB_TOKEN="$GITHUB_TOKEN" node scripts/meta-backlog-gate-v624.mjs
```

`GITHUB_TOKEN` is optional for a public repository; for private access / rate limits, provide a minimal read-only GitHub token through the environment. The utility never prints its value or commits credentials. It fetches each named child via GitHub REST and reads `main` before/after the census to reject mixed-SHA snapshots. Inaccessible, missing or malformed GitHub issue records produce a nonzero exit rather than a fabricated closure.

## Interpretation

- `OPEN_CHILDREN`: some tracked issues are open; the parent META cannot close.
- `REVIEW_REQUIRED`: all tracked issues are closed on GitHub, but **not proof of material DoD**. Verify exact SHA, PostgreSQL 17, financial/tenant negative evidence, release gates, and owners before closure.
- `INVALID_SNAPSHOT`: missing/duplicate/unexpected issue, bad status or unbound SHA; never declare closure.
- `metaReadyForClosure` is always `false`: this diagnostic does not approve releases or close issues automatically.

The initial observed census on 2026-10-21 at `main@a0599059dfc74fd15d033df6bf021082291e1661` found 37 closed and seven open tracked children: `#637 #638 #647 #661 #669 #688 #720`. This is a **time-specific observation**, not the output of the new scanner (not executed against live GitHub in this container). New follow-up issues must be reviewed and added to `TRACKED_META_624_ISSUES`; a fixed list can never by itself prove complete scope.

## Safety and rollback

There are no database operations or app runtime changes, no destructive API calls, and no GH issue/branch mutations. Removing the scanner and test is a safe revert. Do not use administrative `CLOSED` status or unexecuted provider workflows as evidence that #624 is DONE.
