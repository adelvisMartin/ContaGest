import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  BACKUP_SCHEMA_VERSION,
  createBackupObject,
  decryptBackupText,
  encryptBackupText,
  parsePortableBackup,
  reconcileRestoredWorkspace,
  serializeWorkspaceBackup,
  sha256Sync,
  validateBackupObject
} from '../frontend/public/hipico-control/assets/js/backup-v2.js';

test('sha256 implementation matches known vector', () => {
  assert.equal(sha256Sync('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('backup is versioned hashed and strips session/secret material', () => {
  const source = { version: 7, participants: [{ id: 'p1', name: 'Synthetic' }], movements: [], token: 'NOPE', config: { sessionSecret: 'NOPE2', theme: 'dark' } };
  const backup = createBackupObject(source, { productVersion: 'test' });
  assert.equal(backup._backup.backupSchemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(backup.token, undefined);
  assert.equal(backup.config.sessionSecret, undefined);
  assert.equal(backup.config.theme, 'dark');
  assert.match(backup._backup.contentSha256, /^[a-f0-9]{64}$/);
});

test('tampered backup is rejected before restore', () => {
  const parsed = JSON.parse(serializeWorkspaceBackup({ version: 1, participants: [{ id: 'p1' }], movements: [] }));
  parsed.participants.push({ id: 'p2' });
  assert.throws(() => validateBackupObject(parsed), /alterado|corrupto/i);
});

test('future local schema is rejected fail-closed', () => {
  const parsed = JSON.parse(serializeWorkspaceBackup({ version: 1, participants: [], movements: [] }));
  parsed._backup.localSchemaVersion = 999;
  assert.throws(() => validateBackupObject(parsed), /incompatible/i);
});

test('secret-like fields are stripped again on import, including legacy payloads', () => {
  const versioned = JSON.parse(serializeWorkspaceBackup({ version: 1, participants: [], movements: [] }));
  versioned.token = 'INJECTED';
  assert.equal(validateBackupObject(versioned).workspace.token, undefined);
  const legacy = validateBackupObject({ version: 1, participants: [], movements: [], sessionToken: 'LEGACY-SECRET' });
  assert.equal(legacy.workspace.sessionToken, undefined);
  assert.equal(legacy.legacy, true);
});

test('AES-GCM portable backup decrypts with correct passphrase and rejects wrong passphrase', async () => {
  const plain = serializeWorkspaceBackup({ version: 1, participants: [{ id: 'p1' }], movements: [] });
  const encrypted = await encryptBackupText(plain, 'correct horse battery staple');
  assert.doesNotMatch(encrypted, /participants|p1/);
  assert.equal(await decryptBackupText(encrypted, 'correct horse battery staple'), plain);
  await assert.rejects(() => decryptBackupText(encrypted, 'wrong password value'), /incorrecta|alterado/i);
  const parsed = await parsePortableBackup(encrypted, { passphrase: 'correct horse battery staple' });
  assert.equal(parsed.workspace.participants[0].id, 'p1');
});

test('weak backup password is refused', async () => {
  await assert.rejects(() => encryptBackupText('{}', 'short'), /12 caracteres/i);
});

test('restore reconciliation rejects duplicate identity and malformed monetary values', () => {
  const result = reconcileRestoredWorkspace({
    participants: [{ id: 'same' }, { id: 'same' }],
    movements: [{ id: 'm1', amount: 'not-money' }]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.duplicateIds, ['participants:same']);
  assert.deepEqual(result.invalidMoney, ['m1']);
});

test('secure UI intercepts legacy export/import paths instead of leaking plaintext silently', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/assets/js/backup-secure-ui.js', 'utf8');
  assert.match(source, /data-action="export-json"/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /exportEncryptedCurrentWorkspace/);
  assert.match(source, /restorePortableBackup/);
  assert.match(source, /antes.*reemplaz/i);
});

test('service worker preserves release version and precaches secure backup modules', async () => {
  const source = await fs.readFile('frontend/public/hipico-control/sw.js', 'utf8');
  assert.match(source, /CACHE_VERSION = 'hipico-control-v1\.13\.0-rc2'/);
  assert.match(source, /backup-v2\.js/);
  assert.match(source, /backup-secure-ui\.js/);
});
