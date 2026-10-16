# #1011 — Independent WhatsApp Messenger SOURCE AUTO-READ NO-GO

## Scope and authority

This increment enforces the existing owner-approved policy profile: **normal consumer WhatsApp Messenger**, private recreational group, **no money or economic effects**, no Business/Cloud/Groups API selected. Automatic reading of the real group, **as well as automated sending**, remains BLOCKED until explicit official platform authorization and a reviewed transport/capability decision exist. A recreational/non-monetary purpose does not automatically authorize group scraping.

Do not weaken existing `SOURCE_AUTO_REPLY_POLICY_NO_GO` (#1015). This is a distinct gate, `SOURCE_AUTO_READ_POLICY_NO_GO`, which requires a separate reviewed authorization decision before any code change could allow reading. **No environment flag, shadow mode, fake policy receipt, generic adapter or CLI switch enables real SOURCE access.** `SOURCE_AUTO_READ_POLICY_NO_GO` never returns a successful decision.

## Entrypoints actually protected

The new gate is called unconditionally at module evaluation **before** local profile/spool creation, Chromium/Edge launch, web.whatsapp.com navigation, remote network requests, or source ingestion:

- `src/index.mjs` — primary Bridge runner, including shadow-local mode;
- `src/history-v130.mjs` — legacy history backfill and source spool;
- `src/live-v130.mjs` — legacy live capture;
- `src/capture-group-ids.mjs` — interactive group metadata capture;
- `src/server-runner.mjs` — rejects before spawning the main Bridge child;
- `src/preflight.mjs` — cannot claim READY on a policy-forbidden real runtime.

The `source:policy` diagnostic remains safe to run: it reports independent `sourceReadPolicy: { eligible:false, status: 'NO_GO', ... }` and returns exit code 2 to indicate an **unready real-source runtime**. No private phone numbers, group IDs or token material appear in the read-policy status.

Synthetic/offline LAB domain unit tests and manual preparation of user-authored responses remain available; **do not use a real WhatsApp profile to run LAB tests**. There is no automatic browser-based Messenger reading/sending in this permitted scope. A manual operator may review, edit and copy/share text through ordinary user-controlled UI; this patch does **not** implement that manual UX.

## Executed verification and limits

On a full checked-out branch:

```sh
cd tools/hipico-whatsapp-web-bridge
npm run check
node --test tests/source-read-policy-v1011.test.mjs
npm test
npm run source:policy
```

Expected `source:policy`: prints safe JSON and returns **2** (NO_GO); success exit would misstate eligibility. Existing launch/start/history/capture/preflight commands must fail without ever opening WhatsApp or creating SOURCE message spools.

Focused test asserts the pure gate and checks that the explicit top-level denial appears before browser/storage/network operations on all six launch paths, with negative mutation detecting a deleted guard. These static contract checks do not prove arbitrary future subprocesses outside the enumerated entrypoints cannot access WhatsApp. Review new scripts before accepting them.

Real WhatsApp login/QR, SOURCE group reads, WhatsApp DOM, group message capture, and physical group E2E **must not be executed** without policy approval. Full backend/postgres/browser/cross-device QA remains separately gated. This patch does not alter money/ledger or Hípico core service data. Source-only rollback is reverting the new module/tests/docs and seven entrypoint/config edits; retain the existing send NO-GO.

## Release gate / ownership

Keep issue #1011 **OPEN**: platform policy/capability and owner consent review, manual edit/preview/copy UX, documentation matrix, security/QA evidence and official policy decision are not all complete. `#837` and `#839` remain NO-GO for real SOURCE automation; LAB synthetic only. Disabling GitHub Actions or skipping a required security check does not authorize reading the group or constitute test PASS.
