import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(relative)=>fs.readFileSync(relative,'utf8');

test('v31 soak runner exposes canonical release evidence without fabricating a 24h run',()=>{
  const runner=read('backend/scripts/hipico-soak-v120.ts');
  assert.match(runner,/createSoakReleaseEvidence/);
  assert.match(runner,/soak-evidence\.json/);
  assert.match(runner,/evaluation\.status/);
  assert.match(runner,/releaseMinimumHours/);
  assert.match(runner,/if\s*\(releaseEvidence\)/);
});

test('v31 verifier indexes soak as optional exact-SHA release evidence with release policy constraints',()=>{
  const source=read('scripts/hipico-verify-evidence-v290.mjs');
  assert.match(source,/id:\s*'soak'/);
  assert.match(source,/name:\s*'soak-evidence\.json'/);
  assert.match(source,/schemas:\s*\['hipico-soak-evidence\.v120'\]/);
  assert.match(source,/soakPolicy\.releaseMinimumHours/);
  assert.match(source,/evaluation\?\.status\s*===\s*'PASS'/);
  assert.match(source,/summaryInput\?\.physicalEvidenceComplete\s*===\s*true/);
  assert.match(source,/summaryInput\?\.invariantEvidenceComplete\s*===\s*true/);
  assert.match(source,/summaryInput\?\.drillMaterialEvidenceComplete\s*===\s*true/);
  assert.match(source,/summaryInput\?\.sourceReadOnly\s*===\s*'PASS'/);
  assert.match(source,/summaryInput\?\.labOnlyWriteDestination\s*===\s*'PASS'/);
  assert.match(source,/summaryInput\?\.sessionFallbackSafe\s*===\s*'PASS'/);
  const requiredBlock=source.slice(source.indexOf('const requiredDescriptors'),source.indexOf('const optionalDescriptors'));
  assert.doesNotMatch(requiredBlock,/id:\s*'soak'/);
});

test('v31 stable promotion requires soak artifact while code review remains independent',()=>{
  const source=read('scripts/hipico-release-report-v290.mjs');
  assert.match(source,/soakArtifact/);
  assert.match(source,/id\s*===\s*'soak'/);
  assert.match(source,/soak:\s*soakArtifact/);
  const codeReview=source.match(/const codeReviewRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(codeReview);
  assert.doesNotMatch(codeReview[1],/soak/);
  const stable=source.match(/const stableRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(stable);
  assert.match(stable[1],/soak/);
});

test('v31 production PR workflow observes soak sources but never runs a synthetic 24h soak',()=>{
  const workflow=read('.github/workflows/hipico-production-gates-v290.yml');
  assert.match(workflow,/backend\/scripts\/hipico-soak-v120\.ts/);
  assert.doesNotMatch(workflow,/duration-minutes=1440/);
  assert.doesNotMatch(workflow,/run soak:hipico/);
  assert.doesNotMatch(workflow,/soak_status:/);
  assert.doesNotMatch(workflow,/HIPICO_GATE_SOAK/);
});
