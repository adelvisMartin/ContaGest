import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const root = 'frontend/public/hipico-control';
const read = (path) => fs.readFile(path, 'utf8');

const removedCss = [
  'tokens.css','themes.css','components.css','operations-pro.css',
  'precision-hipica.css','recovery.css','ui-system-v2.css'
];

test('PR268 exposes one canonical visual authority and official identity', async () => {
  const [index, recovery, manifest, css] = await Promise.all([
    read(`${root}/index.html`),
    read(`${root}/recovery.html`),
    read(`${root}/manifest.webmanifest`),
    read(`${root}/assets/css/ui-system.css`)
  ]);

  const stylesheets = [...index.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(stylesheets, ['./assets/css/styles.css', './assets/css/ui-system.css']);
  assert.match(index, /logo-control-hipico\.png/);
  assert.match(index, /icons\/icon-192\.png/);
  assert.match(recovery, /icons\/icon-192\.png/);
  assert.doesNotMatch(recovery, />\s*HC\s*</);
  assert.match(manifest, /"theme_color"\s*:\s*"#721522"/);
  assert.match(css, /--hc-brand:\s*#721522/);
  assert.doesNotMatch(css, /linear-gradient\(/i);
  assert.doesNotMatch(css, /radial-gradient\(/i);

  for (const file of removedCss) {
    await assert.rejects(fs.access(`${root}/assets/css/${file}`), undefined, `${file} must stay removed`);
  }
  await assert.rejects(fs.access(`${root}/icon.svg`));
});

test('PR268 keeps password recovery, role authority and public signup fail-closed', async () => {
  const [index, config, access, recovery] = await Promise.all([
    read(`${root}/index.html`),
    read(`${root}/runtime-config.js`),
    read(`${root}/assets/js/user-access.js`),
    read(`${root}/assets/js/password-recovery.js`)
  ]);

  assert.match(index, /assets\/js\/user-access\.js/);
  assert.match(index, /assets\/js\/password-recovery\.js/);
  assert.match(config, /"allowSignup"\s*:\s*false/);
  assert.match(config, /"allowLabDirectTableFallback"\s*:\s*false/);
  assert.match(access, /hipico_get_my_access/);
  assert.match(access, /hipico_admin_list_users/);
  assert.match(access, /hipico_admin_grant_user_by_email/);
  assert.match(access, /hipico_admin_set_user_access/);
  assert.match(access, /READ_ONLY_ROLES=new Set\(\['viewer','auditor'\]\)/);
  assert.match(recovery, /\/auth\/v1\/recover/);
  assert.match(recovery, /\/auth\/v1\/user/);
  assert.match(recovery, /nextPassword\.length < 10/);
});

test('PR268 database migrations enforce shared workspace scope and server-side read-only roles', async () => {
  const [baseAccess, shared, shadow] = await Promise.all([
    read('backend/prisma/migrations/20260910050500_hipico_user_access_roles/migration.sql'),
    read('backend/prisma/migrations/20260910054500_hipico_shared_workspace_roles/migration.sql'),
    read('backend/prisma/migrations/20260910060000_hipico_recent_shadow_scope/migration.sql')
  ]);

  assert.match(baseAccess, /CREATE TABLE IF NOT EXISTS public\.hipico_users/);
  assert.match(baseAccess, /CHECK \(role IN \('admin','operator','viewer','auditor'\)\)/);
  assert.match(shared, /ADD COLUMN IF NOT EXISTS workspace_owner_id uuid/);
  assert.match(shared, /hipico_workspace_owner\(\)/);
  assert.match(shared, /hipico_can_read_owner/);
  assert.match(shared, /hipico_can_operate_owner/);
  assert.match(shared, /v_role NOT IN \('admin','operator'\)/);
  assert.match(shared, /HIPICO_READ_ONLY_ROLE/);
  assert.match(shared, /WHERE hu\.workspace_owner_id = v_owner/);
  assert.match(shared, /actorUserId/);
  assert.match(shared, /hipico_messages_select_scope/);
  assert.match(shared, /hipico_ledger_entries_insert_scope/);
  assert.match(shared, /hipico_shadow_eval_select_scope/);
  assert.doesNotMatch(shared, /INSERT INTO public\.hipico_users[\s\S]{0,500}raw_app_meta_data/);
  assert.match(shadow, /hipico_recent_shadow_evaluations/);
  assert.match(shadow, /WHERE e\.owner_id = v_owner/);
});

test('PR268 keeps WhatsApp ingestion fail-closed and removes legacy product branding defaults', async () => {
  const [whatsapp, uiTranscript, seed, workspace] = await Promise.all([
    read(`${root}/assets/js/whatsapp.js`),
    read(`${root}/assets/js/whatsapp/ui-transcript.js`),
    read(`${root}/assets/js/seed.js`),
    read(`${root}/assets/js/workspace.js`)
  ]);

  assert.match(whatsapp, /looksLikeWhatsAppUiTranscript/);
  assert.match(whatsapp, /generateClosureText\(companyName = 'CONTROL HÍPICO'/);
  assert.match(uiTranscript, /systemKind:'noise'/);
  assert.match(uiTranscript, /kind:'sticker'/);
  assert.match(seed, /clubName:\s*"CONTROL HÍPICO"/);
  assert.match(seed, /name:\s*"Grupo principal"/);
  assert.doesNotMatch(seed, /TRIPLE CROWN/i);
  assert.match(workspace, /migrateLegacyBrand/);
  assert.match(workspace, /"CONTROL HÍPICO"/);
});

test('PR268 Android sync/build consumes canonical web assets and applies official launcher branding', async () => {
  const [pkg, sync, branding, capacitor] = await Promise.all([
    read('android/hipico-control-v1130/package.json'),
    read('android/hipico-control-v1130/scripts/sync-web.mjs'),
    read('android/hipico-control-v1130/scripts/configure-branding.mjs'),
    read('android/hipico-control-v1130/capacitor.config.json')
  ]);

  assert.match(pkg, /"android:branding"\s*:\s*"node scripts\/configure-branding\.mjs"/);
  assert.match(pkg, /npx cap sync android && npm run android:version && npm run android:branding/);
  assert.match(sync, /assets\/css\/ui-system\.css/);
  assert.match(sync, /assets\/js\/user-access\.js/);
  assert.match(sync, /assets\/js\/password-recovery\.js/);
  for (const file of removedCss) assert.match(sync, new RegExp(file.replace('.', '\\.')));
  assert.match(branding, /icon-192\.png/);
  assert.match(branding, /icon-192-maskable\.png/);
  assert.match(branding, /ic_launcher_round/);
  assert.match(branding, /adaptive-icon/);
  assert.match(branding, /#721522/);
  assert.match(capacitor, /"backgroundColor"\s*:\s*"#f7f7f6"/);
});

test('service worker cache matches the integrated runtime instead of removed legacy layers', async () => {
  const sw = await read(`${root}/sw.js`);
  assert.match(sw, /assets\/css\/ui-system\.css/);
  assert.match(sw, /assets\/js\/user-access\.js/);
  assert.match(sw, /assets\/js\/password-recovery\.js/);
  assert.match(sw, /assets\/js\/whatsapp\/ui-transcript\.js/);
  assert.match(sw, /SHELL_CACHE/);
  for (const file of removedCss) assert.equal(sw.includes(file), false, `${file} must not be cached`);
});
