import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/hipico-qa-foundation-v103.yml'), 'utf8');

test('Android parity CI generates the untracked www tree before check-only verification', () => {
  const marker = '- name: Verify PWA and wrapper parity';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'Android parity step must exist');
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, next > 0 ? next : workflow.length);
  const sync = step.indexOf('npm run sync:web');
  const verify = step.indexOf('npm run verify:web');
  assert.ok(sync >= 0, 'parity job must generate www because generated wrapper assets are not versioned');
  assert.ok(verify > sync, 'check-only verification must run after wrapper generation');
});
