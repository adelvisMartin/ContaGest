# ContaGest-VE Security Baseline v11.16

## Purpose

This baseline turns the four practical controls requested for AI-assisted application development into repository gates without replacing working business behavior.

## 1. Do not expose API keys

- Server-only secrets stay in backend environment variables.
- `.env`, `frontend/.env` and `backend/.env` are ignored by Git.
- `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `JWT_SECRET`, `WHATSAPP_CLOUD_TOKEN` and `LICENSE_HASH_SECRET` must never be referenced by frontend code.
- Public/anonymous client credentials are not equivalent to server secrets; nevertheless they still require Row Level Security / server authorization where applicable.
- `scripts/security-audit.mjs` blocks obvious committed private keys/tokens and server-secret names leaking into frontend source.

## 2. Validate every untrusted input

Current backend already uses Zod `safeParse` through `validateBody`. The security rule is:

1. client validation for fast UX feedback;
2. server validation as the actual trust boundary;
3. authorization and tenant/RIF checks after parsing;
4. encode/escape output according to its sink.

Frontend validation alone is never considered a security control.

## 3. Authentication

ContaGest is not a new greenfield login form: it already has backend sessions, HttpOnly cookie support, refresh, CSRF, MFA/coordinate-card flows, tenant switching, licensing and access-control contracts. Replacing it abruptly with a different identity provider would be a breaking security migration.

Decision for v11.16:
- preserve the current authenticated contracts;
- keep production secret gates, CSRF, CORS, rate limiting and tenant isolation;
- evaluate Supabase Auth/Auth0/Google OIDC as a dedicated migration ADR before replacing the current identity boundary;
- never create a second parallel home-grown auth path.

A future IdP migration must map tenant, role, license and MFA semantics and include rollback tests before production cutover.

## 4. Rate limits

Existing controls:
- global request limiter;
- stricter authentication limiter;
- suspicious-request guard;
- cross-site unsafe-method protection;
- CSRF protection for cookie sessions.

These are CI-asserted by the baseline audit so accidental removal fails the workflow.

## Additional controls already present

- Helmet security headers.
- CORS allowlist.
- HSTS in production.
- `frameguard: deny` / anti-clickjacking.
- `nosniff` and restrictive permissions policy.
- mandatory explicit production JWT/license secrets.
- API responses marked `no-store`.

## CSP follow-up

The frontend currently carries legacy inline CSS and third-party font/icon sources, so a strict nonce/hash CSP should be introduced in report-only mode first, violations audited, and then enforced. Do not switch directly to a strict production CSP until the remaining inline styles have been migrated.

## CI gate

Run:

```bash
node scripts/security-audit.mjs
```

The workflow `.github/workflows/security-baseline.yml` executes the same check on feature branches, pull requests and main.
