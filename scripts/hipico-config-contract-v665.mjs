import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = Object.freeze({
  backend: 'backend/.env.example',
  bridge: 'tools/hipico-whatsapp-web-bridge/.env.example',
  frontend: 'frontend/.env.example'
});

// Reads only versioned templates; never examines .env, OS secrets or credentials.
export function parseEnvTemplate(source) {
  const vars = new Map();
  const duplicates = [];
  for (const [index, raw] of String(source).split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    if (vars.has(match[1])) duplicates.push({ key: match[1], line: index + 1 });
    vars.set(match[1], match[2].trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, a, b) => a ?? b));
  }
  return { vars, duplicates };
}

export function checkHipicoConfigTemplates(sources) {
  const parsed = Object.fromEntries(Object.entries(paths).map(([name]) => [name, parseEnvTemplate(sources[name] ?? '')]));
  const findings = [];
  const add = (code, surface, key) => findings.push({ code, surface, key });
  const value = (surface, key) => parsed[surface].vars.get(key);
  const requireValue = (surface, key, expected) => {
    if (value(surface, key) === undefined) add('MISSING_KEY', surface, key);
    else if (value(surface, key) !== expected) add('UNSAFE_DEFAULT', surface, key);
  };

  for (const [surface, result] of Object.entries(parsed)) {
    for (const duplicate of result.duplicates) add('DUPLICATE_KEY', surface, duplicate.key);
  }
  for (const key of ['HIPICO_SOURCE_AUTO_REPLY_ENABLED', 'HIPICO_CLOUD_SEND_ENABLED', 'HIPICO_OUTBOX_WORKER_ENABLED']) {
    requireValue('backend', key, 'false');
  }
  for (const key of ['HIPICO_SOURCE_AUTO_REPLY_ENABLED', 'HIPICO_LAB_SEND_ENABLED', 'HIPICO_LAB_TEST_INPUT_ENABLED']) {
    requireValue('bridge', key, 'false');
  }
  requireValue('bridge', 'HIPICO_REQUIRE_PINNED_GROUP_IDS', 'true');
  requireValue('bridge', 'HIPICO_TRANSPORT_ADAPTER', 'playwright-web');
  requireValue('backend', 'HIPICO_WHATSAPP_COMPLIANCE_DECISION', '');
  for (const surface of ['bridge', 'backend']) {
    for (const key of ['HIPICO_SOURCE_GROUP_ID', 'HIPICO_LAB_GROUP_ID', 'HIPICO_GROUP_BRIDGE_TOKEN']) {
      requireValue(surface, key, '');
    }
  }
  for (const [backendKey, bridgeKey] of [
    ['HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY', 'HIPICO_SOURCE_CHANNEL_KEY'],
    ['HIPICO_LAB_CHANNEL_KEY', 'HIPICO_LAB_CHANNEL_KEY']
  ]) {
    if (!value('backend', backendKey) || !value('bridge', bridgeKey) || value('backend', backendKey) !== value('bridge', bridgeKey)) {
      add('CHANNEL_KEY_MISMATCH', 'backend/bridge', backendKey);
    }
  }
  for (const [key, sample] of parsed.frontend.vars) {
    if (/^VITE_.*(?:SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN)/i.test(key)) add('PUBLIC_SECRET_KEY', 'frontend', key);
    if (/(?:sb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(sample)) add('PUBLIC_SECRET_VALUE', 'frontend', key);
  }
  return { status: findings.length ? 'FAIL' : 'PASS', findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sources = Object.fromEntries(Object.entries(paths).map(([surface, path]) => [surface, readFileSync(resolve(repoRoot, path), 'utf8')]));
  const report = checkHipicoConfigTemplates(sources);
  // Only finding codes, template names and variable names; never values.
  for (const finding of report.findings) console.error(finding.code + ': ' + finding.surface + ' / ' + finding.key);
  console.log('Hípico configuration templates: ' + report.status + ' (' + report.findings.length + ' finding(s))');
  if (report.status !== 'PASS') process.exitCode = 1;
}
