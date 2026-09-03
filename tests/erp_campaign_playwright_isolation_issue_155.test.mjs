import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const config = await readFile(new URL('../playwright.config.mjs', import.meta.url), 'utf8');

test('la campaña #155 no contamina el Browser QA genérico sin CANDIDATE_SHA', () => {
  assert.match(config, /const campaignSha = String\(process\.env\.CANDIDATE_SHA/);
  assert.match(config, /testIgnore:\s*campaignSha \? \[\] : \[/);
  assert.match(config, /erp-system-campaign-v155\.spec\.mjs/);
  assert.match(config, /erp-system-reliability-v155\.spec\.mjs/);
});
