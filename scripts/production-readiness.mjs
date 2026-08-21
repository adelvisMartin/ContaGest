import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const full = process.argv.includes('--full');
const browser = full || process.argv.includes('--browser');
const android = full || process.argv.includes('--android');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const startedAt = new Date();
const results = [];

function run(id, command, args, { required = true, cwd = root, env = {} } = {}) {
  const started = Date.now();
  process.stdout.write(`\n=== ${id} ===\n${command} ${args.join(' ')}\n`);
  let outcome = 'BLOCKED';
  let code = null;
  let error = null;
  try {
    const result = spawnSync(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'inherit',
      shell: false
    });
    code = result.status;
    error = result.error?.message || null;
    if (result.error) outcome = 'BLOCKED';
    else outcome = result.status === 0 ? 'PASS' : 'FAIL';
  } catch (caught) {
    error = caught?.message || String(caught);
    outcome = 'BLOCKED';
  }
  const row = {
    id,
    required,
    outcome,
    exitCode: code,
    durationMs: Date.now() - started,
    error
  };
  results.push(row);
  process.stdout.write(`${id}: ${outcome}${code == null ? '' : ` (${code})`}\n`);
  return row;
}

function commandAvailable(command, args = ['--version']) {
  const result = spawnSync(command, args, { stdio: 'ignore', shell: false });
  return !result.error && result.status === 0;
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
results.push({
  id: 'runtime.node22',
  required: true,
  outcome: nodeMajor === 22 ? 'PASS' : 'FAIL',
  exitCode: nodeMajor === 22 ? 0 : 1,
  durationMs: 0,
  error: nodeMajor === 22 ? null : `Node ${process.version}; requerido 22.x`
});

if (!commandAvailable(npm)) {
  results.push({ id: 'runtime.npm', required: true, outcome: 'BLOCKED', exitCode: null, durationMs: 0, error: 'npm no disponible' });
} else {
  run('repo.diff-check', 'git', ['diff', '--check']);
  run('repo.skills', npm, ['run', 'skills:check']);
  run('repo.typecheck', npm, ['run', 'typecheck']);
  run('repo.tests', npm, ['test']);
  run('repo.build', npm, ['run', 'build']);
  run('repo.bundle-budget', npm, ['run', 'check:bundle']);
  run('repo.audit-prod', npm, ['run', 'audit:prod']);

  const bridgeDir = path.join(root, 'tools', 'hipico-whatsapp-web-bridge');
  run('hipico.bridge.install', npm, ['ci', '--no-audit', '--no-fund'], { cwd: bridgeDir });
  run('hipico.bridge.qa', npm, ['run', 'qa'], { cwd: bridgeDir });
  run('hipico.bridge.audit', npm, ['audit', '--omit=dev', '--audit-level=high'], { cwd: bridgeDir });

  const androidDir = path.join(root, 'android', 'hipico-control-v1130');
  run('hipico.android.install', npm, ['ci', '--no-audit', '--no-fund'], { cwd: androidDir });
  run('hipico.android.parity', npm, ['run', 'verify:web'], { cwd: androidDir });
  run('hipico.android.audit', npm, ['audit', '--audit-level=high'], { cwd: androidDir });

  if (browser) {
    run('repo.browser-qa', npm, ['run', 'test:browser']);
  } else {
    results.push({ id: 'repo.browser-qa', required: false, outcome: 'NOT_EXECUTED', exitCode: null, durationMs: 0, error: 'Usa --browser o --full' });
  }

  if (android) {
    const javaReady = commandAvailable('java');
    const sdkReady = Boolean(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT);
    if (!javaReady || !sdkReady) {
      results.push({
        id: 'hipico.android.debug-apk',
        required: true,
        outcome: 'BLOCKED',
        exitCode: null,
        durationMs: 0,
        error: `JDK=${javaReady ? 'OK' : 'MISSING'} AndroidSDK=${sdkReady ? 'OK' : 'MISSING'}`
      });
    } else {
      run('hipico.android.debug-apk', npm, ['run', 'android:debug'], { cwd: androidDir });
    }
  } else {
    results.push({ id: 'hipico.android.debug-apk', required: false, outcome: 'NOT_EXECUTED', exitCode: null, durationMs: 0, error: 'Usa --android o --full' });
  }
}

const required = results.filter((item) => item.required);
const failed = required.filter((item) => !['PASS'].includes(item.outcome));
const verdict = failed.length === 0 ? (full ? 'READY_FOR_MANUAL_QA' : 'STATIC_GATE_PASS') : 'BLOCKED';
const finishedAt = new Date();
const report = {
  schemaVersion: 1,
  verdict,
  mode: full ? 'full' : browser || android ? 'custom' : 'static',
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  node: process.version,
  platform: process.platform,
  results
};

const outDir = path.join(root, 'artifacts', 'qa');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'production-readiness.json'), JSON.stringify(report, null, 2));
const lines = [
  '# Production readiness local report',
  '',
  `Verdict: **${verdict}**`,
  '',
  '| Gate | Required | Result | Exit |',
  '| --- | --- | --- | ---: |',
  ...results.map((item) => `| ${item.id} | ${item.required ? 'yes' : 'no'} | ${item.outcome} | ${item.exitCode ?? '-'} |`),
  '',
  'A PASS here does not replace physical-device QA, tenant A/B verification, restore drill, production migration authorization or release signing.'
];
fs.writeFileSync(path.join(outDir, 'production-readiness.md'), `${lines.join('\n')}\n`);

process.stdout.write(`\nVERDICT: ${verdict}\nReportes: artifacts/qa/production-readiness.{json,md}\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
