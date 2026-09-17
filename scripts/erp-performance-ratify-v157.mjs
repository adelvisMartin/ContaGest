#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.split('=')[1]||'').trim();
const ratifiedBy=String(process.env.PERFORMANCE_BUDGET_RATIFIED_BY||process.env.GITHUB_ACTOR||process.argv.find((arg)=>arg.startsWith('--by='))?.split('=')[1]||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
if(!ratifiedBy||ratifiedBy.length>120)throw new Error('PERFORMANCE_BUDGET_RATIFIED_BY_REQUIRED');

const policyPath=path.resolve('products/erp/performance-policy-v157.json');
const summaryPath=path.resolve('artifacts/qa/erp-performance-v157',sha,'summary.json');
if(!fs.existsSync(policyPath))throw new Error('PERFORMANCE_POLICY_REQUIRED');
if(!fs.existsSync(summaryPath))throw new Error('PERFORMANCE_SUMMARY_REQUIRED');

const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8'));
if(summary.candidateSha!==sha)throw new Error('PERFORMANCE_SUMMARY_SHA_MISMATCH');
if(summary.verdict!=='MEASURED_PROVISIONAL')throw new Error(`PERFORMANCE_RATIFICATION_REQUIRES_MEASURED_PROVISIONAL:${summary.verdict}`);
if(!/^[a-f0-9]{64}$/i.test(String(summary.measurementHash||'')))throw new Error('PERFORMANCE_MEASUREMENT_HASH_REQUIRED');
if(policy.targetsLifecycle?.state!=='PROVISIONAL')throw new Error(`PERFORMANCE_POLICY_NOT_PROVISIONAL:${policy.targetsLifecycle?.state||'MISSING'}`);

const budgetDefinition={
  workloadModel:policy.workloadModel,
  frontend:policy.frontend,
  backend:policy.backend,
  heavyProcesses:policy.heavyProcesses,
  degradationScenarios:policy.degradationScenarios,
  profiles:policy.profiles
};
const budgetDefinitionHash=crypto.createHash('sha256').update(JSON.stringify(budgetDefinition)).digest('hex');
const measuredBudgetHash=String(summary.targetsLifecycle?.currentBudgetDefinitionHash||'');
if(measuredBudgetHash!==budgetDefinitionHash)throw new Error('PERFORMANCE_BUDGET_DEFINITION_CHANGED_SINCE_MEASUREMENT');

policy.targetsLifecycle={
  state:'RATIFIED',
  baselineMeasurementHash:String(summary.measurementHash),
  baselineCandidateSha:sha,
  budgetDefinitionHash,
  ratifiedAt:new Date().toISOString(),
  ratifiedBy
};
fs.writeFileSync(policyPath,JSON.stringify(policy,null,2)+'\n');
console.log(JSON.stringify({
  issue:157,
  state:'RATIFIED',
  baselineCandidateSha:sha,
  baselineMeasurementHash:summary.measurementHash,
  budgetDefinitionHash,
  ratifiedBy
}));
