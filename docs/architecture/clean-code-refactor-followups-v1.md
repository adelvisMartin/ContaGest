# #622 Residual structural follow-ups

The first #622 refactor batch intentionally avoids changing authorization/licensing semantics.

## P1 · frontend composition-root access policy

`frontend/src/app.js` currently replaces `AccessControlService.canAccessRoute` at runtime to combine role access with active-license and QA-client rules. The #622 audit classifies that as `BOUNDARY_VIOLATION` because the composition root owns policy logic instead of wiring an explicit policy service.

Required follow-up: characterize every branch of the current behavior (core route, role denial, normal client license, expired license, QA client, module allowlist), extract the policy behind an explicit service/runtime boundary, and prove the public navigation behavior is unchanged. Do not weaken RBAC or license checks while refactoring.
