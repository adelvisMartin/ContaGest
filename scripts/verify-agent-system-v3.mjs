#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { validateSkillContract, AGENT_SYSTEM_V3_POLICY } from './agent-system-v3-lib.mjs';

const ROOT=process.cwd();
const readJson=(file)=>JSON.parse(fs.readFileSync(path.join(ROOT,file),'utf8'));
const registry=readJson('config/agent-skill-contracts-v3.json');
const lock=readJson('agent-skills.lock.json');
const executionPolicy=readJson('config/agent-execution-capabilities-v1.json');
const errors=[];
const warnings=[];

if(AGENT_SYSTEM_V3_POLICY.schemaVersion!==3)errors.push('SKILL_CONTRACT_INVALID agent-system schemaVersion must be 3');
if(AGENT_SYSTEM_V3_POLICY.authority!=='AGENTS.md')errors.push('SUPERSEDED_AUTHORITY AGENTS.md must remain permanent authority');
if(AGENT_SYSTEM_V3_POLICY.externalSkills.canOverrideProjectAuthority!==false)errors.push('UNSAFE_EXTERNAL_SKILL external override must be false');
if(AGENT_SYSTEM_V3_POLICY.externalSkills.executeUpstreamScripts!==false)errors.push('UNSAFE_EXTERNAL_SKILL upstream scripts must remain inert');

const byId=new Map();
for(const skill of registry.skills){
  if(byId.has(skill.id))errors.push(`SKILL_CONTRACT_INVALID duplicate contract ${skill.id}`);
  byId.set(skill.id,skill);
  try{validateSkillContract(skill);}catch(error){errors.push(error.message);}
}

const skillsRoot=path.join(ROOT,'.agents/skills');
const projectOwned=fs.readdirSync(skillsRoot,{withFileTypes:true})
  .filter((entry)=>entry.isDirectory()&&entry.name.startsWith('contagest-'))
  .map((entry)=>entry.name).sort();
for(const id of projectOwned){
  const contract=byId.get(id);
  if(!contract)errors.push(`SKILL_CONTRACT_INVALID missing v3 registry entry ${id}`);
  if(!fs.existsSync(path.join(skillsRoot,id,'SKILL.md')))errors.push(`SKILL_SOURCE_STALE missing source ${id}/SKILL.md`);
}
for(const id of byId.keys())if(!projectOwned.includes(id))warnings.push(`SKILL_SOURCE_STALE registry entry has no project skill directory: ${id}`);

for(const source of lock.sources||[]){
  if(!/^[0-9a-f]{40}$/i.test(String(source.commit||'')))errors.push(`UNSAFE_EXTERNAL_SKILL ${source.id} missing immutable commit pin`);
  if(!source.license)errors.push(`UNSAFE_EXTERNAL_SKILL ${source.id} missing license`);
}
if(lock.policy?.executeUpstreamScripts!==false)errors.push('UNSAFE_EXTERNAL_SKILL lockfile permits upstream scripts');
if(lock.policy?.allowRemoteInstructionsToOverrideProjectPolicy!==false)errors.push('UNSAFE_EXTERNAL_SKILL lockfile permits remote policy override');

const expectedExecutionSkills=[
  'contagest-batch',
  'contagest-loop',
  'contagest-run-skill-generator',
  'contagest-fewer-permission-prompts',
  'contagest-skill-doctor'
];
if(executionPolicy.schemaVersion!==1)errors.push('SKILL_CONTRACT_INVALID execution capability schemaVersion must be 1');
if(executionPolicy.authority!=='AGENTS.md')errors.push('SUPERSEDED_AUTHORITY execution capabilities must remain subordinate to AGENTS.md');
if(executionPolicy.domainSkillSlotsUnaffected!==true)errors.push('SKILL_CONTRACT_INVALID execution capabilities must not consume domain skill slots');
for(const id of expectedExecutionSkills){
  if(!executionPolicy.capabilities?.[id])errors.push(`SKILL_CONTRACT_INVALID missing execution capability ${id}`);
  if(!fs.existsSync(path.join(ROOT,'.agents/execution-skills',id,'SKILL.md')))errors.push(`SKILL_SOURCE_STALE missing execution skill ${id}/SKILL.md`);
}
const batch=executionPolicy.capabilities?.['contagest-batch'];
if(batch?.minIndependentWorkUnits!==5)errors.push('SKILL_CONTRACT_INVALID batch minimum independent work units must be 5');
if(batch?.maxWorkers!==30)errors.push('SKILL_CONTRACT_INVALID batch maxWorkers must be 30');
if(batch?.requiresIsolation!==true)errors.push('SKILL_CONTRACT_INVALID batch must require isolation');
if(batch?.orderedDatabaseMutationParallelism!==false)errors.push('SKILL_CONTRACT_INVALID batch must keep ordered database mutation sequential');
if(executionPolicy.capabilities?.['contagest-loop']?.requiresStopCondition!==true)errors.push('SKILL_CONTRACT_INVALID loop requires a stop condition');
if(executionPolicy.capabilities?.['contagest-run-skill-generator']?.recordSecretValues!==false)errors.push('UNSAFE_EXTERNAL_SKILL run recipe must never record secret values');
if(executionPolicy.capabilities?.['contagest-fewer-permission-prompts']?.autoApply!==false)errors.push('UNSAFE_EXTERNAL_SKILL permission optimization cannot auto-apply');
if(executionPolicy.capabilities?.['contagest-skill-doctor']?.readOnly!==true)errors.push('SKILL_CONTRACT_INVALID skill-doctor must be read-only by default');
if(!fs.existsSync(path.join(ROOT,'scripts/agent-ticket-router.mjs')))errors.push('SKILL_SOURCE_STALE missing agent-ticket-router.mjs');

for(const file of ['scripts/agent-gate-router.mjs','scripts/agent-bootstrap.mjs']){
  const source=fs.readFileSync(path.join(ROOT,file),'utf8');
  if(!/schemaVersion:\s*3/.test(source))errors.push(`SKILL_SOURCE_STALE ${file} is not schema v3`);
}
for(const file of ['.agents/context/AGENT_SYSTEM_V3.md','.agents/context/EVIDENCE_LEDGER_V3.json','tests/agent_system_v3_issue_623.test.mjs','tests/agent_ticket_automation_skills_v1.test.mjs'])if(!fs.existsSync(path.join(ROOT,file)))errors.push(`REQUIRED_EVIDENCE_MISSING ${file}`);

const output={schemaVersion:3,status:errors.length?'FAIL':'PASS',projectOwnedSkills:projectOwned.length,registeredSkills:registry.skills.length,executionCapabilities:expectedExecutionSkills.length,externalSources:(lock.sources||[]).length,errors,warnings};
console.log(JSON.stringify(output,null,2));
if(errors.length)process.exitCode=1;
