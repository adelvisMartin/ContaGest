import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('Control Hipico remains outside the ERP module catalog',()=>{
  const catalog=read('frontend/src/data/moduleCatalog.js');
  assert.doesNotMatch(catalog,/hipico-control|control-hipico/i);
  const adr=read('docs/architecture/PRODUCT_BOUNDARIES_CONTAGEST_HIPICO.md');
  assert.match(adr,/productos independientes/i);
});

test('recovered runtime is hash-pinned and path traversal protected',()=>{
  const manifest=JSON.parse(read('products/hipico-control/runtime/v1.13.0-rc1/manifest.json'));
  assert.equal(manifest.product,'control-hipico');
  assert.equal(manifest.version,'1.13.0-parity.1');
  assert.match(manifest.sha256,/^[a-f0-9]{64}$/);
  const restore=read('scripts/restore-hipico-runtime.mjs');
  assert.match(restore,/expectedSha256/);
  assert.match(restore,/Path traversal bloqueado/);
  assert.match(restore,/destinationPath\.startsWith\(destinationRoot\)/);
});

test('Hipico migration contains no ERP Fitness tables',()=>{
  const sql=read('backend/prisma/migrations/0014_v1126_hipico_bot/migration.sql');
  assert.match(sql,/HipicoWebhookEvent/);
  assert.match(sql,/HipicoBotOutbox/);
  assert.doesNotMatch(sql,/Fitness/i);
});

test('bot retains canonical monetary review gates and atomic provider dedupe',()=>{
  const service=read('backend/src/modules/hipico-bot/hipico-bot.service.ts');
  const classifier=read('backend/src/modules/hipico-bot/hipico-operational-classifier.ts');
  assert.match(service,/classify as classifyOperational/);
  assert.match(service,/classifyIncoming\(message\)/);
  assert.match(classifier,/MONETARY_REVIEW_GATE/);
  assert.match(classifier,/autoEligible:false/);
  assert.match(service,/ON CONFLICT \("providerMessageId"\) DO NOTHING RETURNING/);
  assert.match(service,/mode==='automatic'&&persistent&&outboxStatus==='ready_auto'/);
  assert.match(service,/SAFE_AUTOMATIC\.has\(result\.intent\)/);
  assert.match(service,/AbortSignal\.timeout\(10_000\)/);
});

test('webhook raw body is captured before browser CSRF while operator route has auth rate limit',()=>{
  const app=read('backend/src/app.ts');
  const webhookMount=app.indexOf("app.use('/api/v1/hipico-bot', hipicoWebhookRoutes)");
  const csrf=app.indexOf('app.use(csrfProtection)');
  assert.ok(webhookMount>0 && csrf>webhookMount);
  assert.match(app,/x-hub-signature-256/);
  assert.match(app,/hipicoOperatorRoutes/);
  assert.match(app,/authRateLimit, hipicoOperatorRoutes/);
});

test('android wrapper synchronizes only the Hipico web product',()=>{
  const sync=read('android/hipico-control-v1130/scripts/sync-web.mjs');
  assert.match(sync,/frontend\/public\/hipico-control/);
  assert.match(sync,/restore-hipico-runtime\.mjs/);
  assert.doesNotMatch(sync,/frontend\/src/);
});

test('legacy Control Hipico URL redirects to its independent PWA',()=>{
  const vercel=JSON.parse(read('vercel.json'));
  assert.ok(vercel.routes.some((r)=>r.src==='/control-hipico'&&r.status===308&&r.headers?.Location==='/hipico-control/'));
});
