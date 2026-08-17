import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;
const BRIDGE_VERSION = '0.2.1';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const SPOOL_DIR = path.join(DATA_DIR, 'spool');

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

const INGEST_URL = required('HIPICO_INGEST_URL');
const BRIDGE_TOKEN = required('HIPICO_GROUP_BRIDGE_TOKEN');

// Legacy HIPICO_GROUP_* remains valid for the first lab-only test.
const SOURCE_GROUP_ID_ENV = String(process.env.HIPICO_SOURCE_GROUP_ID || process.env.HIPICO_GROUP_ID || '').trim();
const SOURCE_GROUP_NAME_ENV = String(process.env.HIPICO_SOURCE_GROUP_NAME || process.env.HIPICO_GROUP_NAME || '').trim();
const LAB_GROUP_ID_ENV = String(process.env.HIPICO_LAB_GROUP_ID || '').trim();
const LAB_GROUP_NAME_ENV = String(process.env.HIPICO_LAB_GROUP_NAME || SOURCE_GROUP_NAME_ENV || '').trim();
const SHADOW_MODE = boolEnv('HIPICO_SHADOW_MODE', false);
const INCLUDE_OWN_MESSAGES = boolEnv('HIPICO_INCLUDE_OWN_MESSAGES', true);
// Independent local kill switch. Phase 1 MUST keep this false even if a future
// backend response accidentally includes a reply action.
const ALLOW_SEND = boolEnv('HIPICO_ALLOW_SEND', false);
const PUPPETEER_NO_SANDBOX = boolEnv('HIPICO_PUPPETEER_NO_SANDBOX', false);

await fs.mkdir(SPOOL_DIR, { recursive: true });

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function targetFile(role) {
  return path.join(DATA_DIR, `target-group-${role}.json`);
}

async function loadSavedTarget(role) {
  try {
    return JSON.parse(await fs.readFile(targetFile(role), 'utf8'));
  } catch {
    return null;
  }
}

async function saveTarget(role, target) {
  await fs.writeFile(targetFile(role), JSON.stringify(target, null, 2), 'utf8');
}

async function resolveTargetGroup(client, role, idEnv, nameEnv) {
  if (idEnv) return { id: idEnv, name: nameEnv || `Grupo ${role}` };
  const saved = await loadSavedTarget(role);
  if (saved?.id && (!nameEnv || saved.name === nameEnv)) return saved;

  const chats = await client.getChats();
  const groups = chats.filter((chat) => chat.isGroup).map((chat) => ({ id: chat.id._serialized, name: chat.name }));

  console.log(`\nGrupos visibles para resolver ${role}:`);
  for (const group of groups) console.log(`- ${group.name} :: ${group.id}`);

  if (!nameEnv) {
    console.log(`\nDefine el nombre exacto para ${role} y reinicia el bridge.`);
    return null;
  }

  const exact = groups.filter((group) => group.name === nameEnv);
  if (exact.length !== 1) {
    console.log(`\nNo se pudo resolver un único grupo ${role} llamado "${nameEnv}". Coincidencias: ${exact.length}`);
    return null;
  }
  await saveTarget(role, exact[0]);
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

async function buildEvent(message, target, channelRole) {
  const groupId = eventGroupId(message);
  return {
    bridgeVersion: BRIDGE_VERSION,
    externalMessageId: message?.id?._serialized || sha256(`${groupId}|${message.timestamp}|${message.body}`),
    groupId,
    groupName: target.name,
    channelRole,
    shadowMode: SHADOW_MODE,
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
  const file = path.join(SPOOL_DIR, `${sha256(`${event.groupId}|${event.externalMessageId}`)}.json`);
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

function responseTargetFor(event, source, lab) {
  if (SHADOW_MODE && event.channelRole === 'source') return lab;
  return event.channelRole === 'lab' ? lab : source;
}

function formatShadowReply(actionText, source) {
  if (!SHADOW_MODE) return String(actionText);
  return `🧪 SOMBRA · ${source.name}\n${String(actionText)}`;
}

async function deliverSpoolFile(client, source, lab, file) {
  let event;
  try {
    event = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    await fs.unlink(file).catch(() => {});
    return;
  }

  try {
    const result = await postEvent(event);
    const actions = Array.isArray(result.actions) ? result.actions : [];

    if (actions.length && !ALLOW_SEND) {
      console.log(`[BLOCKED] ${actions.length} acción(es) de salida retenidas por HIPICO_ALLOW_SEND=false`);
    }

    if (ALLOW_SEND) {
      const responseTarget = responseTargetFor(event, source, lab);
      for (const action of actions) {
        if (action?.type !== 'reply' || !action?.text) continue;
        const text = SHADOW_MODE && event.channelRole === 'source'
          ? formatShadowReply(action.text, source)
          : String(action.text);
        await client.sendMessage(responseTarget.id, text);
      }
    }

    await fs.unlink(file);
    console.log(`[OK] ${event.channelRole}:${event.externalMessageId} -> ${result.classification || 'received'}${result.duplicate ? ' (duplicate)' : ''}`);
  } catch (error) {
    console.error(`[PENDING] ${event.channelRole}:${event.externalMessageId}: ${error.message}`);
  }
}

async function flushSpool(client, source, lab) {
  const entries = (await fs.readdir(SPOOL_DIR)).filter((name) => name.endsWith('.json')).sort();
  for (const name of entries) await deliverSpoolFile(client, source, lab, path.join(SPOOL_DIR, name));
}

const puppeteerArgs = PUPPETEER_NO_SANDBOX
  ? ['--no-sandbox', '--disable-setuid-sandbox']
  : [];

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'hipico-control-group-bridge', dataPath: path.join(DATA_DIR, 'session') }),
  puppeteer: {
    headless: true,
    args: puppeteerArgs
  }
});

let source = null;
let lab = null;
let flushing = false;

client.on('qr', (qr) => {
  console.log('\nEscanea este QR desde WhatsApp/WhatsApp Business > Dispositivos vinculados:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('WhatsApp vinculado.'));
client.on('auth_failure', (message) => console.error('Fallo de autenticación:', message));
client.on('disconnected', (reason) => console.error('WhatsApp desconectado:', reason));

client.on('ready', async () => {
  console.log('WhatsApp Web listo.');
  source = await resolveTargetGroup(client, 'source', SOURCE_GROUP_ID_ENV, SOURCE_GROUP_NAME_ENV);
  if (!source) return;

  if (SHADOW_MODE) {
    lab = await resolveTargetGroup(client, 'lab', LAB_GROUP_ID_ENV, LAB_GROUP_NAME_ENV);
    if (!lab) return;
    if (lab.id === source.id) {
      console.error('SHADOW_MODE requiere que source y lab sean grupos distintos.');
      return;
    }
  } else {
    lab = source;
  }

  console.log(`Fuente: ${source.name} :: ${source.id}`);
  console.log(`Laboratorio: ${lab.name} :: ${lab.id}`);
  console.log(`Ingesta backend: SHADOW-ONLY`);
  console.log(`Envío desde Bridge: ${ALLOW_SEND ? 'HABILITADO' : 'BLOQUEADO'}`);

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

    if (groupId === source.id) {
      target = source;
      channelRole = 'source';
    } else if (SHADOW_MODE && groupId === lab.id) {
      target = lab;
      channelRole = 'lab';
    } else {
      return;
    }

    if (!INCLUDE_OWN_MESSAGES && message.fromMe) return;

    const event = await buildEvent(message, target, channelRole);
    const file = await spool(event); // persist locally before any network call
    await deliverSpoolFile(client, source, lab, file);
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
