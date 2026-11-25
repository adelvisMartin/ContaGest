---
name: sic-qa-release
description: Verify repository-specific commands, release gates, negative tests and exact-SHA evidence.
---
Read existing CI and commands. Run applicable lint, typecheck, unit, integration, build, runtime and physical checks. Isolate DB/fixtures; preserve hooks; do not bypass checks. Record exit code, logs, artifact hash, baseline and final SHA. Review diff, secrets, permissions, migration and rollback. Missing tools or runner = BLOCKED. Do not merge on failed/pending required checks.
