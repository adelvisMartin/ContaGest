#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

function cleanBaseUrl(value) {
  const raw = String(value || 'http://127.0.0.1:3030').trim().replace(/\/$/, '');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('HIPICO_CLI_INVALID_BASE_URL');
  }
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
    ['status', ['/api/v1/hipico/system/status', 'GET']],
    ['health', ['/api/v1/hipico/system/readiness', 'GET']],
    ['version', ['/api/v1/hipico/system/version', 'GET']],
    ['bridge status', ['/api/v1/hipico-bot/bridge/health', 'GET']],
    ['channel status', ['/api/v1/hipico/system/status', 'GET']],
    ['groups', ['/api/v1/hipico/groups', 'GET']],
    ['races', ['/api/v1/hipico/races', 'GET']],
    ['documents', ['/api/v1/hipico/documents', 'GET']],
    ['providers', ['/api/v1/hipico/providers', 'GET']],
    ['messages tail', ['/api/v1/hipico/messages', 'GET']],
    ['events tail', ['/api/v1/hipico/events/stream', 'GET']]
  ]);

  if (parsed.command === 'trace') {
    const id = String(parsed.subcommand || '').trim();
    if (!/^[A-Za-z0-9._:-]{3,120}$/.test(id)) throw new Error('HIPICO_CLI_INVALID_TRACE_ID');
    return [`/api/v1/hipico/trace/${encodeURIComponent(id)}`, 'GET'];
  }
  return mappings.get(key) || mappings.get(parsed.command) || null;
}

function headersFor(path) {
  const headers = { Accept: 'application/json' };
  if (path.includes('/hipico-bot/bridge/')) {
    const token = String(process.env.HIPICO_GROUP_BRIDGE_TOKEN || '').trim();
    if (token) headers['x-hipico-bridge-token'] = token;
  }
  return headers;
}

async function request(path, method) {
  const base = cleanBaseUrl(process.env.HIPICO_API_BASE_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: headersFor(path),
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

async function doctor() {
  const checks = [];
  for (const path of [
    '/api/v1/hipico/system/version',
    '/api/v1/hipico/system/status',
    '/api/v1/hipico-bot/bridge/health'
  ]) {
    try {
      checks.push(await request(path, 'GET'));
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
      'groups', 'races', 'documents', 'providers', 'messages tail', 'events tail',
      'trace <correlationId>'
    ],
    flags: ['--json']
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
    const mapped = commandRequest(parsed);
    if (!mapped) {
      result = {
        ok: false,
        code: 'HIPICO_CLI_UNKNOWN_COMMAND',
        command: [parsed.command, parsed.subcommand].filter(Boolean).join(' ')
      };
    } else {
      try {
        result = await request(mapped[0], mapped[1]);
      } catch (error) {
        result = {
          ok: false,
          status: 0,
          path: mapped[0],
          code: error?.name === 'AbortError' ? 'HIPICO_CLI_TIMEOUT' : 'HIPICO_CLI_UNAVAILABLE'
        };
      }
    }
  }
  print(result, parsed.json);
  return result.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
