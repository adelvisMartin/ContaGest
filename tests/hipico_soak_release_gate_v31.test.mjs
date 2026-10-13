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
  assert.match(source,/soakPolicy\??\.releaseMinimumHours/);
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


test('v31 stable release rejects incoherent soak counters and forged durations',async()=>{
  const {validSoakMetricEvidence}=await import('../scripts/hipico-soak-metric-integrity-v120.mjs');
  const summaryInput={
    durationMs:24*3600000,samples:2880,rssStartMb:100,rssEndMb:120,
    heapStartMb:50,heapEndMb:60,eventLoopP95Ms:10,maxBacklogAgeSeconds:5,
    maxSpoolBytes:1024,unexpectedDuplicateResponses:0,lostDecisions:0,contextLeaks:0,
    healthChecks:2880,healthFailures:0,spoolChecks:2880,spoolAvailableChecks:2880
  };
  const evaluation={
    durationHours:24,rssGrowthMbPerHour:20/24,heapGrowthMbPerHour:10/24,
    healthFailureRate:0,healthCoverageRatio:1,spoolCoverageRatio:1
  };
  const good={
    summaryInput,evaluation,
    startedAt:'2026-10-10T00:00:00.000Z',completedAt:'2026-10-11T00:00:00.000Z'
  };
  assert.equal(validSoakMetricEvidence(good,24),true);
  for(const change of [
    {summaryInput:{...summaryInput,durationMs:NaN}},
    {summaryInput:{...summaryInput,samples:.5}},
    {summaryInput:{...summaryInput,healthFailures:-1}},
    {summaryInput:{...summaryInput,spoolAvailableChecks:2881}},
    {summaryInput:{...summaryInput,healthChecks:2881}},
    {summaryInput:{...summaryInput,rssEndMb:Infinity}},
    {evaluation:{...evaluation,durationHours:48}},
    {evaluation:{...evaluation,healthCoverageRatio:1.2}},
    {completedAt:'2026-10-10T00:05:00.000Z'},
    {completedAt:'not-a-date'}
  ])assert.equal(validSoakMetricEvidence({...good,...change},24),false);
  const sparse={...summaryInput,samples:1,healthChecks:1,
    spoolChecks:1,spoolAvailableChecks:1};
  assert.equal(validSoakMetricEvidence({...good,summaryInput:sparse,
    evaluation:{...evaluation}},24,30),false,
    '24 hours must not be attested by one health/spool sample');
  const minimum=Math.floor(24*60*60/30*.9);
  const bounded={...summaryInput,samples:minimum,healthChecks:minimum,
    spoolChecks:minimum,spoolAvailableChecks:minimum};
  assert.equal(validSoakMetricEvidence({...good,summaryInput:bounded},24,30),true);
  assert.equal(validSoakMetricEvidence({...good,summaryInput:{...bounded,
    samples:minimum-1}},24,30),false);
  assert.equal(validSoakMetricEvidence({...good},24,0),false);
  assert.equal(validSoakMetricEvidence({...good},24,NaN),false);
  const verifier=read('scripts/hipico-verify-evidence-v290.mjs');
  assert.match(verifier,/validSoakMetricEvidence\(data,[\s\S]*?soakPolicy\?\.sampleSeconds/);
});
