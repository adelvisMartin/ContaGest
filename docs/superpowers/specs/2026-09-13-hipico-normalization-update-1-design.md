# Control Hípico Normalization Update 1 — Design

## Goal

Promote only the missing, already-reviewed Control Hípico capabilities onto the current `main` baseline without replaying historical branches or reverting newer repository hardening.

## Baseline and authorities

- Baseline authority: `main@dc8b3d86e1ea29cf9509a9e52e688e4947c16d9d`.
- Messaging/#284 is already an ancestor of `main`; it is not replayed in this update.
- Agent/Command Center authority: `integration/hipico-platform-2-green@57716ce1ffa9b648bea1308635893c4440aa9430`, including the #333 production hardening.
- AnyDoc/Archify authority: only the 42-file delta of PR #325, never the complete historical #314/#325 tree.
- Current `main` wins on unrelated changes and on newer hardening.

## Reconciliation rules

1. Start from current `main`; never merge a historical feature branch wholesale.
2. Overlay only paths that are absent from `main` or whose desired delta is explicitly reviewed.
3. Agent/Command Center paths that changed on `main` after the common base are merged semantically: Android sync, backend package scripts, Style Guide, Hípico HTML and Service Worker.
4. AnyDoc/Archify `hipico-data-engines.yml` is merged semantically with the newer provider/lifecycle workflow already in `main`.
5. `backend/src/app.ts` must preserve the current canonical routes and add both Agent/Command Center and Bridge document routes exactly once.
6. `SOURCE` remains read-only/SHADOW; no automatic monetary authority is introduced.
7. `financialAuthority=false` remains invariant for agents, providers and documents.
8. Hosted OCR remains opt-in; local extraction is attempted first.

## Validation

The candidate must be compared directly to the frozen baseline. Validation includes source-scope review, TypeScript/source contracts when executable, Bridge document tests, Agent/Command Center contracts, deterministic PDF 2000-case campaign, build where available, GitHub commit checks/workflow inspection and Vercel preview if one is produced for the exact SHA.

`runner_id=0`/empty steps is `BLOCKED_INFRASTRUCTURE`, not PASS or code failure. Physical QA #119 and soak #120 are not closed by this update.

## Merge and issue policy

Open one PR to `main`. Merge only with the exact reviewed head SHA and only after no executed required gate is failing. External/non-executed gates remain explicitly classified. Do not close #119/#120. #284/#288/#289 are only closed when their own acceptance criteria and evidence are defensible after promotion; otherwise they remain for their dedicated updates.
