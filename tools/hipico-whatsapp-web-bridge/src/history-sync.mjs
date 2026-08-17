import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright-core';

const VERSION = '1.3.0';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'chrome-profile');
const SPOOL_DIR = path.join(DATA_DIR, 'spool-history');
const SEEN_FILE = path.join(DATA_DIR, 'seen-source-message-ids.json');
const REPORT_FILE = path.join(DATA_DIR, 'history-sync-report.json');
const LOG_FILE = path.join(DATA_DIR, 'bridge.log');

const INGEST_URL = required('HIPICO_INGEST_URL');
const TOKEN = required('HIPICO_GROUP_BRIDGE_TOKEN');
const SOURCE_GROUP_MATCH = requiredAny('HIPICO_SOURCE_GROUP_MATCH', 'HIPICO_SOURCE_GROUP_NAME', 'HIPICO_GROUP_NAME');
const SOURCE_CHANNEL_KEY = envText('HIPICO_SOURCE_CHANNEL_KEY', 'club-hipico-triple-crown-official');
const LAB_CHANNEL_KEY = envText('HIPICO_LAB_CHANNEL_KEY', 'control-hipico-lab');
const MAX_MESSAGES = numberEnv('HIPICO_HISTORY_MAX_MESSAGES', 50000, 100, 250000);
const MAX_MINUTES = numberEnv('HIPICO_HISTORY_MAX_MINUTES', 90, 5, 720);
const IDLE_ROUNDS_LIMIT = numberEnv('HIPICO_HISTORY_IDLE_ROUNDS', 8, 3, 30);
const PAGE_WAIT_MS = numberEnv('HIPICO_HISTORY_PAGE_WAIT_MS', 1200, 500, 5000);
const UPLOAD_CONCURRENCY = numberEnv('HIPICO_HISTORY_UPLOAD_CONCURRENCY', 4, 1, 8);
const BACKEND_TIMEOUT_MS = numberEnv('HIPICO_BACKEND_TIMEOUT_MS', 15000, 5000, 60000);

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(PROFILE_DIR, { recursive: true });
await fs.mkdir(SPOOL_DIR, { recursive: true });

let context = null;
let page = null;
let stopping = false;
let activeSourceTitle = '';
const startedAt = Date.now();
const collected = new Map();
const stats = {
  version: VERSION,
  sourceGroupMatch: SOURCE_GROUP_MATCH,
  sourceChannelKey: SOURCE_CHANNEL_KEY,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  stopReason: null,
  uniqueFound: 0,
  queued: 0,
  delivered: 0,
  duplicates: 0,
  pending: 0,
  earliestSourceTimestamp: null,
  latestSourceTimestamp: null,
  oldestRawMeta: null
};

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
  return String(process.env[name] || '').trim() || fallback;
}
function numberEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function log(line) {
  await fs.appendFile(LOG_FILE, `[${new Date().toISOString()}] HISTORY ${line}\n`, 'utf8').catch(() => {});
}
function elapsedMinutes() {
  return (Date.now() - startedAt) / 60000;
}

async function launchOfficialChrome() {
  const options = { headless: false, viewport: null, locale: 'es-VE', acceptDownloads: false };
  try {
    return { context: await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'chrome' }), channel: 'chrome' };
  } catch (chromeError) {
    await log(`CHROME_LAUNCH_FAIL ${chromeError.message}`);
    try {
      return { context: await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'msedge' }), channel: 'msedge' };
    } catch (edgeError) {
      throw new Error(`No pude abrir Chrome ni Edge. Chrome: ${chromeError.message}. Edge: ${edgeError.message}`);
    }
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

async function waitForLogin() {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (!stopping && Date.now() < deadline) {
    if (await isLoggedIn()) return true;
    console.log('Esperando inicio de sesión de WhatsApp Web...');
    await sleep(2000);
  }
  throw new Error('No se inició sesión en WhatsApp Web dentro de 10 minutos.');
}

async function currentChatTitle() {
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

async function currentChatMatches(match) {
  const title = await currentChatTitle();
  return Boolean(title) && normalize(title).includes(normalize(match));
}

async function clickVisibleGroupCandidate(match) {
  const pane = page.locator('#pane-side');
  if (await pane.count()) {
    const candidate = pane.getByText(match, { exact: false }).first();
    if (await candidate.count() && await candidate.isVisible().catch(() => false)) {
      await candidate.click({ timeout: 4000 });
      await sleep(900);
      return true;
    }
  }
  const titled = page.locator('span[title]').filter({ hasText: match }).first();
  if (await titled.count() && await titled.isVisible().catch(() => false)) {
    await titled.click({ timeout: 4000 });
    await sleep(900);
    return true;
  }
  return false;
}

async function openViaSearch(match) {
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
      await sleep(1200);
      const clicked = await clickVisibleGroupCandidate(match);
      await page.keyboard.press('Escape').catch(() => {});
      if (clicked) return true;
    } catch {}
  }
  return false;
}

async function openSourceGroup() {
  if (await currentChatMatches(SOURCE_GROUP_MATCH)) return true;
  if (await clickVisibleGroupCandidate(SOURCE_GROUP_MATCH) && await currentChatMatches(SOURCE_GROUP_MATCH)) return true;
  if (await openViaSearch(SOURCE_GROUP_MATCH) && await currentChatMatches(SOURCE_GROUP_MATCH)) return true;
  return false;
}

function parseWhatsAppTimestamp(pre) {
  const raw = String(pre || '').trim();
  const m = raw.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([^,]*),\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] || 0);
  const marker = String(m[4] || '').toLowerCase().replace(/\s|\./g, '');
  const day = Number(m[5]);
  const month = Number(m[6]);
  let year = Number(m[7]);
  if (year < 100) year += 2000;
  if (marker.includes('pm') && hour < 12) hour += 12;
  if (marker.includes('am') && hour === 12) hour = 0;
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
  const pad = (v) => String(v).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}-04:00`;
}

async function extractVisibleMessages() {
  return page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[data-id]'));
    const rows = [];
    const used = new Set();
    for (const node of candidates) {
      const preNode = node.querySelector?.('[data-pre-plain-text]') || (node.matches?.('[data-pre-plain-text]') ? node : null);
      if (!preNode) continue;
      const id = String(node.getAttribute('data-id') || '').trim();
      if (!id || used.has(id)) continue;
      const pre = String(preNode.getAttribute('data-pre-plain-text') || '');
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
      const documentName = Array.from(node.querySelectorAll?.('[title], [aria-label]') || [])
        .map((el) => String(el.getAttribute('title') || el.getAttribute('aria-label') || '').trim())
        .find((value) => /\.pdf$|\.docx?$|\.xlsx?$|\.csv$|\.txt$/i.test(value)) || '';
      let senderLabel = '';
      const senderMatch = pre.match(/\]\s*([^:]+):\s*$/);
      if (senderMatch) senderLabel = senderMatch[1].trim();
      rows.push({ id, pre, text, fromMe, hasMedia, mediaKind, documentName, senderLabel });
      used.add(id);
    }
    return rows;
  });
}

async function scrollHistoryUp() {
  return page.evaluate(() => {
    const firstMessage = document.querySelector('#main [data-id]') || document.querySelector('[data-id]');
    if (!firstMessage) return { ok: false, reason: 'no-message' };
    let node = firstMessage.parentElement;
    let scroller = null;
    while (node && node !== document.body) {
      const style = getComputedStyle(node);
      if (node.scrollHeight > node.clientHeight + 150 && /(auto|scroll)/i.test(style.overflowY || '')) {
        scroller = node;
        break;
      }
      node = node.parentElement;
    }
    if (!scroller) {
      const candidates = Array.from(document.querySelectorAll('#main div, main div'));
      scroller = candidates.find((el) => el.scrollHeight > el.clientHeight + 300) || null;
    }
    if (!scroller) return { ok: false, reason: 'no-scroller' };
    const before = { top: scroller.scrollTop, height: scroller.scrollHeight, client: scroller.clientHeight };
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    return { ok: true, before };
  });
}

function addRows(rows) {
  let added = 0;
  for (const row of rows) {
    if (!row?.id || collected.has(row.id)) continue;
    row.sourceTimestamp = parseWhatsAppTimestamp(row.pre);
    collected.set(row.id, row);
    added += 1;
  }
  return added;
}

async function crawlHistory() {
  let idleRounds = 0;
  let round = 0;
  while (!stopping) {
    round += 1;
    const rows = await extractVisibleMessages();
    const added = addRows(rows);
    stats.uniqueFound = collected.size;
    if (added === 0) idleRounds += 1;
    else idleRounds = 0;

    const timestamps = [...collected.values()].map((row) => row.sourceTimestamp).filter(Boolean).sort();
    stats.earliestSourceTimestamp = timestamps[0] || null;
    stats.latestSourceTimestamp = timestamps.at(-1) || null;
    const oldest = [...collected.values()].find((row) => row.sourceTimestamp === stats.earliestSourceTimestamp);
    stats.oldestRawMeta = oldest?.pre || stats.oldestRawMeta;

    console.log(`[HISTORICO] ronda ${round} · únicos ${collected.size} · nuevos ${added} · sin nuevos ${idleRounds}/${IDLE_ROUNDS_LIMIT}`);
    await log(`CRAWL round=${round} unique=${collected.size} added=${added} idle=${idleRounds}`);

    if (collected.size >= MAX_MESSAGES) { stats.stopReason = 'max_messages'; break; }
    if (elapsedMinutes() >= MAX_MINUTES) { stats.stopReason = 'max_minutes'; break; }
    if (idleRounds >= IDLE_ROUNDS_LIMIT) { stats.stopReason = 'stable_oldest_available'; break; }

    const moved = await scrollHistoryUp();
    if (!moved.ok) {
      idleRounds += 1;
      await log(`SCROLL_WARN ${moved.reason}`);
    }
    await sleep(PAGE_WAIT_MS);
  }
  if (!stats.stopReason) stats.stopReason = stopping ? 'interrupted' : 'completed';
}

function rowToEvent(row) {
  const fallbackSender = row.fromMe ? 'self' : (row.senderLabel || 'unknown');
  const sourceTimestamp = row.sourceTimestamp || new Date().toISOString();
  return {
    bridgeVersion: `official-web-history-${VERSION}`,
    externalMessageId: String(row.id || '').slice(0, 320),
    groupId: `official-web:${sha256(SOURCE_CHANNEL_KEY).slice(0, 32)}`,
    groupName: activeSourceTitle || SOURCE_GROUP_MATCH,
    channelKey: SOURCE_CHANNEL_KEY,
    labChannelKey: LAB_CHANNEL_KEY,
    channelRole: 'source',
    shadowMode: true,
    historySync: true,
    senderId: String(fallbackSender).slice(0, 220),
    senderLabel: String(row.senderLabel || '').slice(0, 220),
    fromMe: Boolean(row.fromMe),
    timestamp: sourceTimestamp,
    type: row.hasMedia ? 'media' : 'chat',
    mediaKind: row.mediaKind || 'none',
    mediaName: String(row.documentName || '').slice(0, 240),
    text: String(row.text || '').slice(0, 4000),
    hasMedia: Boolean(row.hasMedia),
    quotedExternalMessageId: null,
    rawMeta: String(row.pre || '').slice(0, 500)
  };
}

async function queueHistoryEvent(event) {
  const file = path.join(SPOOL_DIR, `${sha256(`${event.channelKey}|${event.externalMessageId}`)}.json`);
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(event), 'utf8');
    stats.queued += 1;
  }
  return file;
}

async function backendPost(event) {
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hipico-bridge-token': TOKEN },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS)
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(`Backend ${response.status}: ${body?.error || raw.slice(0, 240) || response.statusText}`);
  return body;
}

async function markSeen(id) {
  let data = [];
  try {
    const parsed = JSON.parse(await fs.readFile(SEEN_FILE, 'utf8'));
    if (Array.isArray(parsed)) data = parsed;
  } catch {}
  if (!data.includes(id)) {
    data.push(id);
    if (data.length > 250000) data = data.slice(-250000);
    await fs.writeFile(SEEN_FILE, JSON.stringify(data), 'utf8');
  }
}

async function deliverHistoryFile(file) {
  let event;
  try { event = JSON.parse(await fs.readFile(file, 'utf8')); }
  catch { await fs.unlink(file).catch(() => {}); return; }
  try {
    const result = await backendPost(event);
    if (result?.duplicate) stats.duplicates += 1;
    else stats.delivered += 1;
    await markSeen(event.externalMessageId);
    await fs.unlink(file).catch(() => {});
  } catch (error) {
    stats.pending += 1;
    await log(`UPLOAD_PENDING ${event?.externalMessageId || 'unknown'} ${error.message}`);
  }
}

async function uploadAll() {
  const rows = [...collected.values()].sort((a, b) => {
    const ta = a.sourceTimestamp ? Date.parse(a.sourceTimestamp) : Number.MAX_SAFE_INTEGER;
    const tb = b.sourceTimestamp ? Date.parse(b.sourceTimestamp) : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
  for (const row of rows) await queueHistoryEvent(rowToEvent(row));

  const files = (await fs.readdir(SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, Math.max(1, files.length)) }, async () => {
    while (!stopping) {
      const index = cursor++;
      if (index >= files.length) break;
      await deliverHistoryFile(path.join(SPOOL_DIR, files[index]));
      if ((index + 1) % 50 === 0) console.log(`[SUBIDA] ${index + 1}/${files.length}`);
    }
  });
  await Promise.all(workers);
}

async function writeReport() {
  stats.finishedAt = new Date().toISOString();
  const remaining = (await fs.readdir(SPOOL_DIR).catch(() => [])).filter((name) => name.endsWith('.json')).length;
  stats.pending = remaining;
  await fs.writeFile(REPORT_FILE, JSON.stringify(stats, null, 2), 'utf8');
  console.log('\n================ HISTORICO ================');
  console.log(`Grupo: ${activeSourceTitle || SOURCE_GROUP_MATCH}`);
  console.log(`Mensajes únicos visibles recuperados: ${stats.uniqueFound}`);
  console.log(`Entregados nuevos: ${stats.delivered}`);
  console.log(`Ya existentes/deduplicados: ${stats.duplicates}`);
  console.log(`Pendientes locales: ${stats.pending}`);
  console.log(`Más antiguo recuperado: ${stats.earliestSourceTimestamp || 'sin fecha extraíble'}`);
  console.log(`Más reciente recuperado: ${stats.latestSourceTimestamp || 'sin fecha extraíble'}`);
  console.log(`Fin: ${stats.stopReason}`);
  console.log(`Reporte: ${REPORT_FILE}`);
  console.log('============================================\n');
}

async function main() {
  console.log('\n========================================================');
  console.log(' Control Hípico - Sincronización histórica v1.3.0');
  console.log(' CLUB HIPICO TRIPLE CROWN · SOLO LECTURA');
  console.log('========================================================\n');
  console.log('Se cargará hacia arriba hasta que WhatsApp Web deje de entregar mensajes más antiguos, o hasta alcanzar los límites configurados.');
  console.log('No se enviará ningún mensaje al grupo oficial ni al laboratorio durante el backfill.\n');

  const launched = await launchOfficialChrome();
  context = launched.context;
  page = context.pages()[0] || await context.newPage();
  await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForLogin();

  if (!(await openSourceGroup())) throw new Error(`No pude abrir el grupo fuente que contiene: ${SOURCE_GROUP_MATCH}`);
  activeSourceTitle = await currentChatTitle();
  if (!normalize(activeSourceTitle).includes(normalize(SOURCE_GROUP_MATCH))) throw new Error('El header activo no coincide con el grupo oficial configurado.');

  console.log(`Fuente histórica activa: ${activeSourceTitle}`);
  await log(`START v=${VERSION} title=${activeSourceTitle}`);
  await crawlHistory();
  console.log('\nCrawl terminado. Subiendo evidencia shadow idempotente...');
  await uploadAll();
  await writeReport();
}

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

main().catch(async (error) => {
  stats.stopReason = `error:${error.message}`;
  console.error(`FALLO HISTORICO: ${error.message}`);
  await log(`FAIL ${error.stack || error.message}`);
  await writeReport().catch(() => {});
  process.exitCode = 1;
}).finally(async () => {
  try { await context?.close(); } catch {}
});
