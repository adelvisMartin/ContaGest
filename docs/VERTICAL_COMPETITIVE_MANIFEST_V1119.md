# ContaGest-VE Vertical Competitive Manifest v1

## Scope

This manifest defines the product direction for sector-specific workspaces without copying proprietary interfaces or making unsupported medical/clinical claims. Public product documentation is used only to identify common workflow expectations. ContaGest keeps its own ERP architecture, multi-tenant controls, roles, licensing, accounting, inventory, audit and security boundaries.

## Psychology / private practice

### Current ContaGest capability

- patient/contact directory for scheduling;
- appointment creation;
- daily/weekly workload signals;
- confirmation state;
- upcoming reminders;
- Google Calendar draft links;
- email and WhatsApp confirmation links;
- operational confirmation/no-show indicators;
- private clinical notes intentionally excluded from browser-local storage.

### Competitive benchmark themes

Modern private-practice platforms commonly combine online appointment requests, calendar sync, configurable reminders, client onboarding/intake, secure client portals/messaging, telehealth, documentation and payments. The next ContaGest increments should therefore prioritize scheduling quality and client communication before attempting clinical AI.

### Planned increments

P1: recurring appointments, reschedule/cancel workflow, waiting list, practitioner availability, room/resource blocking, appointment-state actions and reminder queue.

P1: consent/intake workflow with server-side protected storage and auditable access.

P2: Google Calendar OAuth sync from backend, email delivery service and official WhatsApp template/webhook integration.

P2: patient self-booking/approval portal with availability rules.

P3: secure clinical workspace only after privacy, consent, access logging, retention and export rules are defined. No diagnostic recommendation engine is part of the scheduling MVP.

## Veterinary practice

### Current ContaGest capability

- pet/tutor records;
- professionals and appointment agenda;
- clinical encounters/history;
- prescriptions and consent;
- laboratory orders/results;
- diagnostic studies;
- hospitalization and observations;
- procedures/surgery tracking;
- communication log and WhatsApp/email appointment actions;
- inventory/purchases/accounting available through ERP modules.

### Competitive benchmark themes

Veterinary PIMS products emphasize fast scheduling, online booking, preventive-care reminders, structured records, integrated diagnostics, communication, billing/inventory and analytics. Some newer products also use AI for history summaries, live scribing and discharge drafting, but clinician review remains a required product boundary for ContaGest.

### Planned increments

P1: online booking request workflow with professional/resource availability and approval.

P1: preventive recall engine for vaccinations, rechecks, medication/lab monitoring and missed follow-up.

P1: pre-registration/check-in for tutors plus no-show/reschedule workflow.

P2: resource scheduler for rooms, cages, equipment and procedures.

P2: pet-parent portal for appointments, invoices, vaccine history and approved documents.

P3: AI-assisted history summary or discharge draft only as editable drafts, with source traceability and explicit professional confirmation. No autonomous diagnosis or treatment recommendation.

## Fitness — personal trainer / coach

### Current ContaGest capability

- members and trainer assignments;
- plans/memberships;
- manual, QR, barcode and NFC check-ins;
- assessments and measurements;
- training routines with sets/reps/rest;
- nutrition plans/macros/meals;
- class scheduling;
- payments endpoint/service;
- coaching/retention operational signals.

### FitAI Pro capabilities worth adapting

- reusable workout generation for 2–6 days;
- exercise logging with load, sets, reps and RIR;
- exercise library grouped by muscle targets;
- measurement/weight history;
- recipe/nutrition library;
- coach-to-client workflow and WhatsApp sharing;
- deterministic local fallback when AI is unavailable.

### Competitive benchmark themes

Coach platforms increasingly combine workouts, nutrition, habits, messaging, progress and AI-assisted workout drafts, while gym-management platforms focus on memberships, recurring billing, scheduling/waitlists, check-in/access, CRM, retention, staff and multi-location operations.

### Planned increments

P1 Coach: workout execution log with kg/sets/reps/RIR, progression history and adherence score.

P1 Coach: reusable exercise library, program templates/phases and habit tracking for steps, water, cardio and recovery.

P1 Admin: class bookings/waitlists, renewal queue, failed-payment recovery state, lead/prospect pipeline and retention/churn signals.

P2 Coach: recipe/meal library, client messaging timeline and scheduled coach reminders.

P2 AI: coach-in-the-loop workout draft generator using goals, experience, restrictions, equipment and recent performance. AI output is always a draft that the trainer reviews before assignment; deterministic templates remain available as fallback.

P2 Admin: multi-location/resource model and staff/instructor performance analytics.

## Dentistry

### Product position

Dentistry should be its own workspace under the health domain rather than a cosmetic clone of general clinic. Common dental-practice systems combine scheduling, patient communication, records/charting, forms, billing/collections, imaging, treatment-plan presentation and analytics.

### Planned architecture

P1: dental patient agenda, practitioner/chair/resource scheduling, recall/reminder workflow, intake/consent and estimates/payments tied to the ERP.

P2: treatment-plan workflow, procedure catalog, tooth/odontogram data model and document attachments after a dedicated schema review.

P2: dental KPI layer for appointments, chair utilization, production/collection and recall completion.

P3: imaging connectors and any clinical AI only after vendor/API, security, consent and professional-review contracts are defined. No fake imaging AI, diagnostic model or unsupported odontogram is to be shipped as a placeholder.

## Cross-vertical platform rules

1. Reuse global calendar, communications, payment, audit, document and access-control services.
2. Keep vertical-specific data isolated by tenant and permission boundary.
3. Never expose provider credentials/API keys to the browser.
4. External-calendar/email/WhatsApp automation must run through authorized backend integrations.
5. AI-generated clinical or coaching content is draft/support material, never silently posted as a professional decision.
6. Do not store sensitive clinical narratives in browser-local storage.
7. Use the global typography, theme, i18n and responsive contracts; verticals may change semantic color tokens only.
8. Every new vertical capability must declare required permissions, persistence model, audit events and device/browser QA before production.
