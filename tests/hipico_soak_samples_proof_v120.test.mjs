import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validSoakSamplesProof } from '../scripts/hipico-soak-samples-proof-v120.mjs';

const START = Date.parse('2026-10-10T00:00:00.000Z');
const COUNT = 2880;
function setup(change = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hipico-soak-proof-'));
  const manifestPath = path.join(root, 'soak-evidence.json');
  const rows = Array.from({length: COUNT}, (_, i) => ({
    at: new Date(START + i * 30_000).toISOString(), elapsedMs: i * 30_000,
    rssMb: 128, heapUsedMb: 64,
    health: {ok: true, status: 200, latencyMs: 5},
    spool: {available: true, files: 2, bytes: 1024, activeFiles: 1,
      queuedFiles: 1, failedFiles: 0, oldestAgeSeconds: 2},
    decisions: i + 1, duplicateResponses: 0, lostDecisions: 0, contextLeaks: 0
  }));
  change(rows);
  const bytes = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  fs.writeFileSync(path.join(root, 'samples.jsonl'), bytes);
  const report = {
    startedAt: new Date(START).toISOString(),
    completedAt: new Date(START + 24 * 3600_000).toISOString(),
    summaryInput: {samples: COUNT, healthChecks: COUNT, healthFailures: 0,
      spoolChecks: COUNT, spoolAvailableChecks: COUNT,
      maxSpoolBytes: 1024, maxBacklogAgeSeconds: 2,
      unexpectedDuplicateResponses: 0, lostDecisions: 0, contextLeaks: 0},
    evidenceIntegrity: {samplesSha256: crypto.createHash('sha256').update(bytes).digest('hex')}
  };
  return {root, manifestPath, report, cleanup: () => fs.rmSync(root, {recursive: true, force: true})};
}
function check(mutator, expected = false) {
  const fixture = setup();
  try {
    mutator(fixture);
    assert.equal(validSoakSamplesProof(fixture.manifestPath, fixture.report), expected);
  } finally {fixture.cleanup();}
}
function mutateRows(fixture, change) {
  const target = path.join(fixture.root, 'samples.jsonl');
  const rows = fs.readFileSync(target, 'utf8').trimEnd().split('\n').map(JSON.parse);
  change(rows);
  const bytes = Buffer.from(rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  fs.writeFileSync(target, bytes);
  fixture.report.evidenceIntegrity.samplesSha256 = crypto.createHash('sha256').update(bytes).digest('hex');
}

test('#120 genuine bounded 24h sample log matches manifest and chronology', () => check(() => {}, true));
test('#120 tampering with samples without updating SHA is rejected', () => check(f => {
  fs.appendFileSync(path.join(f.root, 'samples.jsonl'), '{}\n');
}));
test('#120 forged manifest digest is rejected', () => check(f => { f.report.evidenceIntegrity.samplesSha256 = 'a'.repeat(64); }));
test('#120 missing artifact is rejected', () => check(f => fs.rmSync(path.join(f.root, 'samples.jsonl'))));
test('#120 symlink samples outside evidence directory is rejected', () => {
  const f = setup();
  try {
    const sample = path.join(f.root, 'samples.jsonl');
    fs.renameSync(sample, path.join(f.root, 'original.jsonl'));
    fs.symlinkSync(path.join(f.root, 'original.jsonl'), sample);
    assert.equal(validSoakSamplesProof(f.manifestPath, f.report), false);
  } finally {f.cleanup();}
});
test('#120 forged count, even when digest matches, is rejected', () => check(f => { f.report.summaryInput.samples -= 1; }));
test('#120 two samples at the same timestamp fail, even if checksum is recomputed', () => check(f => mutateRows(f, rows => {rows[1].at = rows[0].at;})));
test('#120 timestamps backdated to the wrong day fail with matching checksum', () => check(f => mutateRows(f, rows => {rows[100].at = new Date(START - 1000).toISOString();})));
test('#120 missing 4h in middle of allegedly continuous soak fails', () => check(f => mutateRows(f, rows => {
  for(let i=600;i<1080;i++) { rows[i].at = new Date(START + (i + 480) * 30_000).toISOString(); rows[i].elapsedMs += 480 * 30_000; }
})));
test('#120 summary claimed UTC start cannot differ from actual log', () => check(f => {f.report.startedAt='2026-10-01T00:00:00.000Z';}));
test('#120 samples with impossible heap greater than RSS are rejected', () => check(f => mutateRows(f, rows => {rows[5].heapUsedMb = 1000;})));
test('#120 absent final newline is rejected with even a matching digest', () => check(f => {
  const file = path.join(f.root,'samples.jsonl'); const bytes=fs.readFileSync(file); const cut=bytes.subarray(0,bytes.length-1);
  fs.writeFileSync(file,cut); f.report.evidenceIntegrity.samplesSha256=crypto.createHash('sha256').update(cut).digest('hex');
}));
test('#120 rejection for absent declared sample time/elapsed field', () => check(f => mutateRows(f, rows => {delete rows[1].elapsedMs;})));

test('#120 health failure cannot hide behind recomputed samples checksum', () => check(f => mutateRows(f, rows => {
  rows[100].health = {ok: false, status: 503, latencyMs: 5};
})));
test('#120 spool size and age spikes cannot hide behind recomputed samples checksum', () => {
  check(f => mutateRows(f, rows => {rows[100].spool.bytes = 900_000;}));
  check(f => mutateRows(f, rows => {rows[100].spool.oldestAgeSeconds = 9_000;}));
});
test('#120 historical lost/duplicate counters cannot be cleared before release summary', () => {
  check(f => mutateRows(f, rows => {
    rows[100].lostDecisions = 1;
    for(let i=101;i<rows.length;i++)rows[i].lostDecisions=1;
  }));
  check(f => mutateRows(f, rows => {rows[100].duplicateResponses = 1;}));
});
