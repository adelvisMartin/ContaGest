import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { graphifyFreshness, writeGraphifyBinding } from '../scripts/agent-context-v2-lib.mjs';

test('Graphify freshness is exact-SHA only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contagest-graphify-'));
  const metadataPath = path.join(dir, 'source-sha.json');

  assert.equal(graphifyFreshness({ headSha: 'a'.repeat(40), metadataPath }).status, 'UNAVAILABLE');

  writeGraphifyBinding({ headSha: 'a'.repeat(40), metadataPath });
  assert.equal(graphifyFreshness({ headSha: 'a'.repeat(40), metadataPath }).status, 'CURRENT');
  assert.equal(graphifyFreshness({ headSha: 'b'.repeat(40), metadataPath }).status, 'STALE');
});

test('Graphify binding rejects non-SHA identities', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contagest-graphify-invalid-'));
  const metadataPath = path.join(dir, 'source-sha.json');
  assert.throws(() => writeGraphifyBinding({ headSha: 'main', metadataPath }), /40-character git SHA/);
});
