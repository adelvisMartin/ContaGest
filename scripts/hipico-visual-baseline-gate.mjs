import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { HIPICO_VISUAL_BASELINES } from '../qa/support/hipico-visual-baselines.mjs';

const SNAPSHOT_DIR = join(process.cwd(), 'qa', 'hipico-ui-v41-shell.spec.mjs-snapshots');
const updateRequested = process.argv.includes('--update');

function presentBaselineNames() {
  if (!existsSync(SNAPSHOT_DIR)) return [];
  return readdirSync(SNAPSHOT_DIR).filter((name) => name.endsWith('.png'));
}

export function missingVisualBaselines(files = presentBaselineNames()) {
  return HIPICO_VISUAL_BASELINES.filter((baseline) => !files.some((file) => file.startsWith(`${baseline}-`) || file === `${baseline}.png`));
}

function updateBaselines() {
  if (process.env.CI) {
    console.error('REFUSED: visual baselines are review artifacts and cannot be updated in CI.');
    process.exit(2);
  }
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, [
    'playwright', 'test', 'qa/hipico-ui-v41-shell.spec.mjs',
    '--project=chromium', '--workers=1', '--update-snapshots'
  ], { stdio: 'inherit', env: { ...process.env, HIPICO_UPDATE_VISUAL_BASELINES: '1' } });
  process.exit(result.status ?? 1);
}

if (updateRequested) updateBaselines();

const missing = missingVisualBaselines();
if (missing.length) {
  console.error(`BASELINE_REQUIRED: ${missing.length} reviewed Hípico visual baseline(s) missing.`);
  for (const name of missing) console.error(`- ${name}`);
  console.error('Run locally after visual review: node scripts/hipico-visual-baseline-gate.mjs --update');
  process.exit(3);
}

console.log(`PASS: ${HIPICO_VISUAL_BASELINES.length} reviewed Hípico visual baselines are present.`);
