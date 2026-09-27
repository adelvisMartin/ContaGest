# Production Security Boundary Matrix · v73

Issue: #546  
Scope: server authority, tenant/owner isolation, uploads, providers and agent tools.  
Rule: controls fail closed; frontend state is never authorization evidence.

| Boundary | Adversarial attack | Expected control | Executable evidence |
|---|---|---|---|
| Tenant | tenant A → tenant B via path/body/query/header | authenticated tenant must equal requested tenant | `production-boundaries.test.ts` tenant A/B |
| Owner | owner A requests owner B resource | owner scope must match authenticated owner when owner is present | `production-boundaries.test.ts` owner mismatch |
| Hípico group | QA attempts SOURCE side effect | SOURCE is read-only; only linked LAB is writable in autonomous QA | `hipico-autonomous-runtime.test.ts` |
| Hípico finance | prompt/tool attempts monetary authority | agent/LLM always `financialAuthority=false`; ledger/domain authority remains server-side | `production-boundaries.test.ts`, #545 |
| Agent tools | unallowlisted tool / cross-tenant args | explicit tool allowlist + recursive tenant/owner scope inspection | `production-boundaries.test.ts` |
| Provider URL | localhost, metadata, RFC1918, hostile host, DNS rebinding | HTTPS + host allowlist + public-IP DNS resolution before fetch | `production-boundaries.test.ts`; `assertProviderUrlResolvesPublic` |
| Upload path | `../`, slash/backslash, NUL | basename-only untrusted names | `production-boundaries.test.ts` |
| Upload content | spoofed MIME / archive / oversized body | magic-byte sniffing + declared MIME equality + 20 MiB cap + ZIP denied by default | `production-boundaries.test.ts` |
| Audit log | secrets/prompts/tokens in metadata | recursive redaction while preserving actor/scope/correlation/result | `production-boundaries.test.ts` |
| Webhook replay | duplicate immutable provider id | persistent dedupe + replay integrity | existing Hípico webhook/bridge replay tests |
| Outbound replay | two workers / lost ACK | atomic claim; ambiguous delivery requires reconciliation; no blind resend | #545 runtime + tests |
| Raw SQL | unsafe dynamic SQL | classified/audited SQL boundary | #544 existing gate |
| Auth/RBAC/RLS | UI bypass or forged IDs | server auth/RBAC and DB policies remain authoritative | existing auth/RLS suites; no client-side authority added here |
| Password recovery | forged/expired recovery session | Supabase recovery flow remains fail-closed | #267 existing implementation |
| Supply chain | secret/dependency/action drift | dedicated SBOM/secret/dependency gate | #550 (ordered follow-up) |

## Production rules

1. Every externally supplied tenant/owner/group/race identifier is data, never authority.
2. A provider URL is not fetchable until both static allowlist validation and DNS public-address validation pass. Redirects must be revalidated at every hop by callers.
3. Upload storage remains private; this module validates ingress content but does not grant public storage access.
4. ZIP/archive extraction is denied by default. A future archive pipeline must impose compressed/uncompressed size, entry-count and recursion limits before enabling it.
5. Agent output is advisory evidence. Tool execution requires an allowlisted tool, server-derived scope and `financialAuthority=false`.
6. Audit metadata must contain actor, tenant/scope, action, result and correlation ID, but credentials, raw prompts and tokens are redacted.
7. GitHub Actions for this operational batch is `NOT VERIFIED / NON-BLOCKING`; no green status is inferred.

## Residual ownership

- Supply-chain/SBOM/secrets/actions pinning is intentionally owned by ordered ticket #550 rather than duplicated here.
- Physical/browser attack execution remains release-QA evidence, not a reason to weaken these server guards.
