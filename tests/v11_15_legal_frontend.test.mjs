import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('first-access legal enhancer separates mandatory necessary cookies from optional analytics',()=>{
  const guard=read('frontend/src/services/legalAcceptanceEnhancer.js');
  assert.match(guard,/data-legal-document/);assert.match(guard,/cgNecessaryCookies/);assert.match(guard,/cgAnalyticsCookies/);assert.match(guard,/desactivada por defecto/);assert.match(guard,/marketingCookies:false/);assert.match(guard,/No aceptar y salir/);
});

test('RIF is visibly locked in company settings after registration',()=>{
  const settings=read('frontend/src/pages/SettingsPage.js');
  assert.match(settings,/data-rif-locked="true"/);assert.match(settings,/readonly/);assert.match(settings,/corrección fiscal controlada/);
});
