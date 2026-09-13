import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA40 = /^[0-9a-f]{40}$/i;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const artifactDir = path.join(root, 'artifacts', 'qa', 'hipico-v290');
const artifactPath = path.join(artifactDir, 'secret-scan.json');

function git(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  }).trim();
}

function expectedCandidateSha() {
  const value = String(
    process.env.HIPICO_CANDIDATE_SHA
      || process.env.HIPICO_QA_SHA
      || process.env.HIPICO_RELEASE_SHA
      || process.env.GITHUB_SHA
      || git(['rev-parse', 'HEAD'])
  ).trim();
  if (!SHA40.test(value)) throw new Error('HIPICO_SECRET_SCAN_SHA_REQUIRED');
  return value.toLowerCase();
}

function changedFiles(base, candidate) {
  if (SHA40.test(base) && base.toLowerCase() !== candidate.toLowerCase()) {
    return git(['diff', '--name-only', '--diff-filter=ACMRTUXB', `${base}..${candidate}`, '--'])
      .split(/\r?\n/)
      .filter(Boolean);
  }
  return git(['ls-files']).split(/\r?\n/).filter(Boolean);
}

const RULES = [
  { id: 'PRIVATE_KEY', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'AWS_ACCESS_KEY', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'GITHUB_TOKEN', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})\b/g },
  { id: 'OPENAI_KEY', pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'ANTHROPIC_KEY', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'GOOGLE_API_KEY', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'SLACK_TOKEN', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: 'STRIPE_LIVE_KEY', pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b/g },
  { id: 'NPM_TOKEN', pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g }
];

function lineNumber(source, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (source.charCodeAt(i) === 10) line += 1;
  return line;
}

function scanJwtServiceRole(source, file, findings) {
  const jwt = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
  for (const match of source.matchAll(jwt)) {
    try {
      const payloadText = Buffer.from(
        match[0].split('.')[1].replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf8');
      const payload = JSON.parse(payloadText);
      if (String(payload?.role || '').toLowerCase() === 'service_role') {
        findings.push({
          rule: 'SUPABASE_SERVICE_ROLE_JWT',
          file,
          line: lineNumber(source, match.index || 0)
        });
      }
    } catch {}
  }
}

function scanRemoteCredentialUrl(source, file, findings) {
  const urlPattern = /\bpostgres(?:ql)?:\/\/([^:\s/@]+):([^@\s/]+)@([^/\s:]+)(?::\d+)?\//gi;
  for (const match of source.matchAll(urlPattern)) {
    const host = String(match[3] || '').toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      findings.push({
        rule: 'REMOTE_DATABASE_EMBEDDED_CREDENTIAL',
        file,
        line: lineNumber(source, match.index || 0)
      });
    }
  }
}

const candidate = expectedCandidateSha();
const head = git(['rev-parse', 'HEAD']).toLowerCase();
if (head !== candidate) throw new Error(`HIPICO_SECRET_SCAN_SHA_MISMATCH:${head}:${candidate}`);
const base = String(process.env.HIPICO_BASE_SHA || '').trim().toLowerCase();
const files = changedFiles(base, candidate);
const findings = [];
let scannedFiles = 0;

for (const relative of files) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) continue;
  const stat = fs.statSync(absolute);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0)) continue;
  const source = buffer.toString('utf8');
  scannedFiles += 1;

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      findings.push({ rule: rule.id, file: relative, line: lineNumber(source, match.index || 0) });
    }
  }
  scanJwtServiceRole(source, relative, findings);
  scanRemoteCredentialUrl(source, relative, findings);
}

fs.mkdirSync(artifactDir, { recursive: true });
const report = {
  schema: 'hipico-secret-scan.v290-current',
  sha: candidate,
  baseSha: SHA40.test(base) ? base : null,
  scope: SHA40.test(base) && base !== candidate ? 'candidate-diff-files' : 'tracked-files',
  status: findings.length ? 'FAIL' : 'PASS',
  scannedFiles,
  findings,
  checkedAt: new Date().toISOString()
};
fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (findings.length) {
  for (const item of findings) {
    console.error(`[hipico-secret-scan] ${item.rule} ${item.file}:${item.line}`);
  }
  throw new Error(`HIPICO_SECRET_SCAN_FAILED:${findings.length}`);
}
console.log(`[hipico-secret-scan] PASS sha=${candidate} files=${scannedFiles} scope=${report.scope}`);
