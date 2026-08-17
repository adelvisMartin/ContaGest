import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('group bridge uses the dedicated operational classifier and stays shadow only',()=>{
  const route=read('backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  assert.match(route,/hipico-operational-classifier\.js/);
  assert.match(route,/targetType:\s*'group_bridge'/);
  assert.match(route,/status:\s*'shadow'/);
  assert.match(route,/actions:\s*\[\]/);
  assert.match(route,/autoEligible:\s*false/);
});

test('real operational classifier contains recovered RC1 vocabulary and manual gates',()=>{
  const classifier=read('backend/src/modules/hipico-bot/hipico-operational-classifier.ts');
  for(const token of ['JUEGA','CONSIGUE','TERCIO\\s+DISPONIBLE','TERCIOS','LLEGADA','PIZARRA','POLLA','PARLEY','CIERRA','NO\\s+VA\\s+MAS','DEBE\\s+CONFIRMAR']){
    assert.match(classifier,new RegExp(token));
  }
  assert.match(classifier,/autoEligible:false/);
  assert.match(classifier,/race_close/);
  assert.match(classifier,/settlement_snapshot/);
  assert.match(classifier,/cancel_or_correction/);
});

test('canonical desktop bridge is Playwright official-web observer, not old injection bridge',()=>{
  const pkg=JSON.parse(read('tools/hipico-whatsapp-web-bridge/package.json'));
  assert.equal(pkg.dependencies['playwright-core'],'1.62.1');
  assert.equal(pkg.dependencies['whatsapp-web.js'],undefined);
  const runtime=read('tools/hipico-whatsapp-web-bridge/src/index.mjs');
  assert.match(runtime,/https:\/\/web\.whatsapp\.com\//);
  assert.match(runtime,/launchPersistentContext/);
  assert.match(runtime,/HIPICO_ALLOW_SEND debe permanecer false/);
  assert.match(runtime,/Baseline del grupo/);
  assert.match(runtime,/SPOOL_DIR/);
  const old=read('tools/hipico-whatsapp-bridge/README.md');
  assert.match(old,/DEPRECADO/);
});

test('Hipico persistence migration owns only Hipico bot tables',()=>{
  const sql=read('backend/prisma/migrations/0014_v1126_hipico_bot/migration.sql');
  assert.match(sql,/HipicoWebhookEvent/);
  assert.match(sql,/HipicoBotOutbox/);
  assert.doesNotMatch(sql,/Fitness/i);
});
