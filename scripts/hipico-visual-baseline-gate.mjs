import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HIPICO_VISUAL_BASELINES } from '../qa/support/hipico-visual-baselines.mjs';

const SNAPSHOT_DIR = join(process.cwd(), 'qa', 'hipico-ui-v41-shell.spec.mjs-snapshots');

function presentBaselineNames() {
  if (!existsSync(SNAPSHOT_DIR)) return [];
  return readdirSync(SNAPSHOT_DIR).filter((name) => name.endsWith('.png'));
}

export function missingVisualBaselines(files = presentBaselineNames()) {
  return HIPICO_VISUAL_BASELINES.filter((baseline) => !files.some((file) => file.startsWith(`${baseline}-`) || file === `${baseline}.png`));
}

function updateBaselines(env = process.env) {
  if (env.CI) {
    console.error('REFUSED: visual baselines are review artifacts and cannot be updated in CI.');
    return 2;
  }
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, [
    'playwright', 'test', 'qa/hipico-ui-v41-shell.spec.mjs',
    '--project=chromium', '--workers=1', '--update-snapshots'
  ], { stdio: 'inherit', env: { ...env, HIPICO_UPDATE_VISUAL_BASELINES: '1' } });
  return result.status ?? 1;
}

export function runVisualBaselineGate({ update = false, env = process.env, files } = {}) {
  if (update) return updateBaselines(env);
  const missing = missingVisualBaselines(files);
  if (missing.length) {
    console.error(`BASELINE_REQUIRED: ${missing.length} reviewed Hípico visual baseline(s) missing.`);
    for (const name of missing) console.error(`- ${name}`);
    console.error('Run locally after visual review: node scripts/hipico-visual-baseline-gate.mjs --update');
    return 3;
  }
  console.log(`PASS: ${HIPICO_VISUAL_BASELINES.length} reviewed Hípico visual baselines are present.`);
  return 0;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) process.exitCode = runVisualBaselineGate({ update: process.argv.includes('--update') });
