#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const GROUP_RE = /^[A-Za-z0-9._:-]{3,120}$/;
const GROUP_ID_RE = /^[A-Za-z0-9@._:-]{3,220}$/;

function cleanBaseUrl(value) {
  const raw = String(value || process.env.HIPICO_API_BASE_URL || 'http://127.0.0.1:3030').trim().replace(/\/$/, '');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('HIPICO_CLI_INVALID_BASE_URL');
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase());
  if (url.protocol === 'http:' && !local) throw new Error('HIPICO_CLI_REMOTE_HTTP_FORBIDDEN');
  return url.origin;
}

function option(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]).trim() : fallback;
}

export function parseCommand(argv) {
  const args = [...argv];
  const json = args.includes('--json');
  const group = option(args, '--group', String(process.env.HIPICO_GROUP_KEY || '').trim());
  const groupId = option(args, '--group-id', String(process.env.HIPICO_SOURCE_GROUP_ID || '').trim());
  const baseUrl = option(args, '--base-url', String(process.env.HIPICO_API_BASE_URL || '').trim());
  const limitRaw = option(args, '--limit', '50');
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitRaw, 10) || 50));
  const valueArgs = args.filter((arg, index) => {
    if (arg === '--json') return false;
    if (['--group', '--group-id', '--base-url', '--limit'].includes(arg)) return false;
    if (index > 0 && ['--group', '--group-id', '--base-url', '--limit'].includes(args[index - 1])) return false;
    return true;
  });
  return { json, group, groupId, baseUrl, limit, command: valueArgs[0] || 'help', subcommand: valueArgs[1] || '', value: valueArgs[2] || '' };
}

function operatorToken() {
  return String(process.env.HIPICO_OPERATOR_CONTROL_TOKEN || process.env.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
}
function bridgeToken() {
  return String(process.env.HIPICO_GROUP_BRIDGE_TOKEN || '').trim();
}
function requireOperator() {
  const token = operatorToken();
  if (Buffer.byteLength(token, 'utf8') < 32) throw new Error('HIPICO_CLI_OPERATOR_TOKEN_NOT_CONFIGURED');
  return token;
}
function requireGroup(group) {
  if (!GROUP_RE.test(String(group || ''))) throw new Error('HIPICO_CLI_GROUP_REQUIRED');
  return group;
}
function requireGroupId(groupId) {
  if (!GROUP_ID_RE.test(String(groupId || ''))) throw new Error('HIPICO_CLI_GROUP_ID_INVALID');
  return groupId;
}

export function commandRequest(parsed) {
  const key = `${parsed.command} ${parsed.subcommand}`.trim();
  const group = encodeURIComponent(parsed.group || '');
  const mappings = new Map([
    ['status', ['/api/v1/hipico/system/status', 'GET', 'public']],
    ['health', ['/api/v1/hipico/system/readiness', 'GET', 'public']],
    ['readiness', ['/api/v1/hipico/system/readiness', 'GET', 'public']],
    ['version', ['/api/v1/hipico/system/version', 'GET', 'public']],
    ['bridge status', ['/api/v1/hipico-bot/bridge/health', 'GET', 'bridge']],
    ['bridge-health', ['/api/v1/hipico-bot/bridge/health', 'GET', 'bridge']],
    ['channel status', ['/api/v1/hipico/system/status', 'GET', 'public']],
    ['groups', ['/api/v1/hipico/groups', 'GET', 'operator']],
    ['meetings', ['/api/v1/hipico/meetings', 'GET', 'operator-group']],
    ['races', ['/api/v1/hipico/races', 'GET', 'operator-group']],
    ['documents', ['/api/v1/hipico/documents', 'GET', 'operator-group']],
    ['providers', ['/api/v1/hipico/providers', 'GET', 'operator']],
    ['messages tail', [`/api/v1/hipico/messages?limit=${parsed.limit}`, 'GET', 'operator-group']],
    ['events tail', [`/api/v1/hipico/events/stream?limit=${parsed.limit}`, 'GET', 'operator-group']]
  ]);
  if (parsed.command === 'command-center') {
    const suffix = parsed.groupId ? `?groupId=${encodeURIComponent(requireGroupId(parsed.groupId))}` : '';
    return [`/api/v1/hipico/command-center${suffix}`, 'GET', 'operator-group'];
  }
  if (parsed.command === 'trace') {
    const id = String(parsed.subcommand || '').trim();
    if (!/^[A-Za-z0-9._:-]{3,120}$/.test(id)) throw new Error('HIPICO_CLI_INVALID_TRACE_ID');
    return [`/api/v1/hipico/trace/${encodeURIComponent(id)}`, 'GET', 'operator-group'];
  }
  return mappings.get(key) || mappings.get(parsed.command) || null;
}

function headersFor(kind, parsed) {
  const headers = { Accept: 'application/json' };
  if (kind === 'bridge') {
    const token = bridgeToken();
    if (Buffer.byteLength(token, 'utf8') < 32) throw new Error('HIPICO_CLI_BRIDGE_TOKEN_NOT_CONFIGURED');
    headers['x-hipico-bridge-token'] = token;
  }
  if (kind === 'operator' || kind === 'operator-group') headers['x-hipico-operator-token'] = requireOperator();
  if (kind === 'operator-group') headers['x-hipico-group-key'] = requireGroup(parsed.group);
  return headers;
}

async function request(path, method, kind, parsed) {
  const base = cleanBaseUrl(parsed.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}${path}`, { method, headers: headersFor(kind, parsed), redirect: 'error', cache: 'no-store', signal: controller.signal });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; }
    catch { data = { raw: text.slice(0, 2000) }; }
    return { ok: response.ok, status: response.status, path, data };
  } finally { clearTimeout(timer); }
}

async function doctor(parsed) {
  const checks = [];
  const run = async (path, kind) => {
    try { checks.push(await request(path, 'GET', kind, parsed)); }
    catch (error) { checks.push({ ok: false, status: 0, path, code: error?.message || 'HIPICO_CLI_UNAVAILABLE' }); }
  };
  await run('/api/v1/hipico/system/version', 'public');
  await run('/api/v1/hipico/system/status', 'public');
  await run('/api/v1/hipico/system/readiness', 'public');
  if (Buffer.byteLength(operatorToken(), 'utf8') >= 32 && GROUP_RE.test(parsed.group)) {
    const suffix = parsed.groupId && GROUP_ID_RE.test(parsed.groupId) ? `?groupId=${encodeURIComponent(parsed.groupId)}` : '';
    await run(`/api/v1/hipico/command-center${suffix}`, 'operator-group');
  }
  if (Buffer.byteLength(bridgeToken(), 'utf8') >= 32) await run('/api/v1/hipico-bot/bridge/health', 'bridge');
  return { ok: checks.every((item) => item.ok), command: 'doctor', checkedAt: new Date().toISOString(), checks };
}

function help() {
  return {
    ok: true,
    commands: [
      'status', 'doctor', 'health', 'readiness', 'version', 'bridge status', 'bridge-health', 'channel status',
      'command-center', 'groups', 'meetings', 'races', 'documents', 'providers',
      'messages tail', 'events tail', 'trace <correlationId>'
    ],
    flags: ['--group <groupKey>', '--group-id <whatsappGroupId>', '--limit <1..200>', '--base-url <url>', '--json'],
    security: 'Los tokens sólo se leen desde variables de entorno; nunca se aceptan por argumentos.'
  };
}

function print(result, json) {
  if (json) return process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.command === 'doctor') {
    process.stdout.write(`Control Hípico doctor: ${result.ok ? 'OK' : 'NO LISTO'}\n`);
    for (const check of result.checks) process.stdout.write(`- ${check.path}: ${check.ok ? 'OK' : check.code || `HTTP ${check.status || 0}`}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCommand(argv);
  let result;
  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') result = help();
  else if (parsed.command === 'doctor') result = await doctor(parsed);
  else {
    try {
      const mapped = commandRequest(parsed);
      if (!mapped) result = { ok: false, code: 'HIPICO_CLI_UNKNOWN_COMMAND', command: [parsed.command, parsed.subcommand].filter(Boolean).join(' ') };
      else result = await request(mapped[0], mapped[1], mapped[2], parsed);
    } catch (error) {
      result = { ok: false, status: 0, code: error?.name === 'AbortError' ? 'HIPICO_CLI_TIMEOUT' : String(error?.message || 'HIPICO_CLI_UNAVAILABLE') };
    }
  }
  print(result, parsed.json);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
