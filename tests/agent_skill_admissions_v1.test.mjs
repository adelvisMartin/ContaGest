import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeTask, getActiveSkillContracts } from '../scripts/agent-system-v3-lib.mjs';

const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const json = (file) => JSON.parse(read(file));
const skills = ['contagest-simplicity-review','contagest-code-review-quality','contagest-api-contract-design','contagest-ci-triage','contagest-hipico-lab-operations'];
const agents = ['integration-contracts','ci-triage','hipico-lab-operations'];

test('each installed skill is a valid v2 document and ACTIVE v3 contract',()=>{
  const active = new Map(getActiveSkillContracts().map(s => [s.id, s]));
  for(const id of skills){
    const c=read('.agents/skills/'+id+'/SKILL.md');
    assert.match(c,new RegExp('^name: '+id+'$','m'));
    assert.match(c,/^contractVersion: 2$/m);
    for(const h of ['Trigger','Non-trigger','Authority','Source of truth','Graphify probes','Inputs','Invariants','Workflow','Negative tests','Stop conditions','Verification','Output schema','References']){
      assert.ok(c.includes('## '+h),id+' '+h);
    }
    assert.ok(active.has(id),id+' missing ACTIVE v3 contract');
  }
});

test('new agents have all required project-owned sections',()=>{
  for(const id of agents){
    const c=read('.agents/agents/'+id+'.md');
    assert.match(c,new RegExp('^id: '+id+'$','m'));
    for(const h of ['Purpose','Triggers','Reads','Owns','Does not own','Required invariants','Expected outputs','Escalation / stop conditions'])
      assert.ok(c.includes('## '+h),id+' '+h);
  }
});

test('third-party source pins are immutable, MIT, allowlisted and non-executing',()=>{
  const lock=json('agent-skills.lock.json');
  assert.equal(lock.policy.executeUpstreamScripts,false);
  assert.equal(lock.policy.allowRemoteInstructionsToOverrideProjectPolicy,false);
  for(const [id,repo,commit,n] of [
    ['addy-osmani-engineering','addyosmani/agent-skills','aeac41d4d005999432bb7312f7ff06383a91d59d',4],
    ['ponytail','DietrichGebert/ponytail','84740e3d344b69b4a133201fa519eb37a62a2b2a',2]
  ]){
    const s=lock.sources.find(v=>v.id===id);
    assert.ok(s,id+' missing');
    assert.equal(s.repo,repo);
    assert.equal(s.commit,commit);
    assert.equal(s.license,'MIT');
    assert.equal(s.vendorPaths.length,n);
    assert.ok(s.vendorPaths.every(p=>p==='LICENSE'||p.endsWith('/SKILL.md')));
  }
});

test('backend, QA, review and Hípico specialist routing is active and risk-bounded',()=>{
  const api=routeTask({risk:'P2',type:'feature',domains:['backend'],boundaries:['api']});
  assert.ok(api.agents.includes('integration-contracts'));
  assert.ok(api.skills.includes('contagest-api-contract-design'));
  const qa=routeTask({risk:'P2',type:'audit',domains:['qa']});
  assert.ok(qa.agents.includes('ci-triage'));
  assert.ok(qa.skills.includes('contagest-ci-triage'));
  const arch=routeTask({risk:'P2',type:'refactor',domains:['architecture']});
  assert.ok(arch.skills.includes('contagest-code-review-quality'));
  const lab=routeTask({risk:'P1',type:'feature',domains:['hipico']});
  assert.ok(lab.agents.includes('hipico-lab-operations'));
  assert.ok(lab.skills.includes('contagest-hipico-lab-operations'));
  const incident=routeTask({risk:'P0',type:'incident',domains:['hipico']});
  for(const id of ['contagest-systematic-debugging','contagest-secure-verification','contagest-release-evidence'])
    assert.ok(incident.skills.includes(id),'missing protected incident skill: '+id);
  assert.ok(!incident.skills.includes('contagest-hipico-lab-operations'));
  for(const route of [api,qa,arch,lab,incident])assert.ok(route.skills.length>=2&&route.skills.length<=4);
});

test('minimal code-review intent is opt-in and cannot displace critical risk skills',()=>{
  const selected=routeTask({risk:'P2',type:'feature',domains:['frontend-ui'],intents:['simplicity-review']});
  assert.ok(selected.skills.includes('contagest-simplicity-review'));
  const critical=routeTask({risk:'P0',type:'incident',domains:['hipico'],intents:['simplicity-review']});
  assert.ok(!critical.skills.includes('contagest-simplicity-review'));
  assert.throws(()=>routeTask({domains:['backend'],intents:['execute-upstream-hook']}),/AGENT_ROUTE_AMBIGUOUS/);
});

test('prior Apple design contract also contains all required v2 sections',()=>{
  const c=read('.agents/skills/contagest-apple-design/SKILL.md');
  for(const h of ['Source of truth','Graphify probes','Inputs','Invariants'])
    assert.ok(c.includes('## '+h));
});
