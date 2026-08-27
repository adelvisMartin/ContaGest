# Bridge observability quick reference

- `npm run diagnostic:status` — human/automation friendly live/degraded/down status.
- `npm run healthcheck` — readiness gate with non-zero exit when not ready.
- `npm run support:bundle -- --sha=<candidate>` — write-once redacted support bundle with manifest/hashes.

Never copy the browser profile, `.env`, cookies, QR/session databases or raw spool into support artifacts.
