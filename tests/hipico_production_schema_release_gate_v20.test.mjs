import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { combineProductionSchemaGate } from '../scripts/hipico-production-schema-gate-v20.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');

test('v20 production schema gate requires both job and artifact PASS',()=>{
  assert.equal(combineProductionSchemaGate('PASS','PASS'),'PASS');
  assert.equal(combineProductionSchemaGate('PASS','NOT_EXECUTED'),'NOT_EXECUTED');
  assert.equal(combineProductionSchemaGate('NOT_EXECUTED','PASS'),'NOT_EXECUTED');
  assert.equal(combineProductionSchemaGate('FAIL','PASS'),'FAIL');
  assert.equal(combineProductionSchemaGate('PASS','FAIL'),'FAIL');
  assert.equal(combineProductionSchemaGate('BLOCKED','PASS'),'BLOCKED');
  assert.equal(combineProductionSchemaGate('PASS','BLOCKED'),'BLOCKED');
});

test('v20 CI verdict maps production-schema to its own gate env',async()=>{
  const source=await read('scripts/hipico-ci-verdict-v290.mjs');
  assert.match(source,/'production-schema'\s*:\s*'HIPICO_GATE_PRODUCTION_SCHEMA'/);
});

test('v20 evidence verifier treats production schema artifact as optional exact-SHA evidence',async()=>{
  const source=await read('scripts/hipico-verify-evidence-v290.mjs');
  assert.match(source,/id:\s*'productionSchema'/);
  assert.match(source,/name:\s*'schema-postdeploy\.json'/);
  assert.match(source,/schemas:\s*\['hipico-schema-postdeploy\.v18'\]/);
  const requiredBlock=source.slice(
    source.indexOf('const requiredDescriptors'),
    source.indexOf('const optionalDescriptors')
  );
  assert.doesNotMatch(requiredBlock,/productionSchema/);
  const optionalBlock=source.slice(
    source.indexOf('const optionalDescriptors'),
    source.indexOf('function findDescriptor')
  );
  assert.match(optionalBlock,/productionSchema/);
});

test('v20 release report keeps production schema out of code review but requires it for stable promotion',async()=>{
  const source=await read('scripts/hipico-release-report-v290.mjs');
  assert.match(source,/combineProductionSchemaGate/);
  assert.match(source,/productionSchemaArtifact/);
  assert.match(source,/HIPICO_GATE_PRODUCTION_SCHEMA/);
  assert.match(source,/productionSchema:\s*productionSchemaStatus/);

  const codeReviewMatch=source.match(/const codeReviewRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(codeReviewMatch);
  assert.doesNotMatch(codeReviewMatch[1],/productionSchema/);

  const stableMatch=source.match(/const stableRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(stableMatch);
  assert.match(stableMatch[1],/productionSchema/);
});

test('v20 workflow runs production schema verification only for workflow_dispatch',async()=>{
  const workflow=await read('.github/workflows/hipico-production-gates-v290.yml');
  const start=workflow.indexOf('\n  production-schema:');
  assert.ok(start>=0,'production-schema job missing');
  const end=workflow.indexOf('\n  release-report:',start);
  const block=workflow.slice(start,end>start?end:workflow.length);
  assert.match(block,/if:\s*github\.event_name\s*==\s*'workflow_dispatch'/);
  assert.match(block,/HIPICO_SCHEMA_DRIFT_DATABASE_URL:\s*\$\{\{\s*secrets\.HIPICO_SCHEMA_VERIFY_DATABASE_URL\s*\}\}/);
  assert.match(block,/HIPICO_SCHEMA_POSTDEPLOY_REPORT:\s*artifacts\/qa\/hipico-v290\/schema-postdeploy\.json/);
  assert.match(block,/node scripts\/hipico-schema-postdeploy-v18\.mjs/);
  assert.match(block,/hipico-v290-production-schema-\$\{\{\s*env\.HIPICO_CANDIDATE_SHA\s*\}\}/);
  assert.match(block,/path:\s*artifacts\/qa\/hipico-v290\/schema-postdeploy\.json/);

  const releaseBlock=workflow.slice(workflow.indexOf('\n  release-report:'));
  assert.match(releaseBlock,/needs:\s*\[[^\]]*production-schema[^\]]*\]/);
});

test('v20 PR path does not query production schema automatically',async()=>{
  const workflow=await read('.github/workflows/hipico-production-gates-v290.yml');
  const start=workflow.indexOf('\n  production-schema:');
  const end=workflow.indexOf('\n  release-report:',start);
  const block=workflow.slice(start,end);
  assert.doesNotMatch(block,/pull_request/);
  assert.doesNotMatch(block,/schedule/);
  assert.match(block,/workflow_dispatch/);
});
