import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('backend/prisma/migrations/20260827052000_issue_30_service_restriction_governance/migration.sql','utf8');
const routes=fs.readFileSync('backend/src/modules/commercial/service-restrictions.routes.ts','utf8');
const modules=fs.readFileSync('backend/src/modules/index.ts','utf8');
const service=fs.readFileSync('frontend/src/services/commercialService.js','utf8');
const enhancer=fs.readFileSync('frontend/src/services/commercialAccessEnhancer.js','utf8');
const backup=fs.readFileSync('ops/backup/contagest-public-tables.txt','utf8');

test('issue 30 creates a durable governed case ledger',()=>{
  assert.match(migration,/ServiceRestrictionCase/);
  for(const field of ['subscriptionId','reasonCode','scope','evidenceRef','actorId','openedAt','effectiveAt','noticeAt','cureDeadline','appealDeadline','resolvedAt']) assert.ok(migration.includes(`"${field}"`),`missing ${field}`);
  assert.match(migration,/evidence_required/);
  assert.match(migration,/review_separation/);
  assert.match(migration,/action_target_check/);
  assert.match(migration,/action_status_check/);
  assert.match(migration,/termination_reviewer/);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(backup,/^ServiceRestrictionCase$/m);
});

test('issue 30 database prevents concurrent active cases and rewrites of closed evidence',()=>{
  assert.match(migration,/ServiceRestrictionCase_one_active_per_subscription/);
  assert.match(migration,/WHERE "status" IN \('open','pending_review'\)/);
  assert.match(migration,/enforce_service_restriction_case_transition/);
  assert.match(migration,/service_restriction_case_already_closed/);
  assert.match(migration,/service_restriction_case_identity_is_immutable/);
  assert.match(migration,/ServiceRestrictionCase_transition_guard/);
});

test('issue 30 database independently enforces billing grace, cure and allowed reason/action policy',()=>{
  assert.match(migration,/enforce_service_restriction_case_open/);
  assert.match(migration,/billing_restriction_requires_past_due_subscription/);
  assert.match(migration,/billing_grace_period_not_elapsed/);
  assert.match(migration,/billing_notice_not_elapsed/);
  assert.match(migration,/contract_cure_deadline_not_elapsed/);
  assert.match(migration,/reason_code_not_allowed_for_subscription_suspension/);
  assert.match(migration,/reason_code_not_allowed_for_subscription_termination/);
  assert.match(migration,/ServiceRestrictionCase_open_guard/);
});

test('issue 30 governance router precedes legacy commercial routes and closes status bypasses',()=>{
  const governed=modules.indexOf("router.use('/commercial', serviceRestrictionRoutes)");
  const legacy=modules.indexOf("router.use('/commercial', commercialRoutes)");
  assert.ok(governed>=0&&legacy>governed);
  assert.match(routes,/endpoint genérico de estado fue retirado/);
  assert.match(routes,/Subscription\.status no puede modificarse por PATCH/);
  assert.match(routes,/no puede nacer suspendida, cancelada ni expirada/);
  for(const endpoint of ['/suspend','/reactivate','/terminate','/restriction-cases']) assert.ok(routes.includes(endpoint),`missing ${endpoint}`);
});

test('issue 30 enforces grace, original case, evidence and independent termination review',()=>{
  assert.match(routes,/graceUntil/);
  assert.match(routes,/caseId/);
  assert.match(routes,/expediente original/);
  assert.match(routes,/c\.actorId===userId/);
  assert.match(routes,/Segregación de funciones/);
  assert.match(routes,/pending_review/);
  assert.match(routes,/entity:'ServiceRestrictionCase'/);
  assert.match(routes,/restrictionCaseId/);
});

test('issue 30 UI uses structured case operations and a review-before-execute step',()=>{
  for(const method of ['restrictionCases','suspendSubscription','reactivateSubscription','terminateSubscription']) assert.ok(service.includes(`${method}(`),`missing ${method}`);
  assert.match(service,/transición genérica fue retirada/);
  for(const field of ['Motivo codificado','Alcance','Referencia de evidencia','Fecha efectiva']) assert.ok(enhancer.includes(field),`missing UI field ${field}`);
  assert.match(enhancer,/Revisa antes de ejecutar/);
  assert.match(enhancer,/segunda revisión/i);
  assert.match(enhancer,/data-governance-bound/);
});
