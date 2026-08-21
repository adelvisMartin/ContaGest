import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright-core';
import { extractGroupIds, redactGroupId, selectUniqueGroupId } from './group-identity.mjs';
import { loadRuntimeConfig } from './runtime-config.mjs';

const config = loadRuntimeConfig();
const dataDir = config.dataDir;
const profileDir = path.join(dataDir, 'chrome-profile');
const bindingsFile = path.join(dataDir, 'group-bindings.json');
const envFile = path.join(dataDir, 'group-bindings.env');
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(profileDir, { recursive: true });

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launchPersistentContext(profileDir, {
        headless: false,
        channel,
        chromiumSandbox: true,
        viewport: null,
        args: ['--start-maximized']
      });
    } catch (error) {
      if (channel === 'msedge') throw error;
    }
  }
  throw new Error('No se pudo iniciar Chrome/Edge.');
}

async function currentTitle(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    const candidates = [
      header?.querySelector('[title]')?.getAttribute('title'),
      header?.querySelector('[dir="auto"]')?.textContent,
      header?.textContent
    ].filter(Boolean).map((value) => String(value).replace(/\s+/g, ' ').trim());
    return candidates[0] || '';
  }).catch(() => '');
}

async function currentGroupCandidates(page) {
  const values = await page.evaluate(() => {
    const root = document.querySelector('#main') || document.body;
    const out = [];
    for (const node of root.querySelectorAll('[data-id], [data-testid], [id]')) {
      for (const attr of ['data-id', 'data-testid', 'id']) {
        const value = node.getAttribute?.(attr);
        if (value && value.includes('@g.us')) out.push(value);
      }
      if (out.length >= 300) break;
    }
    return out;
  }).catch(() => []);
  return extractGroupIds(values);
}

async function capture(page, rl, label, expectedTitle) {
  output.write(`\n${label}: abre manualmente el chat \"${expectedTitle}\" en WhatsApp Web.\n`);
  await rl.question('Cuando el header muestre el grupo correcto, presiona ENTER aquí... ');
  await page.waitForTimeout(500);
  const title = await currentTitle(page);
  const candidates = await currentGroupCandidates(page);
  const groupId = selectUniqueGroupId(candidates);
  if (!groupId) {
    throw new Error(`${label}: no pude obtener un @g.us único del chat activo. Verifica que el grupo tenga mensajes visibles e inténtalo de nuevo.`);
  }
  if (!title) throw new Error(`${label}: no pude leer el título del chat activo.`);
  output.write(`${label}: ${title} · ${redactGroupId(groupId)}\n`);
  return { title, groupId };
}

const rl = readline.createInterface({ input, output });
let context;
try {
  context = await launch();
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  output.write('\nVincula WhatsApp por QR si esta sesión todavía no está enlazada. Este asistente NO envía mensajes.\n');
  await rl.question('Cuando WhatsApp Web esté listo y veas la lista de chats, presiona ENTER... ');

  const source = await capture(page, rl, 'FUENTE', config.sourceMatches[0] || 'CLUB HIPICO TRIPLE CROWN');
  const lab = await capture(page, rl, 'LAB', config.labGroupName);
  if (source.groupId === lab.groupId) throw new Error('FUENTE y LAB resolvieron al mismo @g.us. No se guardará ninguna configuración.');

  const payload = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source: { title: source.title, groupId: source.groupId },
    lab: { title: lab.title, groupId: lab.groupId }
  };
  await fs.writeFile(bindingsFile, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.writeFile(envFile, [
    `HIPICO_SOURCE_GROUP_ID=${source.groupId}`,
    `HIPICO_LAB_GROUP_ID=${lab.groupId}`,
    'HIPICO_REQUIRE_PINNED_GROUP_IDS=true',
    ''
  ].join('\n'), { encoding: 'utf8', mode: 0o600 });

  output.write(`\nBindings guardados localmente:\n- ${bindingsFile}\n- ${envFile}\n`);
  output.write(`FUENTE ${redactGroupId(source.groupId)} · LAB ${redactGroupId(lab.groupId)}\n`);
  output.write('No se habilitó ningún envío.\n');
} finally {
  rl.close();
  await context?.close().catch(() => {});
}
