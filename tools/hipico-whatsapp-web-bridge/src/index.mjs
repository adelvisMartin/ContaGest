import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const VERSION = '1.2.0';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const EVENT_SPOOL_DIR = path.join(DATA_DIR, 'spool-events');
const MIRROR_SPOOL_DIR = path.join(DATA_DIR, 'spool-lab-mirror');
const SEEN_FILE = path.join(DATA_DIR, 'seen-source-message-ids.json');
const LEGACY_SEEN_FILE = path.join(DATA_DIR, 'seen-message-ids.json');
const LOG_FILE = path.join(DATA_DIR, 'bridge.log');
const ERROR_SCREENSHOT = path.join(DATA_DIR, 'last-error.png');

const INGEST_URL = required('HIPICO_INGEST_URL');
const TOKEN = required('HIPICO_GROUP_BRIDGE_TOKEN');
const SOURCE_GROUP_MATCH = requiredAny('HIPICO_SOURCE_GROUP_MATCH', 'HIPICO_SOURCE_GROUP_NAME', 'HIPICO_GROUP_NAME');
const SOURCE_CHANNEL_KEY = envText('HIPICO_SOURCE_CHANNEL_KEY', 'club-hipico-triple-crown-official');
const LAB_GROUP_NAME = envText('HIPICO_LAB_GROUP_NAME', 'Control hípico lab');
const LAB_CHANNEL_KEY = envText('HIPICO_LAB_CHANNEL_KEY', 'control-hipico-lab');
const LAB_SEND_ENABLED = boolEnv('HIPICO_LAB_SEND_ENABLED', false);
const POLL_MS = numberEnv('HIPICO_POLL_MS', 1000, 500, 5000);
const BACKEND_TIMEOUT_MS = numberEnv('HIPICO_BACKEND_TIMEOUT_MS', 15000, 5000, 60000);

if (normalize(SOURCE_GROUP_MATCH) === normalize(LAB_GROUP_NAME)) {
  throw new Error('El grupo fuente y el grupo de laboratorio deben ser distintos.');
}

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(PROFILE_DIR, { recursive: true });
await fs.mkdir(EVENT_SPOOL_DIR, { recursive: true });
await fs.mkdir(MIRROR_SPOOL_DIR, { recursive: true });

let context = null;
let page = null;
let seen = await loadSeen();
let sourceBaselineCompleted = false;
let activeSourceTitle = '';
let flushingEvents = false;
let flushingMirrors = false;
let stopping = false;
let seenSaveTimer = null;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta variable ${name}`);
  return value;
}

function requiredAny(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  throw new Error(`Falta una de estas variables: ${names.join(', ')}`);
}

function envText(name, fallback = '') {
  const value = String(process.env[name] || '').trim();
  return value || fallback;
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

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function loadSeen() {
  for (const file of [SEEN_FILE, LEGACY_SEEN_FILE]) {
    try {
      const data = JSON.parse(await fs.readFile(file, 'utf8'));
      if (Array.isArray(data)) return new Set(data.filter(Boolean).slice(-10000));
    } catch {}
  }
  return new Set();
}

async function saveSeenNow() {
  const values = [...seen].slice(-10000);
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
  if (seen.size >= 10000) {
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
    const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'chrome' });
    return { context: ctx, channel: 'chrome' };
  } catch (chromeError) {
    await log(`CHROME_LAUNCH_FAIL ${chromeError.message}`);
    console.log(`Chrome no pudo arrancar por Playwright: ${chromeError.message}`);
    console.log('Intentando Microsoft Edge...');
    try {
      const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'msedge' });
      return { context: ctx, channel: 'msedge' };
    } catch (edgeError) {
      throw new Error(`No pude abrir Chrome ni Edge. Chrome: ${chromeError.message}. Edge: ${edgeError.message}`);
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
    const err = new Error(`Backend ${response.status}: ${body?.error || raw.slice(0, 240) || response.statusText}`);
    err.retryable = body?.retryable !== false;
    throw err;
  }
  return body;
}

async function spoolJson(dir, key, value) {
  const file = path.join(dir, `${sha256(key)}.json`);
  await fs.writeFile(file, JSON.stringify(value), 'utf8');
  return file;
}

async function queueEvent(event) {
  return spoolJson(EVENT_SPOOL_DIR, `${event.channelKey}|${event.externalMessageId}`, event);
}

async function queueMirror(mirror) {
  return spoolJson(MIRROR_SPOOL_DIR, mirror.sourceExternalMessageId, mirror);
}

async function deliverEventFile(file) {
  let event;
  try {
    event = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    await fs.unlink(file).catch(() => {});
    return;
  }

  try {
    const result = await backendPost(event);
    if (LAB_SEND_ENABLED && result?.labSimulation?.text && event.channelRole === 'source') {
      await queueMirror({
        sourceExternalMessageId: event.externalMessageId,
        sourceGroupName: event.groupName,
        sourceChannelKey: event.channelKey,
        labGroupName: LAB_GROUP_NAME,
        labChannelKey: LAB_CHANNEL_KEY,
        mirrorTag: String(result.labSimulation.mirrorTag || `[SHADOW:${sha256(event.externalMessageId).slice(0, 10)}]`),
        text: String(result.labSimulation.text).slice(0, 3900),
        createdAt: new Date().toISOString()
      });
    }
    await fs.unlink(file).catch(() => {});
    console.log(`[OK] ${event.text || '[media]'} -> ${result?.classification || 'received'}${result?.duplicate ? ' (duplicate)' : ''}`);
    await log(`DELIVERED role=${event.channelRole} ${event.externalMessageId} ${result?.classification || 'received'}`);
  } catch (error) {
    console.error(`[PENDING] ${event.externalMessageId}: ${error.message}`);
    await log(`PENDING ${event.externalMessageId} ${error.message}`);
  }
}

async function flushEventSpool() {
  if (flushingEvents) return;
  flushingEvents = true;
  try {
    const files = (await fs.readdir(EVENT_SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
    for (const name of files) await deliverEventFile(path.join(EVENT_SPOOL_DIR, name));
  } finally {
    flushingEvents = false;
  }
}

async function isLoggedIn() {
  if (!page || page.isClosed()) return false;
  return page.evaluate(() => Boolean(
    document.querySelector('#pane-side') ||
    document.querySelector('[data-testid="chat-list"]') ||
    document.querySelector('[aria-label*="Lista de chats"]') ||
    document.querySelector('[aria-label*="Chat list"]')
  )).catch(() => false);
}

async function currentChatTitle() {
  if (!page || page.isClosed()) return '';
  return page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('header'));
    for (const header of headers) {
      const titles = Array.from(header.querySelectorAll('span[title], [data-testid="conversation-info-header-chat-title"][title]'))
        .map((el) => String(el.getAttribute('title') || '').trim())
        .filter((value) => value.length > 1);
      if (titles.length) return titles[0];
    }
    return '';
  }).catch(() => '');
}

async function currentChatMatches(name, exact = true) {
  const title = await currentChatTitle();
  if (!title) return false;
  return exact ? normalize(title) === normalize(name) : normalize(title).includes(normalize(name));
}

async function clickVisibleGroupCandidate(match, exact = true) {
  const pane = page.locator('#pane-side');
  if (await pane.count()) {
    const candidate = pane.getByText(match, { exact }).first();
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 4000 });
      await sleep(700);
      return true;
    }
  }

  const titled = page.locator('span[title]').filter({ hasText: match }).first();
  if (await titled.count() && await titled.isVisible().catch(() => false)) {
    await titled.click({ timeout: 4000 });
    await sleep(700);
    return true;
  }
  return false;
}

async function openViaSearch(match, exact = true) {
  const searchCandidates = [
    page.getByRole('textbox', { name: /buscar|search/i }).first(),
    page.locator('div[contenteditable="true"][data-tab="3"]').first(),
    page.locator('div[contenteditable="true"][role="textbox"]').first()
  ];

  for (const search of searchCandidates) {
    try {
      if (!(await search.count()) || !(await search.isVisible().catch(() => false))) continue;
      await search.click({ timeout: 2000 });
      await page.keyboard.press('Control+A').catch(() => {});
      await page.keyboard.insertText(match);
      await sleep(1000);
      const clicked = await clickVisibleGroupCandidate(match, exact);
      await page.keyboard.press('Escape').catch(() => {});
      if (clicked) return true;
    } catch {}
  }
  return false;
}

async function openGroup(match, exact = true) {
  if (await currentChatMatches(match, exact)) return true;
  if (await clickVisibleGroupCandidate(match, exact)) {
    if (await currentChatMatches(match, exact)) return true;
  }
  if (await openViaSearch(match, exact)) {
    if (await currentChatMatches(match, exact)) return true;
  }
  return false;
}

async function extractVisibleMessages() {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[data-id]'));
    const rows = [];
    const used = new Set();

    for (const node of candidates) {
      const preNode = node.querySelector?.('[data-pre-plain-text]') || (node.matches?.('[data-pre-plain-text]') ? node : null);
      if (!preNode) continue;
      const pre = String(preNode.getAttribute('data-pre-plain-text') || '');
      const id = String(node.getAttribute('data-id') || '').trim();
      if (!id || used.has(id)) continue;

      const textNodes = Array.from(preNode.querySelectorAll?.('span.selectable-text, span[dir="ltr"], span[dir="auto"]') || []);
      let text = textNodes.map((el) => (el.innerText || '').trim()).filter(Boolean).join('\n').trim();
      if (!text) text = String(preNode.innerText || '').trim();

      const classText = String(node.className || '');
      const parentClass = String(node.parentElement?.className || '');
      const fromMe = classText.includes('message-out') || parentClass.includes('message-out') || Boolean(node.closest?.('.message-out'));
      const hasImage = Boolean(node.querySelector?.('img, canvas'));
      const hasVideo = Boolean(node.querySelector?.('video'));
      const hasAudio = Boolean(node.querySelector?.('audio, [data-icon*="audio"], [data-icon*="ptt"]'));
      const hasDocument = Boolean(node.querySelector?.('[data-icon*="document"], [data-icon*="doc"], a[href$=".pdf"], [aria-label$=".pdf"]'));
      const hasMedia = hasImage || hasVideo || hasAudio || hasDocument;
      const mediaKind = hasDocument ? 'document' : hasAudio ? 'audio' : hasVideo ? 'video' : hasImage ? 'image' : 'none';
      let senderLabel = '';
      const senderMatch = pre.match(/\]\s*([^:]+):\s*$/);
      if (senderMatch) senderLabel = senderMatch[1].trim();

      rows.push({ id, pre, text, fromMe, hasMedia, mediaKind, senderLabel, htmlHint: String(node.getAttribute('class') || '').slice(0, 160) });
      used.add(id);
    }
    return rows;
  });
}

async function baselineSourceMessages() {
  const rows = await extractVisibleMessages().catch(() => []);
  let added = 0;
  for (const row of rows) {
    if (!seen.has(row.id)) added += 1;
    rememberSeen(row.id);
  }
  await saveSeenNow();
  sourceBaselineCompleted = true;
  console.log(`Baseline fuente: ${rows.length} mensaje(s) visibles ignorados como historial; ${added} ID(s) incorporados.`);
  await log(`SOURCE_BASELINE visible=${rows.length} added=${added}`);
}

function rowToSourceEvent(row) {
  const externalId = String(row.id || '').slice(0, 320);
  const fallbackSender = row.fromMe ? 'self' : (row.senderLabel || 'unknown');
  return {
    bridgeVersion: `official-web-playwright-${VERSION}`,
    externalMessageId: externalId,
    groupId: `official-web:${sha256(SOURCE_CHANNEL_KEY).slice(0, 32)}`,
    groupName: activeSourceTitle || SOURCE_GROUP_MATCH,
    channelKey: SOURCE_CHANNEL_KEY,
    labChannelKey: LAB_CHANNEL_KEY,
    channelRole: 'source',
    shadowMode: true,
    senderId: String(fallbackSender).slice(0, 220),
    senderLabel: String(row.senderLabel || '').slice(0, 220),
    fromMe: Boolean(row.fromMe),
    timestamp: new Date().toISOString(),
    type: row.hasMedia ? 'media' : 'chat',
    mediaKind: row.mediaKind || 'none',
    text: String(row.text || '').slice(0, 4000),
    hasMedia: Boolean(row.hasMedia),
    quotedExternalMessageId: null,
    rawMeta: String(row.pre || '').slice(0, 500)
  };
}

async function processSourceRows() {
  const rows = await extractVisibleMessages();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const event = rowToSourceEvent(row);
    const file = await queueEvent(event);
    rememberSeen(row.id);
    await deliverEventFile(file);
  }
  await flushEventSpool();
}

async function visibleLabHasTag(tag) {
  return page.evaluate((needle) => {
    const messages = Array.from(document.querySelectorAll('.message-out, [data-id]')).slice(-80);
    return messages.some((node) => String(node.innerText || '').includes(needle));
  }, tag).catch(() => false);
}

async function sendMirrorToLab(mirror) {
  if (!LAB_SEND_ENABLED) return false;
  if (normalize(mirror.labGroupName) !== normalize(LAB_GROUP_NAME)) throw new Error('Destino lab no autorizado.');
  if (!(await openGroup(LAB_GROUP_NAME, true))) throw new Error(`No pude abrir el grupo lab exacto: ${LAB_GROUP_NAME}`);
  if (!(await currentChatMatches(LAB_GROUP_NAME, true))) throw new Error('Guard de destino lab fallo. Envio cancelado.');

  if (await visibleLabHasTag(mirror.mirrorTag)) {
    await log(`LAB_ALREADY_VISIBLE ${mirror.sourceExternalMessageId} ${mirror.mirrorTag}`);
    return true;
  }

  const composerCandidates = [
    page.locator('footer div[contenteditable="true"][role="textbox"]').last(),
    page.locator('footer div[contenteditable="true"]').last()
  ];
  let composer = null;
  for (const candidate of composerCandidates) {
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      composer = candidate;
      break;
    }
  }
  if (!composer) throw new Error('No encontre el compositor de WhatsApp en el grupo lab.');

  await composer.click({ timeout: 3000 });
  await page.keyboard.insertText(String(mirror.text).slice(0, 3900));
  await page.keyboard.press('Enter');
  await sleep(800);

  if (!(await visibleLabHasTag(mirror.mirrorTag))) {
    throw new Error('No pude verificar visualmente el mensaje shadow en el grupo lab.');
  }
  await log(`LAB_SENT ${mirror.sourceExternalMessageId} ${mirror.mirrorTag}`);
  return true;
}

async function deliverMirrorFile(file) {
  let mirror;
  try {
    mirror = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    await fs.unlink(file).catch(() => {});
    return;
  }

  try {
    if (await sendMirrorToLab(mirror)) {
      await fs.unlink(file).catch(() => {});
      console.log(`[LAB] ${mirror.mirrorTag} enviado a ${LAB_GROUP_NAME}`);
    }
  } catch (error) {
    console.error(`[LAB PENDING] ${mirror?.sourceExternalMessageId || 'unknown'}: ${error.message}`);
    await log(`LAB_PENDING ${mirror?.sourceExternalMessageId || 'unknown'} ${error.message}`);
  } finally {
    const returned = await openGroup(SOURCE_GROUP_MATCH, false).catch(() => false);
    if (returned) activeSourceTitle = await currentChatTitle();
  }
}

async function flushMirrorSpool() {
  if (!LAB_SEND_ENABLED || flushingMirrors) return;
  flushingMirrors = true;
  try {
    const files = (await fs.readdir(MIRROR_SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
    for (const name of files) await deliverMirrorFile(path.join(MIRROR_SPOOL_DIR, name));
  } finally {
    flushingMirrors = false;
  }
}

async function monitor() {
  let lastStatus = '';
  while (!stopping && page && !page.isClosed()) {
    try {
      if (!(await isLoggedIn())) {
        if (lastStatus !== 'login') {
          console.log('\nWhatsApp Web oficial esta abierto. Si ves QR, vinculalo desde Dispositivos vinculados.\n');
          lastStatus = 'login';
        }
        await sleep(1500);
        continue;
      }

      if (!(await currentChatMatches(SOURCE_GROUP_MATCH, false))) {
        if (!(await openGroup(SOURCE_GROUP_MATCH, false))) {
          if (lastStatus !== 'choose-source') {
            console.log(`\nNo encontre automaticamente el grupo fuente que contiene: "${SOURCE_GROUP_MATCH}".`);
            console.log('Puede estar archivado; el Bridge tambien intenta la busqueda global de WhatsApp Web.\n');
            lastStatus = 'choose-source';
          }
          await sleep(1200);
          continue;
        }
      }

      activeSourceTitle = await currentChatTitle();
      if (!activeSourceTitle || !normalize(activeSourceTitle).includes(normalize(SOURCE_GROUP_MATCH))) {
        throw new Error('El header activo no coincide con el grupo fuente configurado.');
      }

      if (lastStatus !== 'monitoring') {
        console.log(`\nFuente activa: ${activeSourceTitle}`);
        console.log(`Canal canonico: ${SOURCE_CHANNEL_KEY}`);
        console.log('Fuente: SOLO LECTURA. Nunca se envia al grupo oficial desde este Bridge.');
        console.log(`Lab: ${LAB_GROUP_NAME} (${LAB_SEND_ENABLED ? 'mirror habilitado' : 'mirror deshabilitado'})`);
        console.log('Operaciones monetarias/reales: BLOQUEADAS.\n');
        await log(`SOURCE_ACTIVE title=${activeSourceTitle} key=${SOURCE_CHANNEL_KEY} labSend=${LAB_SEND_ENABLED}`);
        lastStatus = 'monitoring';
      }

      if (!sourceBaselineCompleted) await baselineSourceMessages();
      else await processSourceRows();

      await flushEventSpool();
      await flushMirrorSpool();
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
  console.log('\n========================================================');
  console.log(' Control Hipico - WhatsApp Web Bridge v1.2.0');
  console.log(' Fuente oficial READ-ONLY -> laboratorio SHADOW');
  console.log(' Browser oficial + Playwright 1.62.1');
  console.log('========================================================\n');
  console.log('Este Bridge abre https://web.whatsapp.com/ real; no implementa el protocolo de WhatsApp.');
  console.log(`Fuente buscada: ${SOURCE_GROUP_MATCH}`);
  console.log(`Lab: ${LAB_GROUP_NAME}`);
  console.log(`Envio al lab: ${LAB_SEND_ENABLED ? 'HABILITADO' : 'DESHABILITADO'}`);
  console.log('Envio al grupo fuente: IMPOSIBLE POR DISENO.');
  console.log(`Seen IDs fuente cargados: ${seen.size}\n`);

  const launched = await launchOfficialChrome();
  context = launched.context;
  console.log(`Navegador controlado: ${launched.channel}`);
  page = context.pages()[0] || await context.newPage();
  context.on('page', (newPage) => { if (!page || page.isClosed()) page = newPage; });
  context.on('close', () => { stopping = true; });

  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await log(`START v=${VERSION} channel=${launched.channel} seen=${seen.size}`);
  await flushEventSpool();
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
