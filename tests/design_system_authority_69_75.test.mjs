import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

test('69/75 keeps one canonical UI kit and CSS token authority',()=>{
  const run=spawnSync(process.execPath,['scripts/design-system-authority-audit-v6975.mjs'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/\[design-system-authority\]\[PASS\]/);
});

test('69/75 compatibility facades do not define a second palette',()=>{
  const tokens=fs.readFileSync('frontend/src/components/designTokens.js','utf8');
  const facade=fs.readFileSync('frontend/src/components/designSystem.js','utf8');
  assert.doesNotMatch(tokens,/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.match(facade,/from '\.\/ui\/kit\.js'/);
});
