#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const sha=String(process.env.CANDIDATE_SHA||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const dir=path.resolve('artifacts/qa/erp-performance-v157',sha);
const read=(name)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const backend=read('backend-measurements.json');
const frontend=read('frontend-measurements.json');
if(backend.candidateSha!==sha||frontend.candidateSha!==sha)throw new Error('PERFORMANCE_COMPONENT_SHA_MISMATCH');

const expectedFixtureProvenance='SYNTHETIC_TEST_ONLY';
const provenanceVerified=process.env.ERP157_FIXTURE_PROVENANCE===expectedFixtureProvenance
  && frontend.fixtureProvenance===expectedFixtureProvenance;
if(!provenanceVerified)throw new Error('PERFORMANCE_FIXTURE_PROVENANCE_REQUIRED');

const measured=(value)=>value==='MEASURED';
const degradationKeys=['slow-db','pool-saturation','external-timeout','memory-pressure','large-payload','multi-user-concurrency'];
const degradation=Object.fromEntries(degradationKeys.map((key)=>[
  key,
  measured(frontend.degradation?.[key])||measured(backend.degradation?.[key])?'MEASURED':'NOT_EXECUTED'
]));

const evidence={
  schemaVersion:2,
  issue:157,
  candidateSha:sha,
  measuredAt:new Date().toISOString(),
  environment:{
    runtime:backend.environment?.runtime||'NOT_EXECUTED',
    device:`${backend.environment?.device||'unknown'} + chromium`,
    network:`${backend.environment?.network||'unknown'} + CDP throttled profile`,
    sanitizedFixtures:provenanceVerified
  },
  workload:{
    expectedPeakConcurrentUsers:backend.expectedPeakConcurrentUsers,
    profileCoverage:backend.profileCoverage,
    loadFactors:backend.loadFactors
  },
  profiles:frontend.profiles,
  heavyProcesses:backend.heavyProcesses,
  degradation,
  metrics:{...frontend.metrics,...backend.metrics},
  profilingEvidence:[...(backend.profilingEvidence||[]),...(frontend.profilingEvidence||[])],
  notes:'Measurements generated only from the ephemeral PostgreSQL QA database and SYNTHETIC_TEST_ONLY browser fixtures. Targets remain provisional until reviewed after the first successful baseline.'
};

fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({issue:157,candidateSha:sha,metrics:Object.keys(evidence.metrics).length,profilingEvidence:evidence.profilingEvidence.length,degradation:evidence.degradation}));
