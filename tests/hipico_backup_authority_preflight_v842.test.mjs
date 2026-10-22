import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backup = path.join(root, 'ops/backup/hipico-backup-postgres.sh');
const candidateSha = 'a'.repeat(40);

function runBlockedPreflight(failStage) {
  const fixture = mkdtempSync(path.join(tmpdir(), 'hipico-backup-preflight-'));
  try {
    const pathBin = path.join(fixture, 'bin');
    const trace = path.join(fixture, 'calls.txt');
    const output = path.join(fixture, 'source');
    mkdirSync(pathBin);
    const hashLookup = spawnSync('which', ['sha256sum'], { encoding: 'utf8' });
    assert.equal(hashLookup.status, 0, 'real sha256sum is mandatory for the canonical inventory guard');
    const realSha256sum = hashLookup.stdout.trim();
    const binaries = ['psql', 'pg_dump', 'pg_restore', 'age', 'rclone', 'sha256sum', 'git', 'node'];
    for (const name of binaries) {
      const destination = path.join(pathBin, name);
      let command;
      if (name === 'git') command = '#!/bin/sh\nprintf "%s\\n" "$HIPICO_CANDIDATE_SHA"\n';
      else if (name === 'sha256sum') command = '#!/bin/sh\necho inventory-sha256 >> "$HIPICO_TEST_TRACE"\nexec "$HIPICO_TEST_REAL_SHA256SUM" "$@"\n';
      else if (name === 'node') command = [
        '#!/bin/sh',
        'case "$1" in',
        '  *hipico-exact-sha-gate.mjs) echo sha >> "$HIPICO_TEST_TRACE"; [ "$HIPICO_TEST_FAIL_STAGE" != sha ] ;;',
        '  *hipico-backup-role-verify-v24.mjs) echo role >> "$HIPICO_TEST_TRACE"; exit 28 ;;',
        '  *) echo unexpected-node >> "$HIPICO_TEST_TRACE"; exit 98 ;;',
        'esac'
      ].join('\n') + '\n';
      else command = '#!/bin/sh\necho unexpected-' + name + ' >> "$HIPICO_TEST_TRACE"\nexit 98\n';
      writeFileSync(destination, command, { mode: 0o700 });
      chmodSync(destination, 0o700);
    }
    const response = spawnSync('bash', [backup], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: pathBin + path.delimiter + process.env.PATH,
        HIPICO_CANDIDATE_SHA: candidateSha,
        HIPICO_TEST_TRACE: trace,
        HIPICO_TEST_FAIL_STAGE: failStage,
        HIPICO_TEST_REAL_SHA256SUM: realSha256sum,
        HIPICO_BACKUP_DATABASE_URL: 'postgresql://hipico_backup:private@localhost/test',
        HIPICO_BACKUP_AGE_RECIPIENT: 'age1example',
        HIPICO_BACKUP_RCLONE_REMOTE: 'fake:private',
        HIPICO_BACKUP_OUTPUT_DIR: output,
        HIPICO_BACKUP_EXPECTED_ROLE: 'postgres'
      }
    });
    return {
      status: response.status,
      output: response.stdout + response.stderr,
      calls: existsSync(trace) ? readFileSync(trace, 'utf8').trim().split(/\r?\n/) : [],
      generated: existsSync(output)
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('#842 failed exact-SHA preflight prevents role verification and all backup I/O', () => {
  const result = runBlockedPreflight('sha');
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, ['inventory-sha256', 'inventory-sha256', 'sha']);
  assert.equal(result.generated, false);
  assert.doesNotMatch(result.output, /private|age1example|fake:private/);
});

test('#842 failed least-privilege role verification prevents queries, dumps, encryption and off-site upload', () => {
  const result = runBlockedPreflight('role');
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.calls, ['inventory-sha256', 'inventory-sha256', 'sha', 'role']);
  assert.equal(result.generated, false);
  assert.match(result.output, /hipico_backup privileges invalid/);
  assert.doesNotMatch(result.output, /private|age1example|fake:private/);
});

test('#842 shell syntax is valid and role verifier executes before backup production I/O', () => {
  const syntax = spawnSync('bash', ['-n', backup], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const source = readFileSync(backup, 'utf8');
  assert.ok(source.indexOf('hipico-backup-role-verify-v24.mjs') < source.indexOf('role_info='));
  assert.ok(source.indexOf('hipico-exact-sha-gate.mjs') < source.indexOf('role_info='));
  assert.match(source, /EXPECTED_ROLE="hipico_backup"/);
});
