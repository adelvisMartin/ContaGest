import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const FULL_SHA='a'.repeat(40);
const readJson=(file)=>JSON.parse(fs.readFileSync(file,'utf8'));

const v3=await import('../scripts/agent-system-v3-lib.mjs');

test('#623 policy defines local-first evidence dimensions/statuses and deterministic errors',()=>{
  const policy=readJson('config/agent-system-v3.json');
  assert.deepEqual(policy.evidence.dimensions,['SOURCE_REVIEW','LOCAL_STATIC','LOCAL_UNIT','LOCAL_INTEGRATION','LOCAL_POSTGRES','LOCAL_BUILD','LOCAL_BROWSER_E2E','REMOTE_CI','REMOTE_DEPLOY','PHYSICAL_EXTERNAL']);
  assert.deepEqual(policy.evidence.statuses,['PASS','FAIL','BLOCKED','NOT_EXECUTED','NOT_APPLICABLE']);
  for(const code of ['AGENT_ROUTE_AMBIGUOUS','SKILL_CONTRACT_INVALID','SKILL_SOURCE_STALE','GRAPHIFY_STALE','DUPLICATE_WORK_CLAIM','EVIDENCE_SHA_MISMATCH','LOCAL_GATE_FAILED','REMOTE_CI_BLOCKED_PLAN','REMOTE_DEPLOY_BLOCKED_PLAN','REQUIRED_EVIDENCE_MISSING','SUPERSEDED_AUTHORITY','UNSAFE_EXTERNAL_SKILL']) assert.ok(policy.errorCodes.includes(code),code);
  assert.equal(policy.routing.minSkills,2);
  assert.equal(policy.routing.maxSkills,4);
  assert.equal(policy.externalSkills.canOverrideProjectAuthority,false);
});

test('#623 router selects minimal ACTIVE skills for representative fixtures',()=>{
  const db=v3.routeTask({risk:'P0',type:'migration',domains:['database'],boundaries:['persistence','tenant']});
  assert.ok(db.skills.length>=2&&db.skills.length<=4);
  assert.ok(db.skills.includes('contagest-db-migration-safety'));
  assert.ok(db.skills.includes('contagest-tenant-isolation-rbac'));

  const ui=v3.routeTask({risk:'P1',type:'feature',domains:['frontend-ui'],boundaries:['ui','browser']});
  assert.ok(ui.skills.includes('contagest-ui-audit'));
  assert.ok(ui.skills.includes('contagest-functional-module-audit'));

  const finance=v3.routeTask({risk:'P0',type:'feature',domains:['finance'],boundaries:['financial','persistence']});
  assert.ok(finance.skills.includes('contagest-accounting-integrity'));

  const refactor=v3.routeTask({risk:'P1',type:'refactor',domains:['architecture'],boundaries:['api']});
  assert.ok(refactor.skills.includes('contagest-erp-orchestrator'));
  assert.ok(refactor.verification.includes('SOURCE_REVIEW'));

  const hipico=v3.routeTask({risk:'P0',type:'incident',domains:['hipico'],boundaries:['api','provider']});
  assert.ok(hipico.agents.includes('hipico-reliability'));
  assert.ok(hipico.skills.length<=4);
});

test('#623 verification planner is boundary-proportional',()=>{
  assert.deepEqual(v3.planVerification({type:'refactor',boundaries:['ui']}),['SOURCE_REVIEW','LOCAL_STATIC','LOCAL_UNIT','LOCAL_BUILD','LOCAL_BROWSER_E2E']);
  assert.deepEqual(v3.planVerification({type:'migration',boundaries:['persistence','tenant']}),['SOURCE_REVIEW','LOCAL_STATIC','LOCAL_UNIT','LOCAL_INTEGRATION','LOCAL_POSTGRES']);
  assert.ok(v3.planVerification({type:'feature',boundaries:['provider']}).includes('REMOTE_CI'));
});

test('#623 evidence ledger rejects false PASS and SHA mismatch while allowing provider BLOCKED',()=>{
  assert.throws(()=>v3.normalizeEvidence({dimension:'LOCAL_UNIT',status:'PASS',sha:FULL_SHA,command:'',environment:'node22',evidence:'tests'}),/REQUIRED_EVIDENCE_MISSING/);
  assert.throws(()=>v3.assertEvidenceSha([{dimension:'SOURCE_REVIEW',status:'PASS',sha:'b'.repeat(40),command:'review',environment:'repo',evidence:'diff'}],FULL_SHA),/EVIDENCE_SHA_MISMATCH/);
  const blocked=v3.normalizeEvidence({dimension:'REMOTE_CI',status:'BLOCKED',sha:FULL_SHA,command:'GitHub Actions',environment:'github',evidence:'plan limit',reasonCode:'REMOTE_CI_BLOCKED_PLAN'});
  assert.equal(blocked.status,'BLOCKED');
  assert.notEqual(blocked.status,'PASS');
});

test('#623 Graphify state is exact-SHA navigation metadata only',()=>{
  assert.equal(v3.graphifyState({headSha:FULL_SHA,sourceSha:FULL_SHA,available:true}).status,'CURRENT');
  assert.equal(v3.graphifyState({headSha:FULL_SHA,sourceSha:'b'.repeat(40),available:true}).status,'STALE');
  assert.equal(v3.graphifyState({headSha:FULL_SHA,available:false}).status,'UNAVAILABLE');
});

test('#623 duplicate claim rules distinguish advisory/exclusive and require one supersession owner',()=>{
  const claims=[
    {id:'pr-1',issue:623,mode:'exclusive',status:'active'},
    {id:'note-1',issue:623,mode:'advisory',status:'active'}
  ];
  assert.equal(v3.reconcileClaims(claims).ok,true);
  const duplicate=v3.reconcileClaims([...claims,{id:'pr-2',issue:623,mode:'exclusive',status:'active'}]);
  assert.equal(duplicate.code,'DUPLICATE_WORK_CLAIM');
  const superseded=v3.reconcileClaims([
    {id:'pr-1',issue:623,mode:'exclusive',status:'active'},
    {id:'pr-2',issue:623,mode:'exclusive',status:'active',supersedes:['pr-1']}
  ]);
  assert.equal(superseded.ok,true);
  assert.equal(superseded.owner,'pr-2');
});

test('#623 every project-owned skill has a v3 contract or explicit non-active status',()=>{
  const registry=readJson('config/agent-skill-contracts-v3.json');
  const contracts=new Map(registry.skills.map((skill)=>[skill.id,skill]));
  const dirs=fs.readdirSync('.agents/skills',{withFileTypes:true}).filter((entry)=>entry.isDirectory()&&entry.name.startsWith('contagest-')).map((entry)=>entry.name).sort();
  for(const id of dirs){
    const contract=contracts.get(id);
    assert.ok(contract,`missing v3 skill contract: ${id}`);
    assert.ok(['ACTIVE','DEPRECATED','SUPERSEDED'].includes(contract.status));
    for(const field of ['purpose','triggers','requiredInputs','authoritativeSources','prohibitedActions','expectedEvidence','minimumValidation','riskEscalation','dependencies','provenance']) assert.ok(contract[field],`${id}.${field}`);
  }
});

test('#623 CLI and documentation expose v3 without breaking canonical commands',()=>{
  const pkg=readJson('package.json');
  assert.match(pkg.scripts['agent:system:test'],/agent_system_v3_issue_623\.test\.mjs/);
  assert.match(pkg.scripts['agent:system:verify'],/verify-agent-system-v3\.mjs/);
  assert.ok(fs.existsSync('.agents/context/AGENT_SYSTEM_V3.md'));
  assert.ok(fs.existsSync('.agents/context/EVIDENCE_LEDGER_V3.json'));
  const gates=fs.readFileSync('scripts/agent-gate-router.mjs','utf8');
  const bootstrap=fs.readFileSync('scripts/agent-bootstrap.mjs','utf8');
  assert.match(gates,/schemaVersion:\s*3/);
  assert.match(bootstrap,/schemaVersion:\s*3/);
  assert.match(gates,/routeTask/);
});
