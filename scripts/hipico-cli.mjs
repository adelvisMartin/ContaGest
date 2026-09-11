#!/usr/bin/env node

const argv = process.argv.slice(2);
const command = argv[0] || 'help';
const jsonMode = argv.includes('--json');

function option(name, fallback = '') {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? String(argv[index + 1]).trim() : fallback;
}

function safeBase(value) {
  const candidate = String(value || process.env.HIPICO_API_BASE_URL || 'http://127.0.0.1:3030').trim().replace(/\/$/, '');
  const url = new URL(candidate);
  if (url.username || url.password || url.search || url.hash) throw new Error('HIPICO_CLI_BASE_URL_INVALID');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase());
  if (url.protocol === 'http:' && !local) throw new Error('HIPICO_CLI_REMOTE_HTTP_FORBIDDEN');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HIPICO_CLI_PROTOCOL_FORBIDDEN');
  return url.origin;
}

function operatorToken() {
  return String(process.env.HIPICO_OPERATOR_CONTROL_TOKEN || process.env.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
}
function bridgeToken() {
  return String(process.env.HIPICO_GROUP_BRIDGE_TOKEN || '').trim();
}
function groupKey() {
  return option('--group', String(process.env.HIPICO_GROUP_KEY || '').trim());
}
function groupId() {
  return option('--group-id', String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim());
}

function headers(kind = 'public') {
  const result = { Accept: 'application/json' };
  if (kind === 'operator') {
    const token = operatorToken();
    if (token.length < 32) throw new Error('HIPICO_CLI_OPERATOR_TOKEN_NOT_CONFIGURED');
    const group = groupKey();
    if (!/^[A-Za-z0-9._:-]{3,120}$/.test(group)) throw new Error('HIPICO_CLI_GROUP_REQUIRED');
    result['x-hipico-operator-token'] = token;
    result['x-hipico-group-key'] = group;
  }
  if (kind === 'bridge') {
    const token = bridgeToken();
    if (token.length < 32) throw new Error('HIPICO_CLI_BRIDGE_TOKEN_NOT_CONFIGURED');
    result['x-hipico-bridge-token'] = token;
  }
  return result;
}

async function request(path, kind = 'public') {
  const base = safeBase(option('--base-url'));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}${path}`, { headers: headers(kind), redirect: 'error', cache: 'no-store', signal: controller.signal });
    const text = await response.text();
    let body = text;
    try { body = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function print(value) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (typeof value === 'string') process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  return `Control Hípico CLI\n\nUso:\n  npm run hipico -- <comando> [--group CLAVE] [--group-id WHATSAPP_ID] [--base-url URL] [--json]\n\nComandos:\n  version            Versión canónica\n  status             Estado de componentes\n  readiness          Gate de readiness\n  command-center     Estado operacional agregado\n  providers          Providers y capacidades\n  meetings           Meetings del grupo\n  races              Carreras del grupo\n  documents          Documentos del grupo\n  bridge-health      Readiness de integración Bridge\n  doctor             Diagnóstico compuesto, sin mutaciones\n\nSecretos: sólo variables de entorno. No se aceptan tokens como argumentos para evitar historial de shell.`;
}

async function run() {
  if (command === 'help' || command === '--help' || command === '-h') return print(help());
  if (command === 'version') return print(await request('/api/v1/hipico/system/version'));
  if (command === 'status') return print(await request('/api/v1/hipico/system/status'));
  if (command === 'readiness') return print(await request('/api/v1/hipico/system/readiness'));
  if (command === 'providers') return print(await request('/api/v1/hipico/providers', 'operator'));
  if (command === 'meetings') return print(await request('/api/v1/hipico/meetings', 'operator'));
  if (command === 'races') return print(await request('/api/v1/hipico/races', 'operator'));
  if (command === 'documents') return print(await request('/api/v1/hipico/documents', 'operator'));
  if (command === 'bridge-health') return print(await request('/api/v1/hipico-bot/bridge/health', 'bridge'));
  if (command === 'command-center') {
    const id = groupId();
    const search = id ? `?groupId=${encodeURIComponent(id)}` : '';
    return print(await request(`/api/v1/hipico/command-center${search}`, 'operator'));
  }
  if (command === 'doctor') {
    const checks = {};
    const runCheck = async (name, fn) => {
      try { checks[name] = { ok: true, result: await fn() }; }
      catch (error) { checks[name] = { ok: false, error: String(error?.message || error), status: error?.status || null, body: error?.body || null }; }
    };
    await runCheck('version', () => request('/api/v1/hipico/system/version'));
    await runCheck('status', () => request('/api/v1/hipico/system/status'));
    await runCheck('readiness', () => request('/api/v1/hipico/system/readiness'));
    if (operatorToken().length >= 32 && groupKey()) await runCheck('commandCenter', () => request(`/api/v1/hipico/command-center${groupId() ? `?groupId=${encodeURIComponent(groupId())}` : ''}`, 'operator'));
    if (bridgeToken().length >= 32) await runCheck('bridgeHealth', () => request('/api/v1/hipico-bot/bridge/health', 'bridge'));
    const ok = Object.values(checks).every((item) => item.ok);
    print({ ok, checkedAt: new Date().toISOString(), checks });
    if (!ok) process.exitCode = 1;
    return;
  }
  throw new Error(`HIPICO_CLI_UNKNOWN_COMMAND:${command}`);
}

run().catch((error) => {
  const payload = { ok: false, error: String(error?.message || error), status: error?.status || null, body: error?.body || null };
  if (jsonMode) process.stderr.write(`${JSON.stringify(payload)}\n`);
  else process.stderr.write(`Control Hípico CLI: ${payload.error}${payload.status ? ` (${payload.status})` : ''}\n`);
  process.exitCode = 1;
});
