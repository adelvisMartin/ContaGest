import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const recoveryPath = 'frontend/public/hipico-control/assets/js/password-recovery.js';
const recoveryCssPath = 'frontend/public/hipico-control/assets/css/password-recovery.css';
const indexPath = 'frontend/public/hipico-control/index.html';

test('#267 exposes password recovery from the auth screen without enabling public signup', async () => {
  const [recovery, index, runtime] = await Promise.all([
    fs.readFile(recoveryPath, 'utf8'),
    fs.readFile(indexPath, 'utf8'),
    fs.readFile('frontend/public/hipico-control/runtime-config.js', 'utf8')
  ]);
  assert.match(index, /password-recovery\.js/);
  assert.match(recovery, /¿Olvidaste tu contraseña\?/);
  assert.match(recovery, /recover-password/);
  assert.match(runtime, /"allowSignup":\s*false/);
});

test('#267 requests Supabase recovery with publishable credentials and an explicit app redirect', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  assert.match(source, /\/auth\/v1\/recover\?redirect_to=/);
  assert.match(source, /CLOUD_CONFIG\.publishableKey/);
  assert.match(source, /recoveryRedirectUrl\(\)/);
  assert.doesNotMatch(source, /service[_-]?role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i);
});

test('#267 consumes recovery access token in memory, clears the URL and updates auth user only', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  assert.match(source, /type === 'recovery'/);
  assert.match(source, /access_token/);
  assert.match(source, /history\.replaceState/);
  assert.match(source, /\/auth\/v1\/user/);
  assert.match(source, /method:\s*'PUT'/);
  assert.match(source, /JSON\.stringify\(\{ password: nextPassword \}\)/);
  assert.doesNotMatch(source, /hipico_profiles|auth\.users|encrypted_password/);
});

test('#267 validates password/confirmation and avoids account enumeration copy', async () => {
  const source = await fs.readFile(recoveryPath, 'utf8');
  assert.match(source, /nextPassword\.length < 10/);
  assert.match(source, /password !== confirm/);
  assert.match(source, /Si el correo pertenece a una cuenta válida/);
  assert.match(source, /autocomplete=\\"new-password\\"/);
});

test('#267 recovery presentation remains compact and mobile-safe', async () => {
  const css = await fs.readFile(recoveryCssPath, 'utf8');
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /width:\s*min\(100%,\s*520px\)/);
  assert.match(css, /@media \(max-width:\s*780px\)/);
});
