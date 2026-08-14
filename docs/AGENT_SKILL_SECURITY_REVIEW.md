# External agent skill supply-chain review

External agent instructions are code-adjacent supply-chain inputs: they can influence what files an agent edits, what commands it runs and what it considers acceptable. ContaGest therefore treats them as untrusted until reviewed.

## Controls
1. Full 40-character commit pins; no `main`, tag or `latest` in the skill lock.
2. Explicit allowlist of files to synchronize.
3. No upstream shell/Node/Python scripts are executed by `skills:sync`.
4. SHA-256 manifest for the materialized vendor cache.
5. Project wrappers have higher precedence than external guidance.
6. Design sources cannot override AppSec, accessibility, tenant isolation, accounting correctness or legal gates.
7. Taste Skill is explicitly experimental; it is inspiration, not a source of security or compliance truth.
8. Impeccable and Emil command names are namespaced conceptually to avoid ambiguous `animate`/`audit` behavior.
9. Updates require a dedicated branch and human diff review.
10. Never place secrets, production credentials, database URLs, client records or medical data inside prompts/vendor skill files.

## ERP security additions
The appsec wrapper requires review of tenant escape, IDOR, RBAC escalation, Prisma/raw SQL, PostgREST/RLS, cookie/session lifecycle, license/device replay, immutable RIF rules, subscription bypass, audit-log integrity, closed-period accounting mutation, backup/restore and health-data exposure.

## MCP boundary
Playwright MCP grants a client browser-control capability. Use it only against intended URLs and test identities. Do not configure production passwords or database secrets inside `.mcp.json`. Keep authentication in the browser/session or approved secret store. Destructive production tests remain prohibited.
