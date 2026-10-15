import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fromRoot = (p) => fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration = fromRoot('backend/prisma/migrations/20261015035000_hipico_report_share_links/migration.sql');
const store = fromRoot('backend/src/modules/hipico/report-share.store.ts');
const routes = fromRoot('backend/src/modules/hipico/report-share.routes.ts');
const app = fromRoot('backend/src/app.ts');
const rlsScript = fromRoot('backend/scripts/hipico-report-share-rls-v1000.mjs');
const manualWorkflow = fromRoot('.github/workflows/hipico-report-share-links.yml');
const policy = fromRoot('backend/src/modules/hipico/report-share-policy.ts');

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


test('consolidated group ledger never manufactures absent financial categories',()=>{
  assert.match(store,/export async function readHipicoConsolidatedShare\(/);
  assert.match(store,/share\.audience !== 'group'/);
  assert.match(store,/LIMIT \$\{CONSOLIDATED_PAGE_SIZE\} OFFSET \$\{offset\}/);
  assert.match(store,/COUNT\(DISTINCT participant_code\)/);
  assert.match(store,/position\(\$\{needle\} in lower\(participant_code\)\) > 0/);
  assert.match(store,/entry_type='settlement'/);
  assert.match(store,/original\.entry_type='settlement'/);
  assert.match(store,/original\.owner_id=e\.owner_id/);
  assert.match(store,/unavailableColumns: \['available','refund','deposit','withdrawal','transfer','aval'\]/);
  assert.match(store,/amountUnit: 'minor'/);
  assert.match(store,/isolationLevel: 'RepeatableRead'/);
  assert.equal((store.match(/LIMIT 1 FOR SHARE/g)||[]).length,2,'both report paths must lock capability before ledger projection');
});

test('new public consolidation view fails closed on malformed scope and preserves no-cache CSP',()=>{
  assert.match(routes,/view !== undefined && view !== 'consolidated'/);
  assert.match(routes,/consolidatedQuerySchema\.safeParse/);
  assert.match(routes,/if \(!data\) return publicFailure\(res\)/);
  assert.match(routes,/htmlConsolidated\(data,nonce,token\)/);
  assert.match(routes,/style-src 'nonce-/);
  assert.match(routes,/No disponible|no disponibles en este ledger/);
  assert.doesNotMatch(routes,/\beval\s*\(/);
});

test('report sharing remains opt-in and cannot issue or read by default',()=>{
  assert.match(policy,/HIPICO_REPORT_SHARES_ENABLED === 'true'/);
  assert.match(routes,/reportSharingEnabled/);
  assert.match(routes,/HIPICO_REPORT_SHARES_DISABLED/);
  assert.match(routes,/if \(!isEnabled\(\)\) return res\.status\(503\)/);
});

test('isolated PG17 RLS evidence script refuses remote or production databases before loading pg',()=>{
  assert.match(rlsScript,/validateIsolatedDatabaseUrl/);
  assert.match(rlsScript,/HIPICO_SHARE_RLS_CONSENT/);
  assert.match(rlsScript,/HIPICO_SHARE_RLS_DATABASE_URL/);
  assert.match(rlsScript,/\^\\/hipico_share_test_/);
  assert.match(rlsScript,/\.hostname/);
  assert.match(rlsScript,/await import\('pg'\)/);
  assert.match(rlsScript,/SET LOCAL ROLE contagest_runtime/);
  assert.match(rlsScript,/FOREIGN_OWNER_INSERT_DENIED/);
  assert.match(rlsScript,/FOREIGN_OWNER_REVOKE_DENIED/);
  assert.match(rlsScript,/TRANSACTION_LOCAL_OWNER_RESET/);
  assert.doesNotMatch(rlsScript,/DROP DATABASE|DELETE FROM public\.hipico_money_ledger_entries/);
});

test('quota-saving specialist workflow only runs manually but keeps all material checks available',()=>{
  assert.match(manualWorkflow,/workflow_dispatch:/);
  assert.doesNotMatch(manualWorkflow,/^\s+pull_request:|^\s+push:/m);
  for (const instruction of ['npm ci','typecheck','report-share.routes.test.ts',
    'hipico_report_share_schema_contract.test.mjs',
    'hipico_report_share_rls_guard_v1000.test.mjs',
    'hipico-report-share-rls-v1000.mjs']) assert.ok(manualWorkflow.includes(instruction),instruction);
});
