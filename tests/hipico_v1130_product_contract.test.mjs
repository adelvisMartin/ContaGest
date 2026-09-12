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

test('recovered runtime archive is hash-pinned and restore path traversal is protected',()=>{
  const manifest=JSON.parse(read('products/hipico-control/runtime/v1.13.0-rc2/manifest.json'));
  assert.equal(manifest.product,'control-hipico');
  assert.equal(manifest.version,'1.13.0-rc2');
  assert.ok(Array.isArray(manifest.baselineArtifacts)&&manifest.baselineArtifacts.length>=2);
  for(const artifact of manifest.baselineArtifacts)assert.match(artifact.sha256,/^[a-f0-9]{64}$/);
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

test('webhook raw body is captured before browser CSRF while signature validation stays in the webhook route',()=>{
  const app=read('backend/src/app.ts');
  const webhook=read('backend/src/modules/hipico-bot/hipico-webhook.routes.ts');
  const webhookMount=app.indexOf("app.use('/api/v1/hipico-bot', hipicoWebhookRoutes)");
  const csrf=app.indexOf('app.use(csrfProtection)');
  assert.ok(webhookMount>0 && csrf>webhookMount);
  assert.match(app,/rawBody = Buffer\.from\(buffer\)/);
  assert.match(webhook,/req\.header\('x-hub-signature-256'\)/);
  assert.match(webhook,/webhookSignatureValid\(raw/);
  assert.match(app,/hipicoOperatorRoutes/);
  assert.match(app,/authRateLimit, hipicoOperatorRoutes/);
});

test('android wrapper synchronizes only the canonical Hipico web product',()=>{
  const sync=read('android/hipico-control-v1130/scripts/sync-web.mjs');
  const pkg=read('android/hipico-control-v1130/package.json');
  assert.match(sync,/frontend\/public\/hipico-control/);
  assert.match(sync,/assets\/css/);
  assert.match(sync,/canonicalCss/);
  assert.match(sync,/assets\/js\/user-access\.js/);
  assert.match(sync,/assets\/js\/password-recovery\.js/);
  assert.match(sync,/assets\/js\/help-center\.js/);
  assert.doesNotMatch(sync,/frontend\/src/);
  assert.match(pkg,/npm run android:branding/);
});

test('android sync removes retired generated assets before copying the canonical PWA',()=>{
  const sync=read('android/hipico-control-v1130/scripts/sync-web.mjs');
  const clean=sync.indexOf("fs.rmSync(target, { recursive: true, force: true })");
  const copy=sync.indexOf("fs.cpSync(source, target, { recursive: true, force: true })");
  assert.ok(clean>=0,'sync:web must remove the generated www tree before copying');
  assert.ok(copy>clean,'cleanup must happen before the canonical PWA is copied');
});

test('legacy Control Hipico URL redirects to its independent PWA',()=>{
  const vercel=JSON.parse(read('vercel.json'));
  assert.ok(vercel.routes.some((r)=>r.src==='/control-hipico'&&r.status===308&&r.headers?.Location==='/hipico-control/'));
});
