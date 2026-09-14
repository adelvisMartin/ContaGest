import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const read = (path) => fs.readFile(path, 'utf8');
const removedCss = [
  'styles.css','ui-system.css','tokens.css','themes.css','components.css','operations-pro.css','precision-hipica.css',
  'offline-icons.css','recovery.css','ui-system-v2.css','mobile-accessibility.css','operational-copy-center.css','operational-access-guard.css'
];

test('PR268 exposes exactly one visual authority and official identity', async () => {
  const [index, recovery, manifest, css] = await Promise.all([
    read(`${root}/index.html`), read(`${root}/recovery.html`), read(`${root}/manifest.webmanifest`), read(`${root}/assets/css/app.css`)
  ]);
  const stylesheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(stylesheets, ['./assets/css/app.css']);
  assert.match(index, /logo-control-hipico\.png/);
  assert.match(index, /help-center\.js/);
  assert.match(recovery, /icons\/icon-192\.png/);
  assert.match(manifest, /"theme_color"\s*:\s*"#721522"/);
  assert.match(css, /--hc-brand:\s*#721522/);
  assert.doesNotMatch(css, /radial-gradient\(/i);
  assert.doesNotMatch(css, /font-weight:\s*(?:550|650|750|800|850|900)\b/);
  for (const file of removedCss) await assert.rejects(fs.access(`${root}/assets/css/${file}`));
  await assert.rejects(fs.access(`${root}/icon.svg`));
});

test('PR268 uses canonical shadcn-like primitives without pulling React into independent PWA runtime', async () => {
  const [ui, help, pkg] = await Promise.all([read(`${root}/assets/js/ui.js`), read(`${root}/assets/js/help-center.js`), read('frontend/package.json')]);
  assert.match(ui, /export const ui = Object\.freeze/);
  for (const primitive of ['button','badge','card','field','state','dialog']) assert.match(ui, new RegExp(`${primitive}\\(`));
  assert.match(ui, /focusableNodes/);
  assert.match(ui, /aria-live/);
  assert.match(help, /Manual de uso/);
  assert.match(help, /SOURCE permanece sólo lectura/);
  assert.match(pkg, /react-hot-toast/);
  assert.doesNotMatch(help, /from ['"]react/);
});

test('PR268 keeps password recovery, role authority and public signup fail-closed', async () => {
  const [index, config, access, recovery, credentials] = await Promise.all([
    read(`${root}/index.html`), read(`${root}/runtime-config.js`), read(`${root}/assets/js/user-access.js`), read(`${root}/assets/js/password-recovery.js`),
    read('backend/prisma/migrations/20260910063000_hipico_credential_status_no_password_storage/migration.sql')
  ]);
  assert.match(index, /user-access\.js/);
  assert.match(index, /password-recovery\.js/);
  assert.match(config, /"allowSignup"\s*:\s*false/);
  assert.match(access, /hipico_get_my_access/);
  assert.match(access, /hipico_admin_list_users/);
  assert.match(access, /hipico_admin_mark_recovery_requested/);
  assert.match(access, /Contraseña/);
  assert.match(recovery, /\/auth\/v1\/recover/);
  assert.match(recovery, /\/auth\/v1\/user/);
  assert.match(recovery, /hipico_mark_password_changed/);
  assert.match(credentials, /credential_state/);
  assert.match(credentials, /encrypted_password/);
  assert.doesNotMatch(credentials, /ADD COLUMN[^;]*password\s+text/i);
  assert.doesNotMatch(credentials, /RETURNS TABLE\([\s\S]*encrypted_password/i);
});

test('PR268 database scope enforces shared workspace and server-side read-only roles', async () => {
  const [baseAccess, shared, shadow, leastPrivilege] = await Promise.all([
    read('backend/prisma/migrations/20260910050500_hipico_user_access_roles/migration.sql'),
    read('backend/prisma/migrations/20260910054500_hipico_shared_workspace_roles/migration.sql'),
    read('backend/prisma/migrations/20260910060000_hipico_recent_shadow_scope/migration.sql'),
    read('backend/prisma/migrations/20260910062500_hipico_least_privilege_tables/migration.sql')
  ]);
  assert.match(baseAccess, /CREATE TABLE IF NOT EXISTS public\.hipico_users/);
  assert.match(shared, /workspace_owner_id/);
  assert.match(shared, /hipico_can_read_owner/);
  assert.match(shared, /hipico_can_operate_owner/);
  assert.match(shared, /HIPICO_READ_ONLY_ROLE/);
  assert.match(shared, /actorUserId/);
  assert.match(shadow, /hipico_recent_shadow_evaluations/);
  assert.match(leastPrivilege, /REVOKE ALL PRIVILEGES/);
  assert.match(leastPrivilege, /GRANT SELECT ON TABLE public\.hipico_users TO authenticated/);
});

test('PR268 keeps WhatsApp ingestion fail-closed and uses only official product defaults', async () => {
  const [whatsapp, uiTranscript, seed, workspace] = await Promise.all([
    read(`${root}/assets/js/whatsapp.js`), read(`${root}/assets/js/whatsapp/ui-transcript.js`), read(`${root}/assets/js/seed.js`), read(`${root}/assets/js/workspace.js`)
  ]);
  assert.match(whatsapp, /looksLikeWhatsAppUiTranscript/);
  assert.match(whatsapp, /generateClosureText\(companyName = 'CONTROL HÍPICO'/);
  assert.match(uiTranscript, /systemKind:'noise'/);
  assert.match(seed, /clubName:\s*"CONTROL HÍPICO"/);
  assert.match(seed, /name:\s*"Grupo principal"/);
  assert.doesNotMatch(seed, /TRIPLE CROWN/i);
  assert.doesNotMatch(workspace, /TRIPLE CROWN|migrateLegacyBrand/i);
  assert.match(workspace, /cleanLabel/);
});

test('PR268 Android sync requires canonical web assets and official launcher branding', async () => {
  const [pkg, sync, branding, capacitor] = await Promise.all([
    read('android/hipico-control-v1130/package.json'), read('android/hipico-control-v1130/scripts/sync-web.mjs'),
    read('android/hipico-control-v1130/scripts/configure-branding.mjs'), read('android/hipico-control-v1130/capacitor.config.json')
  ]);
  assert.match(pkg, /"android:branding"/);
  assert.match(sync, /assets\/css\/app\.css/);
  assert.match(sync, /help-center\.js/);
  assert.match(sync, /cssFiles\.length !== 1/);
  for (const file of removedCss) assert.match(sync, new RegExp(file.replace('.', '\\.')));
  assert.match(branding, /icon-192\.png/);
  assert.match(branding, /ic_launcher_round/);
  assert.match(branding, /adaptive-icon/);
  assert.match(capacitor, /"backgroundColor"\s*:\s*"#f7f7f6"/);
});

test('service worker cache matches the zero-legacy integrated runtime', async () => {
  const sw = await read(`${root}/sw.js`);
  assert.match(sw, /assets\/css\/app\.css/);
  assert.match(sw, /help-center\.js/);
  assert.match(sw, /shell-r23-ui-system-v2-266/);
  for (const file of removedCss) assert.equal(sw.includes(`assets/css/${file}`), false, `${file} must not be cached`);
});