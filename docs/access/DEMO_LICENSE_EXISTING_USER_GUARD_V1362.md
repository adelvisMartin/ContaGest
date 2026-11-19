# #1362 — Demo license and reused-account guard (partial)

**Baseline:** `main@5cbd858803275f3033019a8977b38fb772333c71` (2026-11-19). **Owner:** #1362 (separate from device identity #1361).

## Verified by source and implemented in this focused patch

- `licenses.contracts.ts` now rejects `plan=trial` or `commercialUse=demostracion` license grants whose selected manifest routes carry `admin.manage` or `platform.*` permission. This uses the existing canonical ACCESS_MANIFEST; the client cannot bypass it by sending unchecked JSON. Normal, non-demo administrative licences keep the historical schema behavior.
- Creating a license for an existing non-system user no longer replaces `passwordHash`, mutates `fullName`, or silently changes `status` to active. A genuinely new user is provisioned as before. Existing system-role protection remains. Licence replacement and audit still use the existing transaction/authority.
- The API sends `temporaryPassword:null` for reused accounts; the account-holder's prior password is not disclosed or reset. The existing `LicensesPage` now correctly renders a **license-only** one-time secret instead of showing a fabricated temporary password and copy-text. The success message distinguishes reuse from creation.
- **Browser persistence exposure fixed:** `Store.update` previously saved all state, including one-time `licenseCredentials`, and `LicensesPage` also put the raw `licenseKey` and `temporaryPassword` into its durable `licenses` list. The shared persistence/import/export projection now removes `licenseCredentials` and any per-license `licenseKey`, `temporaryPassword` or `credentials` bundle, while preserving masked licence summaries. The UI keeps the temporary secret solely in its live in-memory render until dismissed/logout; hydration from older snapshots also strips legacy exposed values. Regressions test both values and Store wiring. This does **not** establish that compromised browsers/clipboard are secure; expiry and purge controls still need physical testing.
- Three runtime Zod contract cases in `backend/src/modules/licenses/licenses.contracts.test.ts` are included in the backend test glob, plus two presentation/source regression assertions in authoritative `tests/access_license_policy_issue_698.test.mjs`.

## Explicitly not certified (P0 product gaps)

This patch **does not** implement an owner-level invitation state machine, independent Gym/Vet client ownership permissions, a guardian/patient read-only portal, client-specific data scopes, offline expiry invalidation or a backend licence gate at every protected endpoint. The existing `assignTrialRole` uses broad `gym.manage`/`health.manage` and `reports.view` permissions; a license for Gym/Vet is therefore **not** evidence of safe end-user patient/fitness visibility. Those are material #1362 AC blockers; do not expose private client portals or publish the mobile demo from this patch alone.

Do not infer tenant scope from licence module checkboxes or UI route hiding. Future work must first map existing patient/guardian↔animal and gym member/beneficiary ownership to authenticated principals, then enforce tenant+relationship+module+RBAC+device checks **in API and DB**, with A/B tenant and same-tenant different-client negatives. Use canonical identity, licensing, entitlements, and financial modules; no duplicate authority.

**Test gate:** Node22 `npm ci`, backend typecheck and test, root authoritative contracts, build, QA browser at 360/390/430/768/1024/1440 light/dark with focus, keyboard and success/reused-user states, isolated PG17 A/B and expiry/revocation/seat concurrency tests, exact-SHA CI. NOT_EXECUTED until actually run.

**Risk/rollback:** Existing account issuance no longer resets a password; consumers expecting a new temporary password on renewal must handle `null` (updated UI path). Schema is unchanged; rollback by reverting this branch, noting that reverting would restore an unsafe password-reset behavior. Changes cannot be merged until all material P0 gates pass.
