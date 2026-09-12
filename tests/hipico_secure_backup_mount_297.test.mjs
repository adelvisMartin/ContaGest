import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePortableBackup, serializeWorkspaceBackup } from '../frontend/public/hipico-control/assets/js/backup.js';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const html=read('../frontend/public/hipico-control/index.html');
const secureUi=read('../frontend/public/hipico-control/assets/js/backup-secure-ui.js');
const facade=read('../frontend/public/hipico-control/assets/js/backup.js');
const sw=read('../frontend/public/hipico-control/sw.js');

test('encrypted backup interceptor is mounted before the legacy application handler',()=>{
  const secureIndex=html.indexOf('./assets/js/backup-secure-ui.js');
  const appIndex=html.indexOf('./assets/js/app.js');
  assert.ok(secureIndex>=0,'backup-secure-ui.js must be mounted');
  assert.ok(appIndex>=0,'app.js must be mounted');
  assert.ok(secureIndex<appIndex,'secure backup interceptor must register before app.js');
  assert.match(secureUi,/addEventListener\('click',[\s\S]*?,\s*true\)/);
  assert.match(secureUi,/event\.preventDefault\(\);\s*event\.stopImmediatePropagation\(\)/);
  assert.match(secureUi,/exportEncryptedCurrentWorkspace/);
});

test('new encrypted backup requires matching passphrase confirmation before any file is generated',()=>{
  assert.match(secureUi,/function newBackupPassphrase\(\)/);
  assert.match(secureUi,/Repite exactamente la contraseña del respaldo para confirmar/);
  assert.match(secureUi,/confirmation !== passphrase/);
  assert.match(secureUi,/Las contraseñas del respaldo no coinciden/);
  assert.match(secureUi,/const passphrase = newBackupPassphrase\(\)/);
});

test('plaintext portable export fails closed even if UI interception regresses',()=>{
  assert.throws(
    ()=>serializeWorkspaceBackup({config:{groups:[]}}),
    (error)=>error?.code==='HIPICO_PLAINTEXT_BACKUP_DISABLED'
  );
  assert.match(facade,/HIPICO_PLAINTEXT_BACKUP_DISABLED/);
  assert.doesNotMatch(facade,/export\s*\{[^}]*serializeWorkspaceBackup[^}]*\}\s*from\s*['"]\.\/backup-v2\.js['"]/s);
});

test('historical plaintext backups remain importable while new off-device export is encrypted-only',async()=>{
  const legacy={schemaVersion:10,config:{groups:[]},participants:[],days:[],races:[]};
  const parsed=await parsePortableBackup(JSON.stringify(legacy));
  assert.equal(parsed.legacy,true);
  assert.equal(parsed.workspace.schemaVersion,10);
  assert.match(secureUi,/restorePortableBackup/);
  assert.match(secureUi,/respaldo legacy/i);
});

test('service worker keeps the secure backup module available offline',()=>{
  assert.match(sw,/\.\/assets\/js\/backup-secure-ui\.js/);
});
