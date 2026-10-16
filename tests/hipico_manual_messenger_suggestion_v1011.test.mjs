import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/operational-copy-center.js', import.meta.url),'utf8');
const start=source.indexOf('export function mayCopyManualSuggestion(');
const end=source.indexOf('\nfunction manualSuggestionCard()',start);
assert.ok(start>0 && end>start, 'manual validation must be an isolated policy');
const policySource=source.slice(start,end).replace(/^export /,'');
const mayCopy=vm.runInNewContext(policySource+'; mayCopyManualSuggestion');

test('#1011 copy requires explicit confirmation and nonblank <=1200 characters',()=>{
  for(const value of ['', ' ', null, undefined, 'a'.repeat(1201)]) {
    assert.equal(mayCopy(value,true),false);
  }
  assert.equal(mayCopy('Hola, jornada de prueba',false),false);
  assert.equal(mayCopy('Hola, jornada de prueba',true),true);
  assert.equal(mayCopy('a'.repeat(1200),true),true);
  assert.equal(mayCopy('Hola','true'),false);
});

test('#1011 UI includes editable blank human draft, visible source/date and cancel',()=>{
  const view=source.slice(source.indexOf('function manualSuggestionCard()'),source.indexOf('\nfunction updateManualSuggestionControls('));
  assert.match(view,/data-ops-manual-text/);
  assert.match(view,/<textarea[^>]*>[\s\S]*?<\/textarea>/);
  assert.doesNotMatch(view,/readonly|data-ops-text=|generateWhatsappText/);
  assert.match(view,/Fuente: texto introducido por una persona/);
  assert.match(view,/Fecha:/);
  assert.match(view,/data-ops-manual-copy disabled/);
  assert.match(view,/data-ops-manual-confirm/);
  assert.match(view,/Cancelar y borrar/);
});

test('#1011 manual copy path only uses clipboard after double human intent',()=>{
  const click=source.slice(source.indexOf("if (target.closest('[data-ops-manual-copy]'))"),source.indexOf('      if (copy) {'));
  assert.match(click,/mayCopyManualSuggestion\(draft\?\.value, confirmation\?\.checked\)/);
  assert.ok(click.indexOf('mayCopyManualSuggestion') < click.indexOf('copyText('));
  assert.doesNotMatch(click,/fetch\(|wa\.me|window\.open|sendMessage|messages\/send|runFinancialIdempotentMutation/);
  assert.match(source,/dialog\.addEventListener\('close',/);
  assert.match(source,/draft\.value = ''/);
  assert.match(source,/confirmation\.checked = false/);
  assert.match(source,/root\.dataset\.opsAuthorized !== 'true'/);
});

test('#1011 current SOURCE automatic read/write guard remains independent',()=>{
  const read=readFileSync(new URL('../tools/hipico-whatsapp-web-bridge/src/source-read-policy-gate.mjs', import.meta.url),'utf8');
  const write=readFileSync(new URL('../tools/hipico-whatsapp-web-bridge/src/source-policy-gate.mjs', import.meta.url),'utf8');
  assert.match(read,/SOURCE_AUTO_READ_POLICY_NO_GO/);
  assert.match(write,/SOURCE_AUTO_REPLY_POLICY_NO_GO/);
  assert.doesNotMatch(source,/https?:\/\/web\.whatsapp\.com|wa\.me|messages\/send/);
});
