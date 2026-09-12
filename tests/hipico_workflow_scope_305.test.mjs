import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/hipico-qa-foundation-v103.yml', import.meta.url), 'utf8');

const requiredTriggerPaths = [
  'backend/.env.example',
  'backend/src/app.ts',
  'backend/src/shared/middleware/security.ts',
  'backend/src/modules/hipico-bot/**',
  'frontend/public/hipico-control/**',
  'frontend/api/hipico/**',
  'frontend/vercel.json',
  'products/hipico-control/**',
  'ops/roadmap/hipico-preqa-305-diagnosis.json',
  'vercel.json'
];

test('Hípico QA workflow cannot be skipped by changes to canonical integration, security, configuration, release, diagnosis or deployment contracts', () => {
  for (const path of requiredTriggerPaths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*\\\*/g, '\\*\\\*');
    assert.match(workflow, new RegExp(`- ['"]?${escaped}['"]?`), `missing protected trigger path: ${path}`);
  }
});
