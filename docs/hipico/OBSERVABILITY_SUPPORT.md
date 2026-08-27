# Control Hípico — Observability & Support Contract (#113)

## Objective

Provide enough operational evidence to answer **what failed, since when, in which component/version/SHA and with which correlation ID** without copying the WhatsApp browser profile or exposing unnecessary PII/secrets.

## Structured event contract

`src/observability.mjs` is the canonical diagnostics primitive for the Bridge. A structured row contains:

- timestamp;
- level;
- component;
- version;
- candidate/build SHA;
- correlation ID;
- event name;
- human-safe message;
- redacted structured data.

Correlation IDs are identifiers for one diagnostic flow, not authentication tokens.

## Central redaction

The central policy removes or masks:

- bearer credentials;
- token/secret/cookie/authorization/session/password/service-role/API-key fields;
- signed URLs containing security query parameters;
- phone-like values;
- complete WhatsApp group JIDs.

Redaction is applied recursively. Diagnostics must not work around this policy by manually copying raw browser/session data to support artifacts.

## Health model

`npm run healthcheck` reads the runtime `health.json` and returns an explicit state:

- `live`: fresh health, source send guard valid, readiness true and required dependencies healthy;
- `degraded`: process is live but readiness/dependency/backlog conditions need attention;
- `down`: stale/missing health or a critical invariant (for example SOURCE send guard) is invalid.

The health output includes operational metrics derived from counters where available: captured, parsed, ambiguous, LAB sent, pending, failures, latency and backlog age.

A stale/old queue is observable as `BACKLOG_OLD`; a LAB/backend/browser/source failure must not be collapsed into a generic “offline” label.

## Backlog and spool diagnostics

`inspectSpoolHealth()` reports event queue count, LAB mirror queue count, dead letters and oldest queued age. A dead letter or queue older than the configured threshold is a warning condition.

This module intentionally does not replay or mutate queue records. Replay ownership remains #112.

## Log size

`rotateFileIfNeeded()` supplies bounded log rotation. It rotates only after the configured maximum size and retains a bounded numbered history. Runtime wiring should call it before/after append according to the logging adapter; support artifacts must never depend on an unbounded raw logfile.

## Support bundle

Run:

```bash
npm run support:bundle -- --sha=<candidate-sha>
```

Optional explicit target:

```bash
npm run support:bundle -- --sha=<candidate-sha> --out=<empty-directory>
```

Only this allow-list can be copied:

- `health.json`;
- `retry-state.json`;
- `dom-diagnostic.json`;
- bounded redacted tail of `bridge.log`.

The bundle never includes by default:

- Chrome/Edge/WhatsApp profile files;
- cookies/local storage/session databases;
- QR data;
- `.env`;
- tokens;
- spool payload contents;
- screenshots;
- training journal;
- full phone numbers/group IDs.

The destination is write-once per generated bundle. Existing target files are not silently overwritten.

`manifest.json` records schema version, component, runtime version, SHA, redaction policy, file sizes and SHA-256 per exported file. The CLI also prints the manifest hash.

## Diagnostic flow

1. Read `healthcheck` state.
2. Use the correlation ID from the failing flow when available.
3. Inspect only redacted/structured logs.
4. Generate a support bundle when escalation is needed.
5. Verify manifest hashes before/after transfer.
6. Keep SOURCE read-only and do not “diagnose” by enabling production sends.

## QA contract

`tests/observability.test.mjs` proves:

- recursive secret/PII/JID redaction;
- structured fields include version/SHA/correlation ID;
- live/degraded/down health classification;
- backlog/failure metrics;
- bounded rotation;
- allow-listed support export;
- support file hashes;
- non-allow-listed session material is rejected;
- an existing bundle destination is not silently overwritten.

## Remaining runtime evidence

The code contract can be reviewed and tested offline. Release evidence still requires the candidate SHA to run the bridge for long enough to demonstrate real backlog age, log rotation and session health. The 24–72h soak evidence is owned by #120; this ticket must not fabricate that runtime evidence.
