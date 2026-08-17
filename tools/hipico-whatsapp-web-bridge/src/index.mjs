import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const VERSION = '1.1.0';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const SPOOL_DIR = path.join(DATA_DIR, 'spool');
const SEEN_FILE = path.join(DATA_DIR, 'seen-message-ids.json');
const LOG_FILE = path.join(DATA_DIR, 'bridge.log');
const ERROR_SCREENSHOT = path.join(DATA_DIR, 'last-error.png');

const INGEST_URL = required('HIPICO_INGEST_URL');
const TOKEN = required('HIPICO_GROUP_BRIDGE_TOKEN');
const GROUP_NAME = required('HIPICO_GROUP_NAME');
const ALLOW_SEND = boolEnv('HIPICO_ALLOW_SEND', false);
const POLL_MS = numberEnv('HIPICO_POLL_MS', 1000, 500, 5000);
const BACKEND_TIMEOUT_MS = numberEnv('HIPICO_BACKEND_TIMEOUT_MS', 15000, 5000, 60000);

if (ALLOW_SEND) {
  throw new Error('HIPICO_ALLOW_SEND debe permanecer false. Este Bridge es solo de lectura.');
}

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(PROFILE_DIR, { recursive: true });
await fs.mkdir(SPOOL_DIR, { recursive: true });

let context = null;
let page = null;
let seen = await loadSeen();
let baselineCompletedThisRun = false;
let targetWasActive = false;
let flushing = false;
let stopping = false;
let seenSaveTimer = null;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta variable ${name}`);
  return value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function numberEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

async function loadSeen() {
  try {
    const data = JSON.parse(await fs.readFile(SEEN_FILE, 'utf8'));
    return new Set(Array.isArray(data) ? data.filter(Boolean).slice(-5000) : []);
  } catch {
    return new Set();
  }
}

async function saveSeenNow() {
  const values = [...seen].slice(-5000);
  await fs.writeFile(SEEN_FILE, JSON.stringify(values), 'utf8').catch(() => {});
}

function scheduleSeenSave() {
  if (seenSaveTimer) return;
  seenSaveTimer = setTimeout(() => {
    seenSaveTimer = null;
    saveSeenNow().catch(() => {});
  }, 250);
  seenSaveTimer.unref?.();
}

function rememberSeen(id) {
  if (!id) return;
  if (seen.size >= 5000) {
    const oldest = seen.values().next().value;
    if (oldest) seen.delete(oldest);
  }
  seen.add(id);
  scheduleSeenSave();
}

async function log(line) {
  await fs.appendFile(LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, 'utf8').catch(() => {});
}

async function screenshot(tag = 'error') {
  if (!page || page.isClosed()) return;
  try {
    await page.screenshot({ path: ERROR_SCREENSHOT, fullPage: false });
    await log(`SCREENSHOT ${tag} ${ERROR_SCREENSHOT}`);
  } catch {}
}

async function launchOfficialChrome() {
  const options = {
    headless: false,
    viewport: null,
    locale: 'es-VE',
    acceptDownloads: false
  };

  try {
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      ...options,
      channel: 'chrome'
    });
    return { context: ctx, channel: 'chrome' };
  } catch (chromeError) {
    await log(`CHROME_LAUNCH_FAIL ${chromeError.message}`);
    console.log(`Chrome no pudo arrancar por Playwright: ${chromeError.message}`);
    console.log('Intentando Microsoft Edge...');

    try {
      const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
        ...options,
        channel: 'msedge'
      });
      return { context: ctx, channel: 'msedge' };
    } catch (edgeError) {
      throw new Error(
        `No pude abrir Chrome ni Edge. Chrome: ${chromeError.message}. Edge: ${edgeError.message}`
      );
    }
  }
}

async function backendPost(event) {
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hipico-bridge-token': TOKEN
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
  });

  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}

  if (!response.ok) {
    throw new Error(`Backend ${response.status}: ${body?.error || raw.slice(0, 240) || response.statusText}`);
  }

  return body;
}

async function spool(event) {
  const file = path.join(SPOOL_DIR, `${sha256(`${event.groupId}|${event.externalMessageId}`)}.json`);
  await fs.writeFile(file, JSON.stringify(event), 'utf8');
  return file;
}

async function deliverFile(file) {
  let event;
  try {
    event = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    await fs.unlink(file).catch(() => {});
    return;
  }

  try {
    const result = await backendPost(event);
    await fs.unlink(file).catch(() => {});
    console.log(`[OK] ${event.text || '[media]'} -> ${result?.classification || 'received'}${result?.duplicate ? ' (duplicate)' : ''}`);
    await log(`DELIVERED ${event.externalMessageId} ${result?.classification || 'received'}`);
  } catch (error) {
    console.error(`[PENDING] ${event.externalMessageId}: ${error.message}`);
    await log(`PENDING ${event.externalMessageId} ${error.message}`);
  }
}

async function flushSpool() {
  if (flushing) return;
  flushing = true;
  try {
    const files = (await fs.readdir(SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
    for (const name of files) {
      await deliverFile(path.join(SPOOL_DIR, name));
    }
  } finally {
    flushing = false;
  }
}

async function isLoggedIn() {
  if (!page || page.isClosed()) return false;
  return page.evaluate(() => {
    return Boolean(
      document.querySelector('#pane-side') ||
      document.querySelector('[data-testid="chat-list"]') ||
      document.querySelector('[aria-label*="Lista de chats"]') ||
      document.querySelector('[aria-label*="Chat list"]')
    );
  }).catch(() => false);
}

async function tryOpenTargetFromSidebar() {
  if (!page || page.isClosed()) return false;

  try {
    const pane = page.locator('#pane-side');
    if (await pane.count()) {
      const byText = pane.getByText(GROUP_NAME, { exact: true }).first();
      if (await byText.count() && await byText.isVisible().catch(() => false)) {
        await byText.click({ timeout: 3000 });
        await sleep(800);
        return true;
      }
    }
  } catch {}

  try {
    const titled = page.locator(`span[title="${GROUP_NAME.replaceAll('"', '\\"')}"]`).first();
    if (await titled.count() && await titled.isVisible().catch(() => false)) {
      await titled.click({ timeout: 3000 });
      await sleep(800);
      return true;
    }
  } catch {}

  return false;
}

async function currentChatMatchesTarget() {
  if (!page || page.isClosed()) return false;
  return page.evaluate((name) => {
    const headers = Array.from(document.querySelectorAll('header'));
    return headers.some((header) => {
      const text = (header.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.includes(name)) return true;

      const titled = Array.from(header.querySelectorAll('[title]'));
      return titled.some((el) => String(el.getAttribute('title') || '').trim() === name);
    });
  }, GROUP_NAME).catch(() => false);
}

async function extractVisibleMessages() {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[data-id]'));
    const rows = [];
    const used = new Set();

    for (const node of candidates) {
      const preNode = node.querySelector?.('[data-pre-plain-text]') ||
        (node.matches?.('[data-pre-plain-text]') ? node : null);

      if (!preNode) continue;

      const pre = String(preNode.getAttribute('data-pre-plain-text') || '');
      const id = String(node.getAttribute('data-id') || '').trim();
      if (!id || used.has(id)) continue;

      const textNodes = Array.from(
        preNode.querySelectorAll?.('span.selectable-text, span[dir="ltr"], span[dir="auto"]') || []
      );

      let text = textNodes
        .map((el) => (el.innerText || '').trim())
        .filter(Boolean)
        .join('\n')
        .trim();

      if (!text) {
        text = String(preNode.innerText || '').trim();
      }

      const classText = String(node.className || '');
      const parentClass = String(node.parentElement?.className || '');
      const fromMe =
        classText.includes('message-out') ||
        parentClass.includes('message-out') ||
        Boolean(node.closest?.('.message-out'));

      const hasMedia = Boolean(node.querySelector?.('img, video, audio, canvas'));
      let senderLabel = '';

      const senderMatch = pre.match(/\]\s*([^:]+):\s*$/);
      if (senderMatch) senderLabel = senderMatch[1].trim();

      rows.push({
        id,
        pre,
        text,
        fromMe,
        hasMedia,
        senderLabel,
        htmlHint: String(node.getAttribute('class') || '').slice(0, 160)
      });
      used.add(id);
    }

    return rows;
  });
}

async function baselineCurrentMessages() {
  const rows = await extractVisibleMessages().catch(() => []);
  let added = 0;
  for (const row of rows) {
    if (!seen.has(row.id)) added += 1;
    rememberSeen(row.id);
  }
  await saveSeenNow();
  baselineCompletedThisRun = true;
  console.log(`Baseline del grupo: ${rows.length} mensaje(s) visibles ignorados como historial; ${added} ID(s) nuevos incorporados al baseline.`);
  await log(`BASELINE visible=${rows.length} added=${added}`);
}

function rowToEvent(row) {
  const externalId = String(row.id || '').slice(0, 320);
  const fallbackSender = row.fromMe ? 'self' : (row.senderLabel || 'unknown');

  return {
    bridgeVersion: `official-web-playwright-${VERSION}`,
    externalMessageId: externalId,
    groupId: `official-web:${sha256(GROUP_NAME).slice(0, 32)}`,
    groupName: GROUP_NAME,
    channelRole: 'lab',
    shadowMode: true,
    senderId: String(fallbackSender).slice(0, 220),
    senderLabel: String(row.senderLabel || '').slice(0, 220),
    fromMe: Boolean(row.fromMe),
    timestamp: new Date().toISOString(),
    type: row.hasMedia ? 'media' : 'chat',
    text: String(row.text || '').slice(0, 4000),
    hasMedia: Boolean(row.hasMedia),
    quotedExternalMessageId: null,
    rawMeta: String(row.pre || '').slice(0, 500)
  };
}

async function processVisibleRows() {
  const rows = await extractVisibleMessages();
  for (const row of rows) {
    if (seen.has(row.id)) continue;

    const event = rowToEvent(row);
    const file = await spool(event);
    rememberSeen(row.id);
    await deliverFile(file);
  }
  await flushSpool();
}

async function monitor() {
  let lastStatus = '';

  while (!stopping && page && !page.isClosed()) {
    try {
      if (!(await isLoggedIn())) {
        if (lastStatus !== 'login') {
          console.log('');
          console.log('WhatsApp Web oficial esta abierto.');
          console.log('Si ves un QR en Chrome, escanealo desde:');
          console.log('WhatsApp/WhatsApp Business > Dispositivos vinculados > Vincular dispositivo.');
          console.log('');
          lastStatus = 'login';
        }
        targetWasActive = false;
        await sleep(1500);
        continue;
      }

      if (lastStatus === 'login') {
        console.log('WhatsApp Web inicio sesion.');
        await log('LOGIN_OK');
        await tryOpenTargetFromSidebar();
      }

      const targetActive = await currentChatMatchesTarget();

      if (!targetActive) {
        if (lastStatus !== 'choose-target') {
          console.log('');
          console.log(`Abre el grupo "${GROUP_NAME}" en la ventana de WhatsApp Web.`);
          console.log('Si aparece en la lista lateral intentare abrirlo automaticamente.');
          console.log('');
          lastStatus = 'choose-target';
        }
        targetWasActive = false;
        await tryOpenTargetFromSidebar();
        await sleep(1000);
        continue;
      }

      if (!targetWasActive) {
        console.log('');
        console.log(`Grupo activo: ${GROUP_NAME}`);
        console.log('Modo backend: SHADOW-ONLY');
        console.log('Respuestas automaticas: BLOQUEADAS');
        console.log('Operaciones monetarias: BLOQUEADAS');
        console.log('');

        // Baseline only once per process. If the user temporarily changes chat,
        // reconnects or the target reactivates, keep the existing seen IDs and
        // process any new visible messages instead of silently rebasing them.
        if (!baselineCompletedThisRun) await baselineCurrentMessages();
        else await processVisibleRows();

        targetWasActive = true;
        lastStatus = 'monitoring';
      }

      await processVisibleRows();
      await sleep(POLL_MS);
    } catch (error) {
      console.error(`Monitor: ${error.message}`);
      await log(`MONITOR_ERROR ${error.stack || error.message}`);
      await screenshot('monitor-error');
      await sleep(2000);
    }
  }
}

async function main() {
  console.log('');
  console.log('========================================================');
  console.log(' Control Hipico - WhatsApp Web Bridge');
  console.log(' Browser oficial + Playwright 1.62.1');
  console.log('========================================================');
  console.log('');
  console.log('Este Bridge NO implementa el protocolo de WhatsApp.');
  console.log('Abre y utiliza https://web.whatsapp.com/ real.');
  console.log(`Seen IDs persistentes cargados: ${seen.size}`);
  console.log('');

  const launched = await launchOfficialChrome();
  context = launched.context;
  console.log(`Navegador controlado: ${launched.channel}`);

  page = context.pages()[0] || await context.newPage();

  context.on('page', (newPage) => {
    if (!page || page.isClosed()) page = newPage;
  });

  context.on('close', () => {
    stopping = true;
  });

  await page.goto('https://web.whatsapp.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });

  await log(`START channel=${launched.channel} seen=${seen.size}`);
  await flushSpool();
  await monitor();
}

process.on('SIGINT', async () => {
  stopping = true;
  console.log('\nCerrando Bridge...');
  try { await saveSeenNow(); } catch {}
  try { await context?.close(); } catch {}
  process.exit(0);
});

process.on('uncaughtException', async (error) => {
  console.error('UNCAUGHT:', error);
  await log(`UNCAUGHT ${error.stack || error.message}`);
  await screenshot('uncaught');
});

process.on('unhandledRejection', async (reason) => {
  console.error('UNHANDLED:', reason);
  await log(`UNHANDLED ${reason?.stack || reason}`);
  await screenshot('unhandled');
});

main().catch(async (error) => {
  console.error(`FALLO DE INICIO: ${error.message}`);
  await log(`START_FAIL ${error.stack || error.message}`);
  await screenshot('start-fail');
  process.exitCode = 1;
});
