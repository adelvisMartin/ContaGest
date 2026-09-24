import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const backendRoot = path.resolve(process.cwd());
const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8'));
const copyScript = fs.readFileSync(path.join(backendRoot, 'scripts/copy-runtime-assets.mjs'), 'utf8');

test('backend build packages the JS access manifest runtime required by compiled server imports', () => {
  assert.match(String(packageJson.scripts?.build || ''), /copy-runtime-assets\.mjs/);
  assert.match(copyScript, /src\/shared\/contracts\/accessManifestRuntime\.js/);
  assert.match(copyScript, /dist\/src\/shared\/contracts\/accessManifestRuntime\.js/);
});
