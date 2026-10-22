import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const read = (path) => fs.readFile(path, 'utf8');
const removedCss = [
  'styles.css','ui-system.css','tokens.css','themes.css','components.css','operations-pro.css','precision-hipica.css',
  'offline-icons.css','recovery.css','ui-system-v2.css','mobile-accessibility.css','operational-copy-center.css','operational-access-guard.css'
];

test('PR268 maintains one ordered v4 CSS graph and consistent branded identity', async () => {
  const [index, recovery, manifestRaw, entry, tokens, cssVerifier] = await Promise.all([
    read(root + '/index.html'), read(root + '/recovery.html'), read(root + '/manifest.webmanifest'),
    read(root + '/assets/css/app.css'), read(root + '/assets/css/platform-tokens-v1.css'),
    read('android/hipico-control-v1130/scripts/verify-css-graph.mjs')
  ]);
  const manifest = JSON.parse(manifestRaw);
  const links = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(links, ['./assets/css/app.css', './assets/css/platform-tokens-v1.css']);
  assert.match(entry, /@layer legacy;/);
  const imports = [...entry.matchAll(/@import\s+url\("([^"]+)"\)(?:\s+layer\(legacy\))?;/g)].map(m => m[1]);
  assert.deepEqual(imports, ['./ui-system-v3-compat.css','./ui-system-v4.css','./ui-system-v4-convergence.css']);
  assert.match(entry, /ui-system-v3-compat\.css"\)\s+layer\(legacy\)/);
  assert.match(cssVerifier, /verifyHipicoCssGraph/);
  assert.match(index, /data-v4-brand/);
  assert.match(index, /help-center\.js/);
  assert.match(recovery, /data-v4-brand/);
  assert.match(recovery, /icons\/icon-192\.png/);
  assert.equal(manifest.name, 'Control Hípico');
  assert.equal(manifest.theme_color, '#235C45');
  assert.match(index, /<meta name="theme-color" content="#235C45">/);
  assert.match(tokens, /--hc-brand:\s*#235C45/);
  for (const file of removedCss) await assert.rejects(fs.access(root + '/assets/css/' + file));
  await assert.rejects(fs.access(root + '/icon.svg'));
});

test('PR268 uses reviewed native UI primitives, accessibility and Help Center without React runtime', async () => {
  const [ui, help, pkg] = await Promise.all([read(root + '/assets/js/ui.js'), read(root + '/assets/js/help-center.js'), read('frontend/package.json')]);
  assert.match(ui, /export const ui = Object\.freeze/);
  for (const primitive of ['button','badge','card','field','state','dialog'])
    assert.match(ui, new RegExp(primitive + '\\('));
  assert.match(ui, /focusableNodes/);
  assert.match(ui, /aria-live/);
  assert.match(help, /Manual de uso/);
  assert.match(help, /SOURCE permanece sólo lectura/);
  assert.match(pkg, /react-hot-toast/);
  assert.doesNotMatch(help, /from ['"]react/);
  assert.match(ui, /escapeHtml/);
});

test('PR268 keeps recovery, server-side role authority and public signup fail closed', async () => {
  const [index, config, access, supabase, recovery, credentials] = await Promise.all([
    read(root + '/index.html'), read(root + '/runtime-config.js'),
    read(root + '/assets/js/user-access.js'), read(root + '/assets/js/supabase.js'),
    read(root + '/assets/js/password-recovery.js'),
    read('backend/prisma/migrations/20260910063000_hipico_credential_status_no_password_storage/migration.sql')
  ]);
  assert.match(index, /user-access\.js/);
  assert.match(index, /password-recovery\.js/);
  assert.match(config, /"allowSignup"\s*:\s*false/);
  assert.match(access, /import \{ currentSession, fetchCloudAccess, signOut \} from '\.\/supabase\.js'/);
  assert.match(access, /return fetchCloudAccess\(\)/);
  assert.match(supabase, /export async function fetchCloudAccess\(\)/);
  assert.match(access, /hipico_admin_list_users/);
  assert.match(access, /hipico_admin_mark_recovery_requested/);
  assert.match(access, /Contraseña/);
  assert.match(recovery, /\/auth\/v1\/recover/);
  assert.match(recovery, /\/auth\/v1\/user/);
  assert.match(recovery, /hipico_mark_password_changed/);
  assert.match(recovery, /recoveryAccessToken = ''/);
  assert.doesNotMatch(recovery, /service[_-]?role|sb_secret_/i);
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

test('PR268 Android sync verifies complete canonical CSS graph and byte-for-byte PWA parity', async () => {
  const [pkg, sync, cssGraph, branding, capacitor] = await Promise.all([
    read('android/hipico-control-v1130/package.json'), read('android/hipico-control-v1130/scripts/sync-web.mjs'),
    read('android/hipico-control-v1130/scripts/verify-css-graph.mjs'),
    read('android/hipico-control-v1130/scripts/configure-branding.mjs'),
    read('android/hipico-control-v1130/capacitor.config.json')
  ]);
  assert.match(pkg, /"android:branding"/);
  assert.match(sync, /verifyHipicoCssGraph\(root, index\)/);
  assert.match(sync, /assets\/css\/app\.css/);
  assert.match(sync, /help-center\.js/);
  assert.match(sync, /verifyParity\(sourceFiles, targetFiles\)/);
  assert.match(sync, /sourceHash !== targetHash/);
  assert.match(cssGraph, /HIPICO_STYLES/);
  assert.match(cssGraph, /platform-tokens-v1\.css/);
  assert.match(cssGraph, /ui-system-v4-convergence\.css/);
  for (const file of removedCss) assert.match(sync, new RegExp(file.replace('.', '\\.')));
  assert.match(branding, /icon-192\.png/);
  assert.match(branding, /ic_launcher_round/);
  assert.match(branding, /adaptive-icon/);
  assert.match(capacitor, /"cleartext"\s*:\s*false/);
  assert.match(capacitor, /"allowMixedContent"\s*:\s*false/);
});

test('service worker caches current v4 graph, rotates old caches, never caches auth/API', async () => {
  const sw = await read(root + '/sw.js');
  for (const asset of [
    'assets/css/app.css','assets/css/platform-tokens-v1.css',
    'assets/css/ui-system-v3-compat.css','assets/css/ui-system-v4.css',
    'assets/css/ui-system-v4-convergence.css','help-center.js'
  ]) assert.ok(sw.includes(asset), 'missing offline asset ' + asset);
  assert.match(sw, /shell-r38-consolidator-v4-1-3/);
  assert.match(sw, /key\.startsWith\('hipico-control-'\) && key !== SHELL_CACHE/);
  assert.match(sw, /isSensitive\(url\) \|\| isRuntimeMetadata\(url\)/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  for (const file of removedCss) assert.equal(sw.includes('assets/css/' + file), false, file + ' must not be cached');
});

