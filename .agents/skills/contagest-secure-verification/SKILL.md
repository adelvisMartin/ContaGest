# ContaGest Secure Verification

Project-owned review gate for ContaGest-VE and Control Hípico. It adapts publicly documented code-review/TDD ideas after manual inspection. No third-party executable skill, hook, MCP integration or remote installer is trusted automatically.

## Threat model for changes

Review every change for:
- hardcoded secrets, private keys, bearer tokens or service-role credentials;
- authorization bypass or UI-only access assumptions;
- SQL/command/template injection;
- XSS from user/chat/imported content;
- unsafe redirects, path traversal and arbitrary file handling;
- SSRF or unrestricted external API proxying;
- missing server-side validation;
- uncontrolled rate/cost amplification;
- cross-tenant data exposure;
- stale PWA/service-worker caches;
- dependency/postinstall/supply-chain behavior;
- monetary or irreversible automation without an approval gate.

## Review protocol

### 1. Contract
State what behavior must remain unchanged and what behavior is intentionally changed.

### 2. Static security
Search changed files for dangerous secret names and sinks. Confirm external API keys stay server-side. Validate query/body length, enum/range constraints, destination allowlists and output encoding.

### 3. Authorization
Verify backend authorization/RLS remains authoritative. Frontend navigation may reveal an allowed module but may never manufacture backend privilege.

### 4. Tests
Use RED → GREEN → REFACTOR where a deterministic regression can be expressed. Add characterization tests around routing, guards, parsing, calculations, state migration and cache rules.

### 5. Browser/PWA
Test direct URL, refresh, back/forward, installed PWA, service-worker update, light/dark, mobile/desktop and offline where relevant. Confirm no accidental horizontal overflow or hidden actions.

### 6. External integrations
For USDA/Meta/Supabase/other providers:
- use official documented endpoints;
- keep secrets server-side;
- cap request size and result count;
- use timeouts/caching/backoff appropriate to the provider;
- handle provider failure without corrupting local/domain state;
- never silently fall back to invented external data.

### 7. WhatsApp automation
Shadow mode is the default for new classifiers/agents. Monetary, result, settlement and balance actions require review until measured evidence supports promotion. A kill switch and audit trail are mandatory before autonomous production sending.

### 8. Release evidence
Record separately:
- code review complete;
- static tests executed/not executed;
- build status;
- browser/E2E status;
- preview deployment SHA;
- production SHA only after merge.

CRITICAL/HIGH security findings block merge. Missing runner/browser evidence is `BLOCKED/NOT EXECUTED`, never rewritten as success.
