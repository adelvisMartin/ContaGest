import { execFileSync } from 'node:child_process';
import { gatesForFiles } from '../qa/support/domain-risk-catalog.mjs';
import { routeTask } from './agent-system-v3-lib.mjs';

const args=process.argv.slice(2);
const valueOf=(flag)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:'';};
const explicit=valueOf('--files');
const base=valueOf('--base')||process.env.CG_DIFF_BASE||'main';
const taskType=valueOf('--type')||'feature';
const explicitRisk=valueOf('--risk');
let files=[];
if(explicit){files=explicit.split(',').map((item)=>item.trim()).filter(Boolean);}else{
  try{files=execFileSync('git',['diff','--name-only',`${base}...HEAD`],{encoding:'utf8'}).split(/\r?\n/).map((item)=>item.trim()).filter(Boolean);}catch(error){console.error(`No se pudo obtener el diff contra ${base}: ${error.message}`);process.exit(2);}
}
const domains=gatesForFiles(files);
const unique=(values)=>[...new Set(values)].sort();
const domainHints=unique(domains.flatMap((entry)=>({
  'accounting-financial':['finance'],
  'identity-tenant-rbac':['auth-security'],
  'database-migration':['database'],
  'frontend-shell-design':['frontend-ui'],
  'health-sensitive':['clinical'],
  'pwa-offline':['frontend-ui'],
  integrations:['backend'],
  'release-infrastructure':['release'],
  'agent-system':['architecture'],
  'hipico-automation':['hipico'],
  'data-lifecycle':['database'],
  'api-governance':['backend'],
  observability:['backend'],
  'supply-chain':['auth-security','release'],
  'vertical-runtime':['clinical','frontend-ui'],
  'privacy-sensitive':['auth-security']
}[entry.id]||[]));
const boundaries=unique(domains.flatMap((entry)=>({
  'accounting-financial':['financial','persistence'],
  'identity-tenant-rbac':['auth','tenant'],
  'database-migration':['persistence','tenant'],
  'frontend-shell-design':['ui','browser'],
  'health-sensitive':['api','tenant','ui'],
  'pwa-offline':['ui','browser'],
  integrations:['api','provider'],
  'release-infrastructure':['provider','deploy'],
  'agent-system':['api'],
  'hipico-automation':['api','provider'],
  'data-lifecycle':['persistence','tenant'],
  'api-governance':['api'],
  observability:['api'],
  'supply-chain':['security','provider'],
  'vertical-runtime':['api','ui','browser','tenant'],
  'privacy-sensitive':['security','tenant']
}[entry.id]||[]));
const inferredRisk=domains.some((entry)=>entry.severity==='critical')?'P0':domains.some((entry)=>entry.severity==='high')?'P1':'P2';
const routed=routeTask({risk:explicitRisk||inferredRisk,type:taskType,domains:domainHints.length?domainHints:['architecture'],boundaries});
const rawAgentIds=unique(domains.flatMap((entry)=>entry.agentIds||[]));
const agentIds=unique([...routed.agents,...rawAgentIds]).slice(0,6);
const output={
  schemaVersion:3,
  base,
  files,
  task:{type:taskType,risk:routed.risk,boundaries:routed.boundaries},
  domains:domains.map(({id,severity})=>({id,severity})),
  agents:agentIds,
  agentProfiles:agentIds.filter((id)=>!['orchestrator'].includes(id)||true).map((id)=>`.agents/agents/${id}.md`),
  skills:routed.skills.map((skill)=>`.agents/skills/${skill}/SKILL.md`),
  gates:unique(domains.flatMap((entry)=>entry.gates||[])),
  verification:routed.verification,
  critical:routed.risk==='P0',
  routingPolicy:'minimal-2-4-skills'
};
console.log(JSON.stringify(output,null,2));
if(!files.length)console.error('Aviso: no se detectaron archivos modificados.');
if(output.critical)console.error('Cambio P0/crítico detectado: no reducir gates materiales sin evidencia y aprobación del owner.');
