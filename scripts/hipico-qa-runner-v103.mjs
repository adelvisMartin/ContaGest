import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const EVIDENCE_STATES = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const BLOCKED_PATTERNS = [
  /ENOENT/i,
  /not recognized as an internal or external command/i,
  /command not found/i,
  /EAI_AGAIN/i,
  /ENOTFOUND/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /network is unreachable/i,
  /fetch failed/i,
  /socket hang up/i,
  /rate limit/i,
  /429\b/,
  /Playwright Chromium executable missing/i,
  /Host system is missing dependencies/i,
  /error while loading shared libraries/i,
  /browserType\.launch/i,
  /sandbox.*failed/i,
  /Android SDK.*not found/i,
  /JAVA_HOME.*not set/i,
];

const THIS_FILE = fileURLToPath(import.meta.url);
export const REPO_ROOT = resolve(dirname(THIS_FILE), '..');

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function redact(value = '') {
  return String(value)
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]{8,}/gi, '$1[REDACTED]')
    .replace(/\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|KEY))\s*[=:]\s*([^\s]+)/g, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\b\d{6,20}-\d{6,20}@g\.us\b/gi, '[REDACTED_GROUP_ID]')
    .replace(/\b\d{8,20}@g\.us\b/gi, '[REDACTED_GROUP_ID]')
    .replace(/(?<!\d)(?:\+?58|0)?4(?:12|14|16|24|26)\D?\d{3}\D?\d{4}(?!\d)/g, '[REDACTED_PHONE]');
}

export function classifyFailure(errorText = '', spawnError = null) {
  const haystack = `${spawnError?.message || ''}\n${errorText || ''}`;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(haystack)) ? 'BLOCKED' : 'FAIL';
}

export function runProcess(command, args = [], options = {}) {
  const cwd = options.cwd ? resolve(options.cwd) : REPO_ROOT;
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  const combined = redact(`${result.stdout || ''}${result.stderr || ''}`);
  const status = result.status === 0 && !result.error ? 'PASS' : classifyFailure(combined, result.error);
  return {
    status,
    command: [command, ...args].join(' '),
    cwd: relative(REPO_ROOT, cwd) || '.',
    exitCode: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    startedAt,
    durationMs: Date.now() - startedMs,
    output: combined.slice(-16000),
  };
}

function gitText(args, cwd = REPO_ROOT) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return '';
  }
}

export function captureGitMetadata(cwd = REPO_ROOT) {
  const sha = gitText(['rev-parse', 'HEAD'], cwd);
  const branch = gitText(['branch', '--show-current'], cwd) || 'DETACHED';
  const status = gitText(['status', '--porcelain=v1'], cwd);
  return {
    sha: sha || 'UNKNOWN',
    branch,
    dirty: Boolean(status),
    dirtyEntryCount: status ? status.split(/\r?\n/).filter(Boolean).length : 0,
  };
}

function nodeMajor() {
  return Number(process.versions.node.split('.')[0]);
}

function discoverRootHipicoTests(root = REPO_ROOT) {
  const testsDir = join(root, 'tests');
  if (!existsSync(testsDir)) return [];
  return readdirSync(testsDir)
    .filter((name) => /^hipico.*\.test\.mjs$/i.test(name))
    .sort()
    .map((name) => join('tests', name));
}

function fileInventory(root, paths) {
  return paths
    .map((entry) => resolve(root, entry))
    .filter((filePath) => existsSync(filePath) && statSync(filePath).isFile())
    .map((filePath) => ({
      path: relative(root, filePath).replaceAll('\\', '/'),
      bytes: statSync(filePath).size,
      sha256: sha256File(filePath),
    }));
}

function aggregateStatus(results) {
  const required = results.filter((item) => item.required !== false);
  if (required.some((item) => item.status === 'FAIL')) return 'FAIL';
  if (required.some((item) => item.status === 'BLOCKED')) return 'BLOCKED';
  if (required.some((item) => item.status === 'NOT_EXECUTED')) return 'NOT_EXECUTED';
  return 'PASS';
}

function step(name, runner, options = {}) {
  const required = options.required !== false;
  if (process.env.HIPICO_QA_TEST_INJECT_FAIL === name) {
    return { name, required, status: 'FAIL', command: '[injected-test-failure]', cwd: '.', exitCode: 97, durationMs: 0, output: 'Deliberate #103 regression fixture.' };
  }
  if (options.skip) {
    return { name, required, status: 'NOT_EXECUTED', command: options.command || '', cwd: options.cwd || '.', exitCode: null, durationMs: 0, output: options.reason || 'Skipped by explicit mode.' };
  }
  const result = runner();
  return { name, required, ...result };
}

function commandStep(name, command, args, options = {}) {
  return step(name, () => runProcess(command, args, options), options);
}

function androidToolchainAvailable() {
  const hasJava = runProcess('java', ['-version']).status === 'PASS';
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  return hasJava && Boolean(sdkRoot) && existsSync(sdkRoot);
}

function pwaContract(root) {
  try {
    const base = join(root, 'frontend', 'public', 'hipico-control');
    const required = ['index.html', 'manifest.webmanifest', 'sw.js', 'runtime-config.js'];
    const missing = required.filter((file) => !existsSync(join(base, file)));
    if (missing.length) return { status: 'FAIL', command: '[internal pwa contract]', cwd: 'frontend/public/hipico-control', exitCode: 1, durationMs: 0, output: `Missing: ${missing.join(', ')}` };
    const manifest = JSON.parse(readFileSync(join(base, 'manifest.webmanifest'), 'utf8'));
    if (!manifest.name || !manifest.start_url || !Array.isArray(manifest.icons) || !manifest.icons.length) {
      return { status: 'FAIL', command: '[internal pwa contract]', cwd: 'frontend/public/hipico-control', exitCode: 1, durationMs: 0, output: 'Manifest lacks name/start_url/icons.' };
    }
    return { status: 'PASS', command: '[internal pwa contract]', cwd: 'frontend/public/hipico-control', exitCode: 0, durationMs: 0, output: 'Canonical PWA shell and manifest present.' };
  } catch (error) {
    return { status: 'FAIL', command: '[internal pwa contract]', cwd: 'frontend/public/hipico-control', exitCode: 1, durationMs: 0, output: redact(error?.message || String(error)) };
  }
}

function writeEvidence({ root, metadata, results, mode }) {
  const safeSha = /^[0-9a-f]{40}$/i.test(metadata.sha) ? metadata.sha : 'unknown-sha';
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const artifactRoot = resolve(process.env.HIPICO_QA_ARTIFACT_DIR || join(root, 'artifacts', 'qa', 'hipico-v103'));
  const runDir = join(artifactRoot, safeSha, runId);
  mkdirSync(runDir, { recursive: true });

  const overall = aggregateStatus(results);
  const jsonPath = join(runDir, 'qa-report.json');
  const mdPath = join(runDir, 'qa-report.md');
  const report = {
    schemaVersion: 2,
    issue: 103,
    product: 'Control Hipico',
    generatedAt: new Date().toISOString(),
    mode,
    overall,
    candidate: metadata,
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      npm: results.find((item) => item.name === 'preflight-npm')?.output?.trim().slice(0, 80) || null,
    },
    results: results.map(({ output, ...item }) => ({ ...item, output: redact(output || '') })),
  };
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = [
    '# Control Hipico QA evidence · Issue #103',
    '',
    `- Candidate SHA: \`${metadata.sha}\``,
    `- Branch: \`${metadata.branch}\``,
    `- Dirty working tree: **${metadata.dirty ? 'YES' : 'NO'}** (${metadata.dirtyEntryCount} entries)`,
    `- Mode: \`${mode}\``,
    `- Overall required scope: **${overall}**`,
    `- Generated: ${report.generatedAt}`,
    '',
    '| Step | Required | Status | Exit | Duration ms |',
    '|---|---|---|---:|---:|',
    ...results.map((item) => `| ${item.name} | ${item.required === false ? 'no' : 'yes'} | **${item.status}** | ${item.exitCode ?? '—'} | ${item.durationMs ?? 0} |`),
    '',
    '## Notes',
    '',
    '- `PASS` means the step actually executed successfully on the candidate SHA.',
    '- `BLOCKED` means missing/unavailable infrastructure or toolchain; it is never promoted to PASS.',
    '- `NOT_EXECUTED` means the selected mode intentionally did not execute that step.',
    '- An optional NOT_EXECUTED step remains NOT_EXECUTED even when the required scope is PASS.',
    '- Logs are redacted before persistence; raw phone numbers, bearer tokens and full WhatsApp group IDs are not evidence fields.',
    '',
  ];
  writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8');

  const hashes = [jsonPath, mdPath].map((filePath) => `${sha256File(filePath)}  ${relative(runDir, filePath).replaceAll('\\', '/')}`);
  const hashesPath = join(runDir, 'SHA256SUMS.txt');
  writeFileSync(hashesPath, `${hashes.join('\n')}\n`, 'utf8');
  return { runDir, jsonPath, mdPath, hashesPath, overall };
}

export function runQa(argv = process.argv.slice(2), root = REPO_ROOT) {
  const modeArg = argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg?.split('=')[1] || 'full';
  if (!['full', 'ci', 'quick'].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const metadata = captureGitMetadata(root);
  const results = [];
  results.push({
    name: 'preflight-candidate-sha',
    required: true,
    status: /^[0-9a-f]{40}$/i.test(metadata.sha) ? 'PASS' : 'BLOCKED',
    command: 'git rev-parse HEAD',
    cwd: '.',
    exitCode: /^[0-9a-f]{40}$/i.test(metadata.sha) ? 0 : null,
    durationMs: 0,
    output: metadata.sha,
  });

  results.push(step('preflight-node22', () => ({
    status: nodeMajor() === 22 ? 'PASS' : 'BLOCKED',
    command: 'node --version', cwd: '.', exitCode: nodeMajor() === 22 ? 0 : null, durationMs: 0,
    output: `Node ${process.version}; expected 22.x`,
  })));
  results.push(commandStep('preflight-npm', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { cwd: root }));
  results.push(commandStep('preflight-git', 'git', ['--version'], { cwd: root }));

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const skipInstall = process.env.HIPICO_QA_SKIP_INSTALL === '1';
  results.push(commandStep('install-root-lock', npm, ['ci', '--no-audit', '--no-fund'], {
    cwd: root,
    skip: skipInstall,
    required: mode !== 'quick',
    reason: 'HIPICO_QA_SKIP_INSTALL=1',
  }));

  results.push(commandStep('preflight-playwright-chromium', process.execPath, [
    '--input-type=module',
    '-e',
    "import { chromium } from '@playwright/test'; import { existsSync } from 'node:fs'; const p=chromium.executablePath(); if(!existsSync(p)){console.error('Playwright Chromium executable missing');process.exit(2)} const browser=await chromium.launch({headless:true}); await browser.close(); console.log('Playwright Chromium launch PASS')",
  ], { cwd: root }));

  results.push(commandStep('backend-typecheck', npm, ['--workspace', 'backend', 'run', 'typecheck'], { cwd: root }));
  results.push(commandStep('backend-audit-high', npm, ['audit', '--workspace', 'backend', '--omit=dev', '--audit-level=high'], { cwd: root }));
  results.push(commandStep('backend-hipico-tests', npm, ['run', 'test:hipico'], { cwd: root }));

  const rootTests = discoverRootHipicoTests(root);
  results.push(rootTests.length
    ? commandStep('root-hipico-contracts', 'node', ['--test', ...rootTests], { cwd: root })
    : { name: 'root-hipico-contracts', required: true, status: 'BLOCKED', command: 'node --test tests/hipico*.test.mjs', cwd: '.', exitCode: null, durationMs: 0, output: 'No Hípico root contract tests discovered.' });

  results.push(step('pwa-contract', () => pwaContract(root)));
  const pwaFiles = [
    'frontend/public/hipico-control/assets/js/whatsapp.js',
    'frontend/public/hipico-control/assets/js/operations.js',
    'frontend/public/hipico-control/assets/js/agent-router.js',
    'frontend/public/hipico-control/sw.js',
    'frontend/public/hipico-control/runtime-config.js',
    'frontend/api/hipico/group-bridge-ingest.js',
    'tools/hipico-whatsapp-bridge/src/index.mjs',
  ].filter((entry) => existsSync(join(root, entry)));
  results.push(pwaFiles.length
    ? commandStep('pwa-backend-static-syntax', 'node', ['--check', pwaFiles[0]], { cwd: root })
    : { name: 'pwa-backend-static-syntax', required: true, status: 'BLOCKED', command: 'node --check', cwd: '.', exitCode: null, durationMs: 0, output: 'Canonical PWA syntax target missing.' });
  for (const file of pwaFiles.slice(1)) results.push(commandStep(`syntax:${file}`, 'node', ['--check', file], { cwd: root }));

  const bridgeRoot = join(root, 'tools', 'hipico-whatsapp-web-bridge');
  results.push(commandStep('bridge-install-lock', npm, ['ci', '--no-audit', '--no-fund'], {
    cwd: bridgeRoot,
    skip: skipInstall,
    required: mode !== 'quick',
    reason: 'HIPICO_QA_SKIP_INSTALL=1',
  }));
  results.push(commandStep('bridge-check-and-tests', npm, ['run', 'qa'], { cwd: bridgeRoot }));
  results.push(commandStep('bridge-audit-high', npm, ['audit', '--audit-level=high'], { cwd: bridgeRoot }));

  const androidRoot = join(root, 'android', 'hipico-control-v1130');
  const androidExists = existsSync(join(androidRoot, 'package.json'));
  results.push(androidExists
    ? commandStep('android-web-parity-install', npm, ['ci', '--no-audit', '--no-fund'], {
        cwd: androidRoot,
        skip: skipInstall,
        required: mode !== 'quick',
        reason: 'HIPICO_QA_SKIP_INSTALL=1',
      })
    : { name: 'android-web-parity-install', required: true, status: 'NOT_EXECUTED', command: '', cwd: 'android/hipico-control-v1130', exitCode: null, durationMs: 0, output: 'Android wrapper is not present in this checkout.' });
  results.push(androidExists
    ? commandStep('android-web-parity', npm, ['run', 'verify:web'], { cwd: androidRoot })
    : { name: 'android-web-parity', required: true, status: 'NOT_EXECUTED', command: '', cwd: 'android/hipico-control-v1130', exitCode: null, durationMs: 0, output: 'Android wrapper is not present in this checkout.' });

  const requestAndroidBuild = process.env.HIPICO_QA_ANDROID === 'build' || (mode === 'full' && process.env.HIPICO_QA_ANDROID !== 'skip');
  if (!androidExists || !requestAndroidBuild) {
    results.push({ name: 'android-debug-apk', required: mode === 'full' && process.env.HIPICO_QA_ANDROID !== 'skip', status: 'NOT_EXECUTED', command: 'npm run android:qa', cwd: 'android/hipico-control-v1130', exitCode: null, durationMs: 0, output: 'APK build not requested in this scope. Use HIPICO_QA_ANDROID=build.' });
  } else if (!androidToolchainAvailable()) {
    results.push({ name: 'android-debug-apk', required: true, status: 'BLOCKED', command: 'npm run android:qa', cwd: 'android/hipico-control-v1130', exitCode: null, durationMs: 0, output: 'JDK/Android SDK toolchain not available. No APK build was claimed.' });
  } else {
    results.push(commandStep('android-debug-apk', npm, ['run', 'android:qa'], { cwd: androidRoot }));
  }

  const inventory = fileInventory(root, [
    'frontend/public/hipico-control/manifest.webmanifest',
    'frontend/public/hipico-control/sw.js',
    'frontend/public/hipico-control/build-info.json',
    'tools/hipico-whatsapp-web-bridge/package-lock.json',
    'android/hipico-control-v1130/package-lock.json',
  ]);
  results.push({ name: 'artifact-source-hashes', required: true, status: inventory.length >= 4 ? 'PASS' : 'BLOCKED', command: '[internal sha256]', cwd: '.', exitCode: inventory.length >= 4 ? 0 : null, durationMs: 0, output: JSON.stringify(inventory) });

  const evidence = writeEvidence({ root, metadata, results, mode });
  console.log(`[hipico-qa-v103] ${evidence.overall} · ${metadata.sha} · ${relative(root, evidence.runDir)}`);
  if (evidence.overall === 'FAIL') return 1;
  if (evidence.overall === 'BLOCKED' || evidence.overall === 'NOT_EXECUTED') return 2;
  return 0;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    process.exitCode = runQa();
  } catch (error) {
    const metadata = captureGitMetadata(REPO_ROOT);
    const safeSha = /^[0-9a-f]{40}$/i.test(metadata.sha) ? metadata.sha : 'unknown-sha';
    const fatalDir = join(REPO_ROOT, 'artifacts', 'qa', 'hipico-v103', safeSha, `fatal-${Date.now()}-${process.pid}`);
    mkdirSync(fatalDir, { recursive: true });
    const message = redact(error?.stack || error?.message || String(error));
    writeFileSync(join(fatalDir, 'fatal.txt'), message, 'utf8');
    writeFileSync(join(fatalDir, 'fatal.json'), `${JSON.stringify({ schemaVersion: 1, issue: 103, status: 'FAIL', candidate: metadata, error: message }, null, 2)}\n`, 'utf8');
    console.error(`[hipico-qa-v103] FAIL: ${message}`);
    process.exitCode = 1;
  }
}
