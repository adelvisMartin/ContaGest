import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fromRoot = (p) => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration = fromRoot('backend/prisma/migrations/20261015035000_hipico_report_share_links/migration.sql');
const store = fromRoot('backend/src/modules/hipico/report-share.store.ts');
const routes = fromRoot('backend/src/modules/hipico/report-share.routes.ts');
const app = fromRoot('backend/src/app.ts');

test('migration stores a unique hash only, enables owner-scoped RLS and revocation',()=>{
  assert.match(migration,/token_hash CHAR\(64\) NOT NULL UNIQUE/i);
  assert.doesNotMatch(migration,/\btoken_plain\b|\braw_token\b/i);
  assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/FORCE ROW LEVEL SECURITY/);
  assert.match(migration,/current_setting\('hipico\.report_owner_id', true\)/);
  assert.match(migration,/REVOKE ALL PRIVILEGES.*FROM PUBLIC/);
  assert.match(migration,/TO contagest_runtime/);
  assert.match(migration,/revoked_at TIMESTAMPTZ/);
  assert.match(migration,/audience='participant'.*participant_code IS NOT NULL/);
});

test('reports can only use canonical ledger and owner/group/participant checks',()=>{
  assert.match(store,/FROM public\.hipico_money_ledger_entries/g);
  assert.match(store,/owner_id=\$\{ownerId\}::uuid AND group_key=\$\{groupKey\}/);
  assert.match(store,/participant_code=\$\{participantCode\}/);
  assert.match(store,/shareAllowed\(share, now\)/);
  assert.match(store,/set_config\('hipico\.report_owner_id'/);
  assert.doesNotMatch(store,/UPDATE\s+public\.hipico_money_ledger_entries|INSERT INTO\s+public\.hipico_money_ledger_entries/i);
  assert.doesNotMatch(store,/service_role|SECRET_KEY|SUPABASE_SERVICE_ROLE/);
});

test('public response is read-only and does not disclose the owner or expose operator token in HTML',()=>{
  assert.match(routes,/Cache-Control', 'private, no-store/);
  assert.match(routes,/Referrer-Policy', 'no-referrer/);
  assert.match(routes,/X-Robots-Tag', 'noindex/);
  assert.match(routes,/frame-ancestors 'none'/);
  assert.match(routes,/operatorTokenValid/);
  assert.match(routes,/validateReportToken/);
  assert.match(routes,/htmlReport\(data, nonce, token\)/);
  assert.doesNotMatch(routes,/fetch\(|window\.open|XMLHttpRequest/);
});

test('express mounts link endpoint before operator-only canonical Hípico routers',()=>{
  const share=app.indexOf("app.use('/api/v1/hipico/report-shares'");
  const canonical=app.indexOf("    hipicoCanonicalRoutes");
  assert.ok(share>0&&canonical>share);
  assert.match(app,/authRateLimit, mutationRateLimit, hipicoReportShareRoutes/);
});
