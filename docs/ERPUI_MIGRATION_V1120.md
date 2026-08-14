# ContaGest-VE ERPUI Migration Gate v11.20

## Scope of this batch

This batch continues the v11.19 design-system migration without changing fiscal/accounting formulas or replacing the legacy compatibility layer in one destructive step.

### Veterinary workspace

- Native browser date/datetime pickers were removed from the veterinary workflow and replaced by controlled day/month/year/time fields aligned with the ERP density.
- Selectors display the human-readable pet/professional name first and reduce technical identifiers to a short secondary reference.
- Veterinary dialogs preserve entered data on backdrop clicks and Escape; drafts are discarded only through Cancel or the explicit close button.
- Pet records can be edited and safely archived. Archiving preserves clinical history.
- Appointments can be edited and removed. Appointments with clinical or communication references are cancelled/archived instead of hard-deleted; unreferenced appointments may be deleted.
- The appointment create/edit flow validates patient, start/end order and reason before writing.

### Shell/header

- The topbar and sidebar use the same ContaGest logo asset.
- BCV is a compact status element rather than a dominant KPI; source text progressively collapses on narrow viewports.
- The BCV refresh action remains explicit.
- The user control includes an explicit chevron and the settings panel is positioned above content with its own scroll boundary.
- At constrained widths the command search yields space before rate/account controls can overlap.

### API resilience

Production still defaults to the integrated same-origin `/api/v1`. If a stale custom API URL in browser storage causes a network-level fetch failure, the client clears that obsolete override and retries once against same-origin. Authentication cookies and CSRF behavior remain unchanged.

## Compatibility boundary

`frontend/src/styles/erp-system.css` remains the canonical authored stylesheet. Historical CSS remains in lower cascade layers until each affected module passes characterization and browser QA; this batch does not pretend those compatibility files are physically deleted.

## Remaining migration queue

The next high-risk UI batches remain: accounting/fiscal workflows, QR/scanner camera flows, delivery map sizing/geolocation, POS/order touch workflows, and the admin/license/profile sub-sections. These must be migrated behind their own characterization and browser gates rather than by broad markup replacement.

## Gate

Static regressions were added in `tests/veterinary_header_v1120.test.mjs`. The Vercel preview must compile successfully before merge. Browser/device QA remains required for final visual acceptance on phone, tablet and desktop; a production build alone is not evidence of pixel-perfect behavior.
