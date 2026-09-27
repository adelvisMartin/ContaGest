import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  compareReliabilityReports,
  evaluateReliabilityPromotion,
  scoreReliabilityDataset,
  type ReliabilityDataset
} from '../src/modules/hipico/agent-reliability-lab.js';

function arg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || null;
}

async function loadDataset(path: string): Promise<ReliabilityDataset> {
  const raw = await readFile(resolve(process.cwd(), path), 'utf8');
  return JSON.parse(raw) as ReliabilityDataset;
}

const baselinePath = arg('baseline') || 'src/modules/hipico/fixtures/agent-reliability.v1.json';
const candidatePath = arg('candidate');
const candidateSha = arg('sha');
const runtimeVersion = arg('runtime-version');

const baseline = scoreReliabilityDataset(await loadDataset(baselinePath));
const candidate = candidatePath ? scoreReliabilityDataset(await loadDataset(candidatePath)) : baseline;
const diff = compareReliabilityReports(baseline, candidate);

const output: Record<string, unknown> = { baseline, candidate, diff };
if (candidateSha || runtimeVersion) {
  if (!candidateSha || !runtimeVersion) {
    throw new Error('Both --sha=<40-hex> and --runtime-version=<version> are required for promotion evaluation.');
  }
  output.promotion = evaluateReliabilityPromotion({ report: candidate, candidateSha, runtimeVersion });
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (candidate.failed > 0) process.exitCode = 1;
if (output.promotion && !(output.promotion as { promoted: boolean }).promoted) process.exitCode = 1;
