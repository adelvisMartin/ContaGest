import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const spec = fs.readFileSync('qa/benchmark-runtime-v588.spec.mjs', 'utf8');
const runner = fs.readFileSync('scripts/benchmark-runtime-v588.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/benchmark-runtime-v588.yml', 'utf8');

test('#588 fixtures are synthetic and evidence is exact-SHA/browser/viewport scoped', () => {
  assert.match(spec, /Synthetic V588/);
  assert.match(spec, /example\.test/);
  assert.match(spec, /CANDIDATE_SHA_REQUIRED_40_HEX/);
  assert.match(spec, /desktop-1366/);
  assert.match(spec, /mobile-390/);
  assert.match(spec, /browser: 'chromium'/);
});

test('#588 preserves RBAC and exercises controlled error/empty states', () => {
  assert.match(spec, /canAccessRoute\(\{ rbac \}, 'admin'\)/);
  assert.match(spec, /not\.toBe\('admin'\)/);
  assert.match(spec, /\['empty', 'error'\]/);
  assert.match(spec, /pageerror/);
});

test('#588 runner includes Hípico autonomy, Chromium and WCAG gates without skip/sleep cheats', () => {
  assert.match(runner, /hipico-autonomous-runtime\.test\.ts/);
  assert.match(runner, /hipico-autonomous-source-reply\.test\.ts/);
  assert.match(runner, /benchmark-runtime-v588\.spec\.mjs/);
  assert.match(runner, /accessibility-wcag22-v99\.spec\.mjs/);
  for (const source of [spec, runner, workflow]) {
    assert.doesNotMatch(source, /waitForTimeout|test\.skip|\.only\(/);
  }
});
