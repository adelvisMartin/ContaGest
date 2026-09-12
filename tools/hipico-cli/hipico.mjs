#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const CLI_SCHEMA_VERSION = '1';
const DEFAULT_TIMEOUT_MS = 10_000;

function localhost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function cleanBaseUrl(value) {
  const raw = String(value || 'http://127.0.0.1:3030').trim().replace(/\/$/, '');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('HIPICO_CLI_INVALID_BASE_URL');
  }
  if (url.pathname && url.pathname !== '/') throw new Error('HIPICO_CLI_INVALID_BASE_URL');
  if (url.protocol === 'http:' && !localhost(url.hostname)) throw new Error('HIPICO_CLI_INSECURE_REMOTE_BASE_URL');
  return url.origin;
}

export function parseCommand(argv) {
  const args = [...argv];
  const json = args.includes('--json');
  const filtered = args.filter((arg) => arg !== '--json');
  return {
    json,
    command: filtered[0] || 'help',
    subcommand: filtered[1] || '',
    value: filtered[2] || ''
  };
}

export function commandRequest(parsed) {
  const key = `${parsed.command} ${parsed.subcommand}`.trim();
  const mappings = new Map([
    ['status', ['/api/v1/hipico/system/status', 'GET', 'public']],
    ['health', ['/api/v1/hipico/system/readiness', 'GET', 'public']],
    ['version', ['/api/v1/hipico/system/version', 'GET', 'public']],
    ['bridge status', ['/api/v1/hipico-bot/bridge/health', 'GET', 'bridge']],
    ['channel status', ['/api/v1/hipico-bot/bridge/health', 'GET', 'bridge']],
    ['groups', ['/api/v1/hipico-bot/bridge/health', 'GET', 'bridge']],
    ['messages tail', ['/api/v1/hipico-bot/events?limit=50', 'GET', 'operator']],
    ['events tail', ['/api/v1/hipico-bot/events?limit=50', 'GET', 'operator']]
  ]);

  if (parsed.command === 'trace') {
    const id = String(parsed.subcommand || '').trim();
    if (!/^[A-Za-z0-9._:-]{3,120}$/.test(id)) throw new Error('HIPICO_CLI_INVALID_TRACE_ID');
    return ['/api/v1/hipico-bot/events?limit=100', 'GET', 'operator', { traceId: id }];
  }
  return mappings.get(key) || mappings.get(parsed.command) || null;
}

function configuredOperatorToken(source = process.env) {
  return String(source.HIPICO_OPERATOR_CONTROL_TOKEN || source.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
}

export function headersFor(auth, source = process.env) {
  const headers = { Accept: 'application/json' };
  if (auth === 'bridge') {
    const token = String(source.HIPICO_GROUP_BRIDGE_TOKEN || '').trim();
    if (token) headers['x-hipico-bridge-token'] = token;
  }
  if (auth === 'operator') {
    const token = configuredOperatorToken(source);
    if (token) headers['x-hipico-operator-token'] = token;
  }
  return headers;
}

function boundedTimeout(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 500 && number <= 60_000 ? number : DEFAULT_TIMEOUT_MS;
}

async function request(path, method, auth) {
  const base = cleanBaseUrl(process.env.HIPICO_API_BASE_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), boundedTimeout(process.env.HIPICO_CLI_TIMEOUT_MS));
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: headersFor(auth),
      redirect: 'error',
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
    return { ok: response.ok, status: response.status, path, data };
  } finally {
    clearTimeout(timer);
  }
}

function traceRows(data, traceId) {
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.filter((row) => {
    const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
    const values = [row?.correlationId, row?.correlation_id, payload?.correlationId, payload?.correlation_id];
    return values.some((value) => String(value || '') === traceId);
  });
}

function commandProjection(parsed, response, options = null) {
  if (parsed.command === 'trace' && options?.traceId) {
    return { ...response, data: traceRows(response.data, options.traceId), traceId: options.traceId };
  }
  if (parsed.command === 'groups') {
    const data = response.data?.data || response.data || {};
    return {
      ...response,
      data: {
        sourceChannelKey: data.sourceChannelKey || null,
        labChannelKey: data.labChannelKey || null,
        mode: data.mode || null,
        ready: Boolean(data.ready ?? data.ok)
      }
    };
  }
  return response;
}

async function doctor() {
  const checks = [];
  for (const [path, auth] of [
    ['/api/v1/hipico/system/version', 'public'],
    ['/api/v1/hipico/system/status', 'public'],
    ['/api/v1/hipico-bot/bridge/health', 'bridge']
  ]) {
    try {
      checks.push(await request(path, 'GET', auth));
    } catch (error) {
      checks.push({
        ok: false,
        status: 0,
        path,
        error: error?.name === 'AbortError' ? 'timeout' : 'unavailable'
      });
    }
  }
  return { ok: checks.every((item) => item.ok), command: 'doctor', checks };
}

function help() {
  return {
    ok: true,
    commands: [
      'status', 'doctor', 'health', 'version', 'bridge status', 'channel status',
      'groups', 'messages tail', 'events tail', 'trace <correlationId>'
    ],
    flags: ['--json']
  };
}

function stableEnvelope(parsed, result) {
  return {
    schemaVersion: CLI_SCHEMA_VERSION,
    command: [parsed.command, parsed.subcommand].filter(Boolean).join(' '),
    ...result
  };
}

function print(result, json) {
  if (json) return process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.command === 'doctor') {
    process.stdout.write(`Control Hípico doctor: ${result.ok ? 'OK' : 'NO LISTO'}\n`);
    for (const check of result.checks) {
      process.stdout.write(`- ${check.path}: ${check.ok ? 'OK' : `HTTP ${check.status || 0}`}\n`);
    }
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseCommand(argv);
  let result;
  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    result = help();
  } else if (parsed.command === 'doctor') {
    result = await doctor();
  } else {
    let mapped;
    try {
      mapped = commandRequest(parsed);
    } catch (error) {
      result = { ok: false, code: error?.message || 'HIPICO_CLI_INVALID_COMMAND' };
    }
    if (!result && !mapped) {
      result = { ok: false, code: 'HIPICO_CLI_UNKNOWN_COMMAND' };
    }
    if (!result && mapped) {
      try {
        const response = await request(mapped[0], mapped[1], mapped[2]);
        result = commandProjection(parsed, response, mapped[3]);
      } catch (error) {
        result = {
          ok: false,
          status: 0,
          path: mapped[0],
          code: error?.name === 'AbortError' ? 'HIPICO_CLI_TIMEOUT' : String(error?.message || 'HIPICO_CLI_UNAVAILABLE')
        };
      }
    }
  }
  const output = stableEnvelope(parsed, result);
  print(output, parsed.json);
  return output.ok ? 0 : 1;
}

export const __test__ = { traceRows, commandProjection, configuredOperatorToken, stableEnvelope };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
