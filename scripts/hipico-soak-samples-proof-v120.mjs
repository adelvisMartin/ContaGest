/**
 * #120: Verify the producer's samples.jsonl bytes against the release manifest.
 * This verifies internal evidence integrity, NOT that a 24-hour run was real.
 * File is a fixed sibling of soak-evidence.json: never accept a manifest path.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validSoakSampleSummary } from './hipico-soak-sample-summary-v120.mjs';

const HASH = /^[a-f0-9]{64}$/i;
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const MAX_SAMPLE_BYTES = 32 * 1024 * 1024;
function utcMs(value) {
  if (typeof value !== 'string' || !UTC.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value ? ms : null;
}

export function validSoakSamplesProof(manifestPath, report, sampleSeconds = 30) {
  try {
    const count = report?.summaryInput?.samples;
    const claimedHash = report?.evidenceIntegrity?.samplesSha256;
    const start = utcMs(report?.startedAt);
    const end = utcMs(report?.completedAt);
    if (typeof manifestPath !== 'string' || !path.isAbsolute(manifestPath) ||
        !HASH.test(String(claimedHash || '')) || !Number.isSafeInteger(count) ||
        count < 1 || count > 500_000 || start === null || end === null || end <= start ||
        !Number.isFinite(sampleSeconds) || sampleSeconds < 1 || sampleSeconds > 3600) return false;

    const samplePath = path.join(path.dirname(manifestPath), 'samples.jsonl');
    const stats = fs.lstatSync(samplePath);
    if (!stats.isFile() || stats.isSymbolicLink() ||
        stats.size < 1 || stats.size > MAX_SAMPLE_BYTES) return false;
    const bytes = fs.readFileSync(samplePath);
    if (bytes.byteLength !== stats.size ||
        crypto.createHash('sha256').update(bytes).digest('hex') !== claimedHash.toLowerCase()) return false;

    // Our producer appends exactly one UTF-8 JSON object and newline per sample.
    const content = bytes.toString('utf8');
    if (!content.endsWith('\n')) return false;
    const lines = content.slice(0, -1).split('\n');
    if (lines.length !== count) return false;
    const maxGap = Math.max(60_000, sampleSeconds * 2500);
    let priorAt = -1;
    let priorElapsed = -1;
    const observed = [];
    for (const line of lines) {
      if (!line || line.length > 16_384) return false;
      const sample = JSON.parse(line);
      const at = utcMs(sample?.at);
      const elapsed = sample?.elapsedMs;
      if (at === null || at < start || at > end || at <= priorAt ||
          !Number.isSafeInteger(elapsed) || elapsed < 0 || elapsed <= priorElapsed ||
          Math.abs((at - start) - elapsed) > 3000 ||
          typeof sample?.rssMb !== 'number' || !Number.isFinite(sample.rssMb) || sample.rssMb <= 0 ||
          typeof sample?.heapUsedMb !== 'number' || !Number.isFinite(sample.heapUsedMb) ||
          sample.heapUsedMb <= 0 || sample.heapUsedMb > sample.rssMb) return false;
      if (priorAt < 0 && at - start > maxGap) return false;
      if (priorAt >= 0 && at - priorAt > maxGap) return false;
      priorAt = at;
      priorElapsed = elapsed;
      observed.push(sample);
    }
    return end - priorAt <= maxGap && validSoakSampleSummary(observed, report.summaryInput);
  } catch {
    // Malformed, missing, symlink or inaccessible evidence is not a release PASS.
    return false;
  }
}
