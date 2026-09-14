#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3030';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_TAIL = 100;
const GROUP_KEY_RE = /^[A-Za-z0-9._:-]{1,120}$/;
const SECRET_KEY = /(token|secret|authorization|cookie|password|credential|api[_-]?key)/i;

function isLoopback(hostname) {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(hostname || '').toLowerCase());
}

export function cleanBaseUrl(value = process.env.HIPICO_API_BASE_URL || DEFAULT_BASE_URL) {
  const url = new URL(String(value || DEFAULT_BASE_URL).trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error('HIPICO_CLI_INVALID_BASE_URL'), { code: 'HIPICO_CLI_INVALID_BASE_URL' });
  }
  if (url.pathname && url.pathname !== '/') {
    throw Object.assign(new Error('HIPICO_CLI_INVALID_BASE_URL'), { code: 'HIPICO_CLI_INVALID_BASE_URL' });
  }
  if (url.protocol !== 'https:' && !isLoopback(url.hostname)) {
    throw Object.assign(new Error('HIPICO_CLI_REMOTE_HTTP_FORBIDDEN'), { code: 'HIPICO_CLI_REMOTE_HTTP_FORBIDDEN' });
  }
  return url.origin;
}

function optionValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]).trim() : fallback;
}

export function parseCommand(argv) {
  const args = [...argv];
  const json = args.includes('--json');
  const group = optionValue(args, '--group', String(process.env.HIPICO_GROUP_KEY || '').trim());
  const filtered = args.filter((arg, index) => {
    if (arg === '--json' || arg === '--group') return false;
    if (index > 0 && args[index - 1] === '--group') return false;
    return true;
  });
  const command = filtered[0] || 'help';
  return { json, group, command, subcommand: filtered[1] || '', value: filtered[2] || '' };
}

function boundedTail(value) {
  const number = Number(value || 50);
  return Number.isInteger(number) && number >= 1 ? Math.min(MAX_TAIL, number) : 50;
}

function canonicalGroupPlan(parsed, path) {
  const group = String(parsed.group || '').trim();
  if (!GROUP_KEY_RE.test(group)) return { local: 'group-required', group };
  return { path, auth: 'operator-group', group };
}

export function commandPlan(parsed) {
  const key = `${parsed.command} ${parsed.subcommand}`.trim();
  const tail = boundedTail(parsed.value || parsed.subcommand);
  if (parsed.command === 'trace') {
    const correlationId = String(parsed.subcommand || '').trim();
    if (!/^[A-Za-z0-9._:-]{3,120}$/.test(correlationId)) {
      return { local: 'invalid-trace', correlationId };
    }
    return canonicalGroupPlan(parsed, `/api/v1/hipico/trace/${encodeURIComponent(correlationId)}`);
  }
  const plans = new Map([
    ['status', { path: '/api/v1/hipico/system/status', auth: 'none' }],
    ['health', { path: '/api/v1/hipico/system/readiness', auth: 'none' }],
    ['version', { path: '/api/v1/hipico/system/version', auth: 'none' }],
    ['bridge status', { path: '/api/v1/hipico-bot/bridge/health', auth: 'bridge' }],
    ['channel status', { path: '/api/v1/hipico/system/status', auth: 'none', transform: 'channel' }],
    ['groups', { path: '/api/v1/hipico/groups', auth: 'operator' }],
    ['messages tail', canonicalGroupPlan(parsed, `/api/v1/hipico/messages?limit=${tail}`)],
    ['events tail', canonicalGroupPlan(parsed, `/api/v1/hipico/events?limit=${tail}`)]
  ]);
  return plans.get(key) || plans.get(parsed.command) || null;
}

function configuredSecrets(source = process.env) {
  return [source.HIPICO_GROUP_BRIDGE_TOKEN, source.HIPICO_OPERATOR_CONTROL_TOKEN]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

export function redact(value, source = process.env, key = '') {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, source));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, source, childKey)]));
  }
  if (typeof value === 'string') {
    let output = value;
    for (const secret of configuredSecrets(source)) {
      if (secret.length >= 8) output = output.split(secret).join('[REDACTED]');
    }
    return output;
  }
  return value;
}

function authHeaders(auth, source = process.env, group = '') {
  const headers = {};
  if (auth === 'bridge') {
    const token = String(source.HIPICO_GROUP_BRIDGE_TOKEN || '').trim();
    if (!token) throw Object.assign(new Error('HIPICO_CLI_BRIDGE_TOKEN_NOT_CONFIGURED'), { code: 'HIPICO_CLI_BRIDGE_TOKEN_NOT_CONFIGURED' });
    headers['x-hipico-bridge-token'] = token;
  }
  if (auth === 'operator' || auth === 'operator-group') {
    const token = String(source.HIPICO_OPERATOR_CONTROL_TOKEN || '').trim();
    if (!token) throw Object.assign(new Error('HIPICO_CLI_OPERATOR_TOKEN_NOT_CONFIGURED'), { code: 'HIPICO_CLI_OPERATOR_TOKEN_NOT_CONFIGURED' });
    headers['x-hipico-operator-token'] = token;
  }
  if (auth === 'operator-group') {
    const normalizedGroup = String(group || '').trim();
    if (!GROUP_KEY_RE.test(normalizedGroup)) {
      throw Object.assign(new Error('HIPICO_CLI_GROUP_REQUIRED'), { code: 'HIPICO_CLI_GROUP_REQUIRED' });
    }
    headers['x-hipico-group-key'] = normalizedGroup;
  }
  return headers;
}

async function readBoundedResponse(response) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw Object.assign(new Error('HIPICO_CLI_RESPONSE_TOO_LARGE'), { code: 'HIPICO_CLI_RESPONSE_TOO_LARGE' });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw Object.assign(new Error('HIPICO_CLI_RESPONSE_TOO_LARGE'), { code: 'HIPICO_CLI_RESPONSE_TOO_LARGE' });
  const text = bytes.toString('utf8');
  try { return text ? JSON.parse(text) : null; }
  catch { return { raw: text.slice(0, 2000) }; }
}

export async function requestPlan(plan, options = {}) {
  const source = options.source || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const base = cleanBaseUrl(options.baseUrl || source.HIPICO_API_BASE_URL || DEFAULT_BASE_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${base}${plan.path}`, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...authHeaders(plan.auth, source, plan.group) }
    });
    const data = await readBoundedResponse(response);
    return { ok: response.ok, status: response.status, path: plan.path, data: redact(data, source) };
  } finally {
    clearTimeout(timer);
  }
}

function eventRows(result) {
  const data = result?.data?.data ?? result?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function transformResult(result, plan) {
  if (!plan?.transform) return result;
  if (plan.transform === 'channel' || plan.transform === 'groups') {
    const status = result?.data?.data || result?.data || {};
    const channel = status?.components?.channel || { state: 'unknown', reason: 'STATUS_UNAVAILABLE' };
    if (plan.transform === 'channel') return { ...result, data: { channel } };
    return { ...result, data: { sourceLabPinned: channel.state !== 'not_configured', channelState: channel.state, reason: channel.reason || null } };
  }
  const rows = eventRows(result);
  if (plan.transform === 'messages') {
    return { ...result, data: rows.map((row) => ({
      id: row?.id ?? null,
      providerMessageId: row?.providerMessageId ?? row?.provider_message_id ?? null,
      sender: row?.sender ?? null,
      messageType: row?.messageType ?? row?.message_type ?? null,
      body: row?.body ?? row?.raw_text ?? null,
      createdAt: row?.createdAt ?? row?.created_at ?? null
    })) };
  }
  if (plan.transform === 'trace') {
    const needle = String(plan.correlationId || '');
    const matches = rows.filter((row) => JSON.stringify(redact(row)).includes(needle));
    return { ...result, data: { correlationId: needle, matches, scanned: rows.length } };
  }
  return { ...result, data: rows };
}

async function doctor(options = {}) {
  const checks = [];
  for (const plan of [
    { path: '/api/v1/hipico/system/version', auth: 'none' },
    { path: '/api/v1/hipico/system/status', auth: 'none' },
    { path: '/api/v1/hipico-bot/bridge/health', auth: 'bridge' }
  ]) {
    try { checks.push(await requestPlan(plan, options)); }
    catch (error) { checks.push({ ok: false, status: 0, path: plan.path, code: error?.code || (error?.name === 'AbortError' ? 'HIPICO_CLI_TIMEOUT' : 'HIPICO_CLI_UNAVAILABLE') }); }
  }
  return { ok: checks.every((check) => check.ok), command: 'doctor', checks };
}

function help() {
  return {
    ok: true,
    commands: [
      'status', 'doctor', 'health', 'version', 'bridge status', 'channel status',
      'groups', 'messages tail [limit]', 'events tail [limit]', 'trace <correlationId>'
    ],
    flags: ['--group <groupKey>', '--json']
  };
}

function print(result, json) {
  const safe = redact(result);
  if (json) return process.stdout.write(`${JSON.stringify(safe)}\n`);
  if (safe.command === 'doctor') {
    process.stdout.write(`Control Hípico doctor: ${safe.ok ? 'OK' : 'NO LISTO'}\n`);
    for (const check of safe.checks) process.stdout.write(`- ${check.path}: ${check.ok ? 'OK' : `HTTP ${check.status || 0}`}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2), options = {}) {
  const parsed = parseCommand(argv);
  let result;
  try {
    if (['help', '--help', '-h'].includes(parsed.command)) result = help();
    else if (parsed.command === 'doctor') result = await doctor(options);
    else {
      const plan = commandPlan(parsed);
      if (!plan) result = { ok: false, code: 'HIPICO_CLI_UNKNOWN_COMMAND', command: [parsed.command, parsed.subcommand].filter(Boolean).join(' ') };
      else if (plan.local === 'invalid-trace') result = { ok: false, code: 'HIPICO_CLI_INVALID_TRACE_ID' };
      else if (plan.local === 'group-required') result = { ok: false, code: 'HIPICO_CLI_GROUP_REQUIRED' };
      else result = transformResult(await requestPlan(plan, options), plan);
    }
  } catch (error) {
    result = { ok: false, status: 0, code: error?.code || (error?.name === 'AbortError' ? 'HIPICO_CLI_TIMEOUT' : 'HIPICO_CLI_UNAVAILABLE') };
  }
  print(result, parsed.json);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
