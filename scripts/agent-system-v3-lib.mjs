import fs from 'node:fs';

const FULL_SHA=/^[0-9a-f]{40}$/i;
const POLICY_PATH=new URL('../config/agent-system-v3.json',import.meta.url);
const SKILLS_PATH=new URL('../config/agent-skill-contracts-v3.json',import.meta.url);
const policy=JSON.parse(fs.readFileSync(POLICY_PATH,'utf8'));
const registry=JSON.parse(fs.readFileSync(SKILLS_PATH,'utf8'));
const activeSkills=new Map(registry.skills.filter((skill)=>skill.status==='ACTIVE').map((skill)=>[skill.id,skill]));

const ROUTES=Object.freeze({
  database:{agents:['dbre','backend-api','qa-release'],skills:['contagest-erp-orchestrator','contagest-db-migration-safety','contagest-tenant-isolation-rbac','contagest-bcp-dr']},
  finance:{agents:['accounting','dbre','qa-release'],skills:['contagest-erp-orchestrator','contagest-accounting-integrity','contagest-tenant-isolation-rbac','contagest-release-evidence']},
  'auth-security':{agents:['appsec-iam','backend-api','qa-release'],skills:['contagest-erp-orchestrator','contagest-tenant-isolation-rbac','contagest-appsec-review','contagest-secure-verification']},
  backend:{agents:['backend-api','qa-release'],skills:['contagest-erp-orchestrator','contagest-secure-verification','contagest-release-evidence']},
  'frontend-ui':{agents:['frontend-pwa-ux','qa-release'],skills:['contagest-erp-orchestrator','contagest-ui-audit','contagest-functional-module-audit']},
  qa:{agents:['qa-release'],skills:['contagest-erp-orchestrator','contagest-systematic-debugging','contagest-release-evidence']},
  release:{agents:['qa-release','appsec-iam'],skills:['contagest-erp-orchestrator','contagest-release-evidence','contagest-secure-verification','contagest-bcp-dr']},
  hipico:{agents:['hipico-reliability','appsec-iam','qa-release'],skills:['contagest-erp-orchestrator','contagest-systematic-debugging','contagest-secure-verification','contagest-release-evidence']},
  clinical:{agents:['frontend-pwa-ux','backend-api','appsec-iam','qa-release'],skills:['contagest-erp-orchestrator','contagest-functional-module-audit','contagest-tenant-isolation-rbac','contagest-appsec-review']},
  architecture:{agents:['orchestrator','qa-release'],skills:['contagest-erp-orchestrator','contagest-systematic-debugging','contagest-release-evidence']}
});

const DOMAIN_ALIASES=Object.freeze({
  db:'database',persistence:'database',migration:'database',accounting:'finance',financial:'finance',auth:'auth-security',security:'auth-security',frontend:'frontend-ui',ui:'frontend-ui',browser:'qa',infra:'release',infrastructure:'release','infra-release':'release',refactor:'architecture',agents:'architecture','agent-system':'architecture','vertical-clinical':'clinical'
});
const INTENT_SKILLS=Object.freeze({
  'ui-polish':'contagest-impeccable',
  'architecture-diagram':'contagest-archify',
  copywriting:'contagest-copywriting'
});
const DIMENSION_ORDER=policy.evidence.dimensions;
const uniq=(values)=>[...new Set(values.filter(Boolean))];
const orderedEvidence=(values)=>uniq(values).sort((a,b)=>DIMENSION_ORDER.indexOf(a)-DIMENSION_ORDER.indexOf(b));

function canonicalDomain(value){const key=String(value??'').trim().toLowerCase();return DOMAIN_ALIASES[key]||key;}
function assertRisk(risk){if(!policy.routing.allowedRisks.includes(risk))throw new Error(`AGENT_ROUTE_AMBIGUOUS unsupported risk ${risk}`);}
function assertTaskType(type){if(!policy.routing.taskTypes.includes(type))throw new Error(`AGENT_ROUTE_AMBIGUOUS unsupported task type ${type}`);}
function normalizeIntents(intents=[]){
  const normalized=uniq((Array.isArray(intents)?intents:[intents]).map((intent)=>String(intent??'').trim().toLowerCase()));
  for(const intent of normalized)if(!Object.hasOwn(INTENT_SKILLS,intent))throw new Error(`AGENT_ROUTE_AMBIGUOUS unsupported intent ${intent}`);
  return normalized;
}

export function planVerification({type='feature',boundaries=[]}={}){
  assertTaskType(type);
  const set=new Set(['SOURCE_REVIEW','LOCAL_STATIC']);
  const normalized=new Set(boundaries.map((item)=>String(item).toLowerCase()));
  if(type==='refactor')set.add('LOCAL_UNIT');
  if(type==='bugfix'||type==='incident')set.add('LOCAL_UNIT');
  if(type==='migration'){set.add('LOCAL_UNIT');set.add('LOCAL_INTEGRATION');set.add('LOCAL_POSTGRES');}
  if(normalized.has('backend')||normalized.has('api')){set.add('LOCAL_UNIT');set.add('LOCAL_INTEGRATION');}
  if(normalized.has('persistence')||normalized.has('database')||normalized.has('tenant')){set.add('LOCAL_UNIT');set.add('LOCAL_INTEGRATION');set.add('LOCAL_POSTGRES');}
  if(normalized.has('financial')){set.add('LOCAL_UNIT');set.add('LOCAL_INTEGRATION');set.add('LOCAL_POSTGRES');}
  if(normalized.has('auth')||normalized.has('security')){set.add('LOCAL_UNIT');set.add('LOCAL_INTEGRATION');}
  if(normalized.has('frontend')||normalized.has('ui')){set.add('LOCAL_UNIT');set.add('LOCAL_BUILD');set.add('LOCAL_BROWSER_E2E');}
  if(normalized.has('browser')){set.add('LOCAL_BUILD');set.add('LOCAL_BROWSER_E2E');}
  if(normalized.has('provider')||normalized.has('remote-ci'))set.add('REMOTE_CI');
  if(normalized.has('deploy')||normalized.has('remote-deploy'))set.add('REMOTE_DEPLOY');
  if(normalized.has('physical'))set.add('PHYSICAL_EXTERNAL');
  return orderedEvidence([...set]);
}

export function routeTask({risk='P2',type='feature',domains=[],boundaries=[],intents=[]}={}){
  assertRisk(risk);assertTaskType(type);
  const normalizedIntents=normalizeIntents(intents);
  const canonical=uniq(domains.map(canonicalDomain));
  if(!canonical.length)canonical.push('architecture');
  const selected=canonical.map((domain)=>ROUTES[domain]).filter(Boolean);
  if(!selected.length)throw new Error(`AGENT_ROUTE_AMBIGUOUS no route for domains: ${canonical.join(',')}`);
  const agents=uniq(selected.flatMap((route)=>route.agents));
  let skills=uniq(selected.flatMap((route)=>route.skills)).filter((id)=>activeSkills.has(id));
  if(type==='bugfix'||type==='incident')skills=uniq(['contagest-systematic-debugging',...skills]);
  if((risk==='P0'||risk==='P1')&&!skills.includes('contagest-release-evidence'))skills.push('contagest-release-evidence');
  if(!skills.includes('contagest-erp-orchestrator'))skills.unshift('contagest-erp-orchestrator');
  const score=(id)=>{
    if(id==='contagest-erp-orchestrator')return 100;
    if(type==='bugfix'||type==='incident')if(id==='contagest-systematic-debugging')return 95;
    const firstIndex=selected.flatMap((route)=>route.skills).indexOf(id);
    return 80-Math.max(firstIndex,0)+(id==='contagest-release-evidence'&&risk==='P0'?5:0);
  };
  skills=uniq(skills).sort((a,b)=>score(b)-score(a)||a.localeCompare(b)).slice(0,policy.routing.maxSkills);
  while(skills.length<policy.routing.minSkills){
    const fallback=['contagest-release-evidence','contagest-secure-verification'].find((id)=>activeSkills.has(id)&&!skills.includes(id));
    if(!fallback)break;skills.push(fallback);
  }
  if(skills.length<policy.routing.minSkills)throw new Error('AGENT_ROUTE_AMBIGUOUS insufficient active skills');

  const explicitAdvisory=normalizedIntents.map((intent)=>INTENT_SKILLS[intent]);
  const normalizedBoundaries=new Set(boundaries.map((item)=>String(item??'').trim().toLowerCase()));
  const uiMaterial=canonical.includes('frontend-ui')||normalizedBoundaries.has('ui')||normalizedBoundaries.has('frontend')||normalizedBoundaries.has('browser');
  const advisoryCandidates=explicitAdvisory.length?explicitAdvisory:(uiMaterial?['contagest-ui-ux-pro-max']:[]);
  for(const id of advisoryCandidates){
    if(skills.length>=policy.routing.maxSkills)break;
    if(activeSkills.has(id)&&!skills.includes(id))skills.push(id);
  }

  return {schemaVersion:3,risk,type,domains:canonical,boundaries:uniq(boundaries),intents:normalizedIntents,agents,skills,verification:planVerification({type,boundaries})};
}

export function normalizeEvidence(entry={}){
  const dimension=String(entry.dimension??'');
  const status=String(entry.status??'');
  const sha=String(entry.sha??'').toLowerCase();
  if(!policy.evidence.dimensions.includes(dimension))throw new Error(`REQUIRED_EVIDENCE_MISSING invalid dimension ${dimension}`);
  if(!policy.evidence.statuses.includes(status))throw new Error(`REQUIRED_EVIDENCE_MISSING invalid status ${status}`);
  if(!FULL_SHA.test(sha))throw new Error('EVIDENCE_SHA_MISMATCH invalid candidate SHA');
  const command=String(entry.command??'').trim(),environment=String(entry.environment??'').trim(),evidence=String(entry.evidence??'').trim();
  if(status==='PASS'&&(!command||!environment||!evidence))throw new Error('REQUIRED_EVIDENCE_MISSING PASS requires command, environment and evidence');
  if(status==='BLOCKED'&&!evidence)throw new Error('REQUIRED_EVIDENCE_MISSING BLOCKED requires evidence/reason');
  if((dimension==='REMOTE_CI'||dimension==='REMOTE_DEPLOY')&&status==='BLOCKED'&&entry.reasonCode&&!policy.errorCodes.includes(entry.reasonCode))throw new Error(`REQUIRED_EVIDENCE_MISSING unknown provider reason ${entry.reasonCode}`);
  return {dimension,status,sha,command,environment,evidence,reasonCode:entry.reasonCode??null};
}

export function assertEvidenceSha(entries=[],candidateSha){
  const expected=String(candidateSha??'').toLowerCase();
  if(!FULL_SHA.test(expected))throw new Error('EVIDENCE_SHA_MISMATCH invalid candidate SHA');
  for(const entry of entries){const normalized=normalizeEvidence(entry);if(normalized.sha!==expected)throw new Error(`EVIDENCE_SHA_MISMATCH ${normalized.sha} != ${expected}`);}
  return true;
}

export function graphifyState({headSha,sourceSha=null,available=true}={}){
  const head=String(headSha??'').toLowerCase();
  if(!FULL_SHA.test(head))throw new Error('GRAPHIFY_STALE invalid HEAD SHA');
  if(!available||!sourceSha)return {status:'UNAVAILABLE',headSha:head,sourceSha:null,authority:'navigation-only'};
  const source=String(sourceSha).toLowerCase();
  if(!FULL_SHA.test(source))return {status:'UNAVAILABLE',headSha:head,sourceSha:null,authority:'navigation-only'};
  return {status:source===head?'CURRENT':'STALE',headSha:head,sourceSha:source,authority:'navigation-only'};
}

export function reconcileClaims(claims=[],now=new Date()){
  const active=claims.filter((claim)=>claim?.status!=='closed'&&claim?.status!=='expired');
  const advisory=active.filter((claim)=>claim.mode==='advisory');
  const exclusive=active.filter((claim)=>claim.mode==='exclusive');
  const issueSet=uniq(exclusive.map((claim)=>String(claim.issue)));
  const duplicates=[];
  let owner=null;
  for(const issue of issueSet){
    const group=exclusive.filter((claim)=>String(claim.issue)===issue);
    if(group.length===1){owner=group[0].id;continue;}
    const ids=new Set(group.map((claim)=>claim.id));
    const targeted=new Set();
    for(const claim of group)for(const target of claim.supersedes||[])if(ids.has(target))targeted.add(target);
    const roots=group.filter((claim)=>!targeted.has(claim.id));
    if(roots.length!==1){duplicates.push({issue:Number(issue),claims:group.map((claim)=>claim.id)});continue;}
    const root=roots[0];
    const reachable=new Set([root.id]);
    const stack=[root];
    while(stack.length){const current=stack.pop();for(const target of current.supersedes||[]){if(ids.has(target)&&!reachable.has(target)){reachable.add(target);const next=group.find((claim)=>claim.id===target);if(next)stack.push(next);}}}
    if(reachable.size!==group.length){duplicates.push({issue:Number(issue),claims:group.map((claim)=>claim.id)});continue;}
    owner=root.id;
  }
  const staleAfter=policy.claims.staleAfterHours*60*60*1000;
  const stale=active.filter((claim)=>claim.updatedAt&&now.getTime()-new Date(claim.updatedAt).getTime()>staleAfter).map((claim)=>claim.id);
  return {ok:duplicates.length===0,code:duplicates.length?'DUPLICATE_WORK_CLAIM':'OK',owner,duplicates,advisory:advisory.map((claim)=>claim.id),stale};
}

export function validateSkillContract(skill){
  const required=['id','status','purpose','triggers','requiredInputs','authoritativeSources','prohibitedActions','expectedEvidence','minimumValidation','riskEscalation','dependencies','provenance'];
  const missing=required.filter((field)=>skill?.[field]===undefined||skill?.[field]===null||skill?.[field]==='');
  if(missing.length)throw new Error(`SKILL_CONTRACT_INVALID ${skill?.id||'<unknown>'}: ${missing.join(',')}`);
  if(!['ACTIVE','DEPRECATED','SUPERSEDED'].includes(skill.status))throw new Error(`SKILL_CONTRACT_INVALID ${skill.id}: status`);
  if(skill.status==='ACTIVE'&&skill.provenance?.kind?.startsWith('external'))throw new Error(`UNSAFE_EXTERNAL_SKILL ${skill.id}`);
  return true;
}

export function getActiveSkillContracts(){return [...activeSkills.values()];}
export { policy as AGENT_SYSTEM_V3_POLICY };
