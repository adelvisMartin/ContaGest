import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
const BRIDGE_VERSION = '0.1.0';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SPOOL_DIR = path.join(DATA_DIR, 'spool');
const TARGET_FILE = path.join(DATA_DIR, 'target-group.json');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const INGEST_URL = required('HIPICO_INGEST_URL');
const BRIDGE_TOKEN = required('HIPICO_GROUP_BRIDGE_TOKEN');
const GROUP_ID_ENV = String(process.env.HIPICO_GROUP_ID || '').trim();
const GROUP_NAME_ENV = String(process.env.HIPICO_GROUP_NAME || '').trim();
const INCLUDE_OWN_MESSAGES = String(process.env.HIPICO_INCLUDE_OWN_MESSAGES || 'true').toLowerCase() !== 'false';

await fs.mkdir(SPOOL_DIR, { recursive: true });

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

async function loadSavedTarget() {
  try {
    return JSON.parse(await fs.readFile(TARGET_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function saveTarget(target) {
  await fs.writeFile(TARGET_FILE, JSON.stringify(target, null, 2), 'utf8');
}

async function resolveTargetGroup(client) {
  if (GROUP_ID_ENV) return { id: GROUP_ID_ENV, name: GROUP_NAME_ENV || 'Grupo WhatsApp' };
  const saved = await loadSavedTarget();
  if (saved?.id && (!GROUP_NAME_ENV || saved.name === GROUP_NAME_ENV)) return saved;

  const chats = await client.getChats();
  const groups = chats.filter((chat) => chat.isGroup).map((chat) => ({ id: chat.id._serialized, name: chat.name }));

  console.log('\nGrupos visibles para esta sesión:');
  for (const group of groups) console.log(`- ${group.name} :: ${group.id}`);

  if (!GROUP_NAME_ENV) {
    console.log('\nDefine HIPICO_GROUP_NAME con el nombre exacto del grupo y reinicia el bridge.');
    return null;
  }

  const exact = groups.filter((group) => group.name === GROUP_NAME_ENV);
  if (exact.length !== 1) {
    console.log(`\nNo se pudo resolver un único grupo llamado "${GROUP_NAME_ENV}". Coincidencias: ${exact.length}`);
    return null;
  }
  await saveTarget(exact[0]);
  return exact[0];
}

async function quotedMessageId(message) {
  if (!message.hasQuotedMsg) return null;
  try {
    const quoted = await message.getQuotedMessage();
    return quoted?.id?._serialized || null;
  } catch {
    return null;
  }
}

async function senderLabel(message) {
  try {
    const contact = await message.getContact();
    return contact?.pushname || contact?.name || contact?.shortName || '';
  } catch {
    return '';
  }
}

function eventGroupId(message) {
  const from = String(message.from || '');
  const to = String(message.to || '');
  if (from.endsWith('@g.us')) return from;
  if (to.endsWith('@g.us')) return to;
  return '';
}

async function buildEvent(message, target) {
  const groupId = eventGroupId(message);
  return {
    bridgeVersion: BRIDGE_VERSION,
    externalMessageId: message?.id?._serialized || sha256(`${groupId}|${message.timestamp}|${message.body}`),
    groupId,
    groupName: target.name,
    senderId: message.author || (message.fromMe ? 'self' : message.from || ''),
    senderLabel: await senderLabel(message),
    fromMe: Boolean(message.fromMe),
    timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
    type: String(message.type || 'chat'),
    text: String(message.body || ''),
    hasMedia: Boolean(message.hasMedia),
    quotedExternalMessageId: await quotedMessageId(message)
  };
}

async function spool(event) {
  const file = path.join(SPOOL_DIR, `${sha256(event.externalMessageId)}.json`);
  await fs.writeFile(file, JSON.stringify(event), 'utf8');
  return file;
}

async function postEvent(event) {
  const response = await fetch(INGEST_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hipico-bridge-token': BRIDGE_TOKEN
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Backend ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function deliverSpoolFile(client, target, file) {
  let event;
  try {
    event = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    await fs.unlink(file).catch(() => {});
    return;
  }

  try {
    const result = await postEvent(event);
    for (const action of result.actions || []) {
      if (action?.type !== 'reply' || !action?.text) continue;
      await client.sendMessage(target.id, String(action.text));
    }
    await fs.unlink(file);
    console.log(`[OK] ${event.externalMessageId} -> ${result.classification || 'received'}${result.duplicate ? ' (duplicate)' : ''}`);
  } catch (error) {
    console.error(`[PENDING] ${event.externalMessageId}: ${error.message}`);
  }
}

async function flushSpool(client, target) {
  const entries = (await fs.readdir(SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
  for (const name of entries) await deliverSpoolFile(client, target, path.join(SPOOL_DIR, name));
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'hipico-control-group-bridge', dataPath: path.join(DATA_DIR, 'session') }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let target = null;
let flushing = false;

client.on('qr', (qr) => {
  console.log('\nEscanea este QR desde WhatsApp > Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('WhatsApp vinculado.'));
client.on('auth_failure', (message) => console.error('Fallo de autenticación:', message));
client.on('disconnected', (reason) => console.error('WhatsApp desconectado:', reason));

client.on('ready', async () => {
  console.log('WhatsApp Web listo.');
  target = await resolveTargetGroup(client);
  if (!target) return;
  console.log(`Escuchando grupo: ${target.name} :: ${target.id}`);
  await flushSpool(client, target);
  setInterval(() => {
    if (!target || flushing) return;
    flushing = true;
    flushSpool(client, target).finally(() => { flushing = false; });
  }, 5000).unref();
});

client.on('message_create', async (message) => {
  try {
    if (!target) return;
    const groupId = eventGroupId(message);
    if (!groupId || groupId !== target.id) return;
    if (!INCLUDE_OWN_MESSAGES && message.fromMe) return;

    const event = await buildEvent(message, target);
    const file = await spool(event); // persist locally before any network call
    await deliverSpoolFile(client, target, file);
  } catch (error) {
    console.error('No se pudo procesar el mensaje:', error);
  }
});

process.on('SIGINT', async () => {
  console.log('\nCerrando Hípico WhatsApp Bridge...');
  await client.destroy().catch(() => {});
  process.exit(0);
});

console.log('Iniciando Hípico WhatsApp Group Bridge...');
client.initialize();
