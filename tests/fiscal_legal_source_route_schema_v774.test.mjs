import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('#774 merging taxpayer profiles keeps the fiscal legal-source creation validator', () => {
  const routes = readFileSync(new URL('../backend/src/modules/fiscal/fiscal.routes.ts', import.meta.url), 'utf8');
  assert.match(routes, /const taxpayerProfileDraftSchema = z\.object\(/);
  assert.match(routes, /const fiscalLegalSourceSchema = z\.object\(/);
  assert.match(routes, /router\.post\('\/legal-sources', requirePermission\('fiscal\.close'\), validateBody\(fiscalLegalSourceSchema\)/);
  assert.match(routes, /contentSha256: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{64\}\$\/i\)/);
});
