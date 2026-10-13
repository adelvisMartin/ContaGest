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
// Handle dotenv-style inline comments, including after quoted values.
// Never strip # inside quotes or attached URL fragments.
function parseTemplateValue(raw){
  const trimmed=raw.trim();
  const quoted=/^(?:"([\s\S]*)"|'([\s\S]*)')(?:\s+#.*)?$/.exec(trimmed);
  return quoted?(quoted[1]??quoted[2]):trimmed.replace(/\s+#.*$/,'').trim();
}

export function parseEnvTemplate(source) {
  const vars = new Map();
  const duplicates = [];
  for (const [index, raw] of String(source).split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    if (vars.has(match[1])) duplicates.push({ key: match[1], line: index + 1 });
    vars.set(match[1], parseTemplateValue(match[2]));
  }
  return { vars, duplicates };
}


const PUBLIC_URL_PROTOCOLS = new Set([
  'http:', 'https:', 'postgres:', 'postgresql:', 'mysql:', 'mongodb:',
  'mongodb+srv:', 'redis:', 'rediss:'
]);
// A frontend env example must not carry a connection string with userinfo.
// Report only the variable name, never the URL, username or password.
function exposesUrlCredentials(value) {
  try {
    const url = new URL(value);
    return PUBLIC_URL_PROTOCOLS.has(url.protocol) && Boolean(url.username || url.password);
  } catch { return false; }
}

// A service_role JWT is server-only, even if named VITE_SUPABASE_ANON_KEY.
// This is a detection heuristic, never token verification/authentication.
function exposesPrivilegedSupabaseJwt(value){
  const parts=String(value).split('.');
  if(parts.length!==3||parts.some(part=>!part))return false;
  if(!/^[A-Za-z0-9_-]{1,8192}={0,2}$/.test(parts[1]))return false;
  try{return JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))?.role==='service_role';}
  catch{return false;}
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
    if (/(?:sb_secret_|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i.test(sample) || exposesUrlCredentials(sample)) add('PUBLIC_SECRET_VALUE', 'frontend', key);
    if(exposesPrivilegedSupabaseJwt(sample))add('PUBLIC_PRIVILEGED_JWT','frontend',key);
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
