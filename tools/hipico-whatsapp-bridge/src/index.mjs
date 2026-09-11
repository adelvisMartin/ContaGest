import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
const BRIDGE_VERSION = '0.3.2-shadow-only';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SPOOL_DIR = path.join(DATA_DIR, 'spool');
const REJECTED_DIR = path.join(DATA_DIR, 'rejected');
const CHANNEL_KEY_RE = /^[A-Za-z0-9_-]{3,120}$/;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function isSafeHttpsEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

function isGroupId(value) {
  return /^\d{5,}-\d+@g\.us$/i.test(String(value || '').trim());
}

const INGEST_URL = required('HIPICO_INGEST_URL');
const BRIDGE_TOKEN = required('HIPICO_GROUP_BRIDGE_TOKEN');
const SOURCE_GROUP_ID_ENV = String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim();
const SOURCE_GROUP_NAME_ENV = String(process.env.HIPICO_SOURCE_GROUP_NAME || '').trim();
const LAB_GROUP_ID_ENV = String(process.env.HIPICO_LAB_GROUP_ID || '').trim();
const LAB_GROUP_NAME_ENV = String(process.env.HIPICO_LAB_GROUP_NAME || '').trim();
const SOURCE_CHANNEL_KEY = String(process.env.HIPICO_SOURCE_CHANNEL_KEY || 'club-hipico-triple-crown-official').trim();
const LAB_CHANNEL_KEY = String(process.env.HIPICO_LAB_CHANNEL_KEY || 'control-hipico-lab').trim();
const SHADOW_MODE = boolEnv('HIPICO_SHADOW_MODE', true);
const INCLUDE_OWN_MESSAGES = boolEnv('HIPICO_INCLUDE_OWN_MESSAGES', true);
const ALLOW_SEND = boolEnv('HIPICO_ALLOW_SEND', false);
const PUPPETEER_NO_SANDBOX = boolEnv('HIPICO_PUPPETEER_NO_SANDBOX', false);

if (!SHADOW_MODE) throw new Error('Legacy Hípico bridge is shadow-only. HIPICO_SHADOW_MODE must be true.');
if (!isSafeHttpsEndpoint(INGEST_URL)) throw new Error('HIPICO_INGEST_URL must be a credential-free HTTPS endpoint without query or fragment.');
if (BRIDGE_TOKEN.length < 32) throw new Error('HIPICO_GROUP_BRIDGE_TOKEN must contain at least 32 characters.');
if (!isGroupId(SOURCE_GROUP_ID_ENV) || !isGroupId(LAB_GROUP_ID_ENV)) {
  throw new Error('Legacy Hípico bridge requires pinned HIPICO_SOURCE_GROUP_ID and HIPICO_LAB_GROUP_ID.');
}
if (SOURCE_GROUP_ID_ENV === LAB_GROUP_ID_ENV) throw new Error('SOURCE and LAB group IDs must be different.');
if (!CHANNEL_KEY_RE.test(SOURCE_CHANNEL_KEY) || !CHANNEL_KEY_RE.test(LAB_CHANNEL_KEY) || SOURCE_CHANNEL_KEY === LAB_CHANNEL_KEY) {
  throw new Error('SOURCE and LAB channel keys must be valid and different.');
}

await Promise.all([
  fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 }),
  fs.mkdir(SPOOL_DIR, { recursive: true, mode: 0o700 }),
  fs.mkdir(REJECTED_DIR, { recursive: true, mode: 0o700 })
]);
await Promise.all([DATA_DIR, SPOOL_DIR, REJECTED_DIR].map((dir) => fs.chmod(dir, 0o700).catch(() => {})));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function safeRef(value) {
  return sha256(value).slice(0, 12);
}

async function resolvePinnedGroup(client, role, id, configuredName) {
  try {
    const chat = await client.getChatById(id);
    if (!chat?.isGroup || chat.id?._serialized !== id) return null;
    return { id, name: configuredName || chat.name || `Grupo ${role}` };
  } catch {
    return null;
  }
}

async function quotedMessageId(message) {
  if (!message.hasQuotedMsg) return null;
  try {
    const quoted = await message.getQuotedMessage();
    return quoted?.id?._serialized || null;
  } catch { return null; }
}

async function senderLabel(message) {
  try {
    const contact = await message.getContact();
    return contact?.pushname || contact?.name || contact?.shortName || '';
  } catch { return ''; }
}

function eventGroupId(message) {
  const from = String(message.from || '');
  const to = String(message.to || '');
  if (from.endsWith('@g.us')) return from;
  if (to.endsWith('@g.us')) return to;
  return '';
}

async function buildEvent(message, target, channelRole) {
  const groupId = eventGroupId(message);
  return {
    bridgeVersion: BRIDGE_VERSION,
    externalMessageId: message?.id?._serialized || sha256(`${groupId}|${message.timestamp}|${message.body}`),
    groupId,
    groupName: target.name,
    channelKey: channelRole === 'source' ? SOURCE_CHANNEL_KEY : LAB_CHANNEL_KEY,
    labChannelKey: LAB_CHANNEL_KEY,
    channelRole,
    shadowMode: true,
    historySync: false,
    senderId: message.author || (message.fromMe ? 'self' : message.from || ''),
    senderLabel: await senderLabel(message),
    fromMe: Boolean(message.fromMe),
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
    type: String(message.type || 'chat').slice(0, 80),
    mediaKind: message.hasMedia ? 'unknown' : 'none',
    mediaName: '',
    text: String(message.body || '').slice(0, 4000),
    hasMedia: Boolean(message.hasMedia),
    quotedExternalMessageId: await quotedMessageId(message),
    quoteDepth: message.hasQuotedMsg ? 1 : 0,
    rawMeta: ''
  };
}

function replaySignature(event) {
  return sha256(JSON.stringify([
    String(event?.groupId || ''),
    String(event?.externalMessageId || ''),
    String(event?.channelRole || ''),
    String(event?.senderId || ''),
    String(event?.timestamp || ''),
    String(event?.type || ''),
    String(event?.text || ''),
    event?.quotedExternalMessageId == null ? null : String(event.quotedExternalMessageId),
    Boolean(event?.fromMe)
  ]));
}

async function spool(event) {
  const file = path.join(SPOOL_DIR, `${sha256(`${event.groupId}|${event.externalMessageId}`)}.json`);
  const serialized = JSON.stringify(event);
  try {
    await fs.writeFile(file, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return file;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    let existing;
    try { existing = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch {
      await quarantine(file, { code: 'INVALID_EXISTING_LOCAL_SPOOL', retryable: false });
      await fs.writeFile(file, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      return file;
    }
    if (replaySignature(existing) === replaySignature(event)) return file;
    const mismatch = new Error('Local spool message ID was reused with different content.');
    mismatch.code = 'HIPICO_LOCAL_SPOOL_REPLAY_MISMATCH';
    mismatch.retryable = false;
    throw mismatch;
  }
}

function safeJson(text) {
  try { return text ? JSON.parse(text) : {}; }
  catch { return {}; }
}

async function postEvent(event) {
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hipico-bridge-token': BRIDGE_TOKEN },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  const payload = safeJson(text);
  if (!response.ok) {
    const error = new Error(`Backend ${response.status}`);
    error.status = response.status;
    error.retryable = payload?.retryable === false ? false : response.status >= 500 || response.status === 408 || response.status === 429;
    error.code = String(payload?.error || `HTTP_${response.status}`).slice(0, 120);
    throw error;
  }
  return payload;
}

async function quarantine(file, reason = {}) {
  const base = path.basename(file).replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = path.join(REJECTED_DIR, `${Date.now()}-${base}`);
  await fs.rename(file, destination).catch(async (error) => {
    if (error?.code !== 'EXDEV') throw error;
    await fs.copyFile(file, destination);
    await fs.unlink(file);
  });
  await fs.chmod(destination, 0o600).catch(() => {});
  const metadata = {
    rejectedAt: new Date().toISOString(),
    status: Number.isInteger(reason?.status) ? reason.status : null,
    code: String(reason?.code || reason?.message || 'INVALID_LOCAL_SPOOL').slice(0, 120),
    retryable: false
  };
  await fs.writeFile(`${destination}.meta.json`, JSON.stringify(metadata, null, 2), { encoding: 'utf8', mode: 0o600 });
  return destination;
}

function labTextFor(result, source) {
  const serverText = String(result?.labSimulation?.text || '').trim();
  if (!serverText) return '';
  return `🧪 SOMBRA · ${source.name}\n${serverText}`.slice(0, 4000);
}

async function deliverSpoolFile(client, source, lab, file) {
  let event;
  try {
    event = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    const rejected = await quarantine(file, { code: 'INVALID_LOCAL_SPOOL', retryable: false }).catch(() => null);
    console.error(`[REJECTED] spool local inválido${rejected ? ` -> ${path.basename(rejected)}` : ''}`);
    return;
  }

  const ref = safeRef(`${event.groupId}|${event.externalMessageId}`);
  try {
    const result = await postEvent(event);
    const labText = event.channelRole === 'source' ? labTextFor(result, source) : '';
    if (labText && !ALLOW_SEND) console.log('[BLOCKED] LAB simulation retained because HIPICO_ALLOW_SEND=false');
    if (ALLOW_SEND && labText) await client.sendMessage(lab.id, labText);
    await fs.unlink(file);
    console.log(`[OK] ${event.channelRole}:${ref} -> ${result.classification || 'received'}${result.duplicate ? ' (duplicate)' : ''}`);
  } catch (error) {
    if (error?.retryable === false) {
      const rejected = await quarantine(file, error).catch(() => null);
      console.error(`[REJECTED] ${event.channelRole}:${ref}: status=${error?.status || 'n/a'} code=${error?.code || 'PERMANENT_REJECTION'}${rejected ? ` -> ${path.basename(rejected)}` : ''}`);
      return;
    }
    console.error(`[PENDING] ${event.channelRole}:${ref}: ${error?.message || 'retryable bridge failure'}`);
  }
}

async function flushSpool(client, source, lab) {
  const entries = (await fs.readdir(SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
  for (const name of entries) await deliverSpoolFile(client, source, lab, path.join(SPOOL_DIR, name));
}

const puppeteerArgs = PUPPETEER_NO_SANDBOX ? ['--no-sandbox', '--disable-setuid-sandbox'] : [];
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'hipico-control-group-bridge', dataPath: path.join(DATA_DIR, 'session') }),
  puppeteer: { headless: true, args: puppeteerArgs }
});

let source = null;
let lab = null;
let flushing = false;

client.on('qr', (qr) => {
  console.log('\nEscanea este QR desde WhatsApp/WhatsApp Business > Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});
client.on('authenticated', () => console.log('WhatsApp vinculado.'));
client.on('auth_failure', () => console.error('Fallo de autenticación de WhatsApp.'));
client.on('disconnected', () => console.error('WhatsApp desconectado.'));

client.on('ready', async () => {
  console.log('WhatsApp Web listo · bridge fallback SHADOW-ONLY.');
  source = await resolvePinnedGroup(client, 'source', SOURCE_GROUP_ID_ENV, SOURCE_GROUP_NAME_ENV);
  lab = await resolvePinnedGroup(client, 'lab', LAB_GROUP_ID_ENV, LAB_GROUP_NAME_ENV);
  if (!source || !lab) {
    console.error('No se pudieron verificar los grupos SOURCE/LAB pinneados.');
    source = null;
    lab = null;
    return;
  }
  if (lab.id === source.id) {
    console.error('SOURCE y LAB deben ser grupos distintos.');
    source = null;
    lab = null;
    return;
  }

  console.log(`SOURCE verificado: ${safeRef(source.id)} · SOLO LECTURA`);
  console.log(`LAB verificado: ${safeRef(lab.id)} · envío ${ALLOW_SEND ? 'HABILITADO' : 'BLOQUEADO'}`);

  await flushSpool(client, source, lab);
  setInterval(() => {
    if (!source || !lab || flushing) return;
    flushing = true;
    flushSpool(client, source, lab).finally(() => { flushing = false; });
  }, 5000).unref();
});

client.on('message_create', async (message) => {
  try {
    if (!source || !lab) return;
    const groupId = eventGroupId(message);
    let target = null;
    let channelRole = null;
    if (groupId === source.id) { target = source; channelRole = 'source'; }
    else if (groupId === lab.id) { target = lab; channelRole = 'lab'; }
    else return;
    if (!INCLUDE_OWN_MESSAGES && message.fromMe) return;

    const event = await buildEvent(message, target, channelRole);
    const file = await spool(event);
    await deliverSpoolFile(client, source, lab, file);
  } catch (error) {
    const ref = safeRef(message?.id?._serialized || `${message?.timestamp || ''}|${message?.from || ''}`);
    console.error(`No se pudo procesar el mensaje ${ref}: ${error?.code || error?.message || 'bridge_error'}`);
  }
});

process.on('SIGINT', async () => {
  console.log('\nCerrando Hípico WhatsApp Bridge...');
  await client.destroy().catch(() => {});
  process.exit(0);
});

console.log('Iniciando Hípico WhatsApp Group Bridge fallback SHADOW-ONLY...');
client.initialize();