import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
const core=readFileSync(new URL('../src/runtime-core.mjs',import.meta.url),'utf8');

test('bridge entrypoint installs PDF automation before loading the unchanged runtime core',()=>{
  assert.match(entry,/import \{ chromium \} from 'playwright-core'/);
  assert.match(entry,/installDocumentRuntimeHook\(chromium\)/);
  assert.match(entry,/await import\('\.\/runtime-core\.mjs'\)/);
  assert.doesNotMatch(entry,/launchPersistentContext\(/,'the wrapper must not create a second browser session');
});

test('runtime core remains the existing single-session WhatsApp bridge',()=>{
  assert.match(core,/const spoolRuntime = createBridgeSpoolRuntime/);
  assert.match(core,/async function monitor\(\)/);
  assert.match(core,/launchPersistentContext\(PROFILE_DIR/);
  assert.match(core,/Envío al grupo fuente: IMPOSIBLE POR DISEÑO/);
});
