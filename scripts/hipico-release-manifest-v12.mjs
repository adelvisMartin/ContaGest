import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PROMOTION_STAGES=['SHADOW','ASSISTED','AUTOMATIC_LOW_RISK','AUTOMATIC'];
export const REQUIRED_RELEASE_GATES=[
  'exact_sha','typecheck','unit_contracts','postgres16','backend_build','frontend_build',
  'chromium_responsive_wcag','bridge','documents_pdf','providers','lifecycle_multigroup_replay',
  'appsec_ssrf_rbac_secrets','pwa_offline','android_bridge_parity','performance','golden_corpus','observability'
];
const SHA=/^[a-f0-9]{40}$/i;
const STATUSES=new Set(['PASS','BLOCKED','NOT_EXECUTED','FAIL']);

export function validatePromotionTransition(from,to){
  if(to==='SHADOW')return true;
  const current=PROMOTION_STAGES.indexOf(String(from)); const next=PROMOTION_STAGES.indexOf(String(to));
  return current>=0&&next===current+1;
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
function signature(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}

export function buildReleaseManifest({candidateSha,gates,generatedAt=null}){
  const sha=String(candidateSha||'').trim().toLowerCase();
  if(!SHA.test(sha))throw new Error('Production release requires an exact 40-char candidate SHA.');
  const byId=new Map((Array.isArray(gates)?gates:[]).map((gate)=>[String(gate?.id||''),gate]));
  const normalized=REQUIRED_RELEASE_GATES.map((id)=>{
    const gate=byId.get(id)||{}; const status=STATUSES.has(String(gate.status))?String(gate.status):'NOT_EXECUTED';
    const evidenceSha=SHA.test(String(gate.evidenceSha||''))?String(gate.evidenceSha).toLowerCase():null;
    const sameCandidate=evidenceSha===sha;
    return{id,status,evidenceSha,sameCandidate};
  });
  const releaseEligible=normalized.every((gate)=>gate.status==='PASS'&&gate.sameCandidate);
  const stable={schemaVersion:'hipico-release-v12',candidateSha:sha,gates:normalized,invariants:{sourceReadOnly:true,labWriteOnlyDuringQa:true,financialAuthority:false,llmDirectDbWrites:false,llmSettlementAuthority:false},rollout:{stages:PROMOTION_STAGES,initial:'SHADOW',promotionRequiresAllGates:true},rollback:{killSwitchTarget:'SHADOW',preserveData:true,reasonRequired:true},releaseEligible};
  return{...stable,generatedAt,signature:signature(stable)};
}

async function main(){
  const sha=String(process.env.HIPICO_CANDIDATE_SHA||process.env.GITHUB_SHA||'').trim();
  const evidencePath=process.argv[2]||process.env.HIPICO_RELEASE_EVIDENCE||'artifacts/qa/hipico-release-evidence.json';
  let evidence={gates:[]};
  try{evidence=JSON.parse(await fs.readFile(evidencePath,'utf8'));}catch(error){if(error?.code!=='ENOENT')throw error;}
  const manifest=buildReleaseManifest({candidateSha:sha,gates:evidence.gates,generatedAt:new Date().toISOString()});
  const out=process.env.HIPICO_RELEASE_MANIFEST||'artifacts/qa/hipico-release-manifest-v12.json';
  await fs.mkdir(path.dirname(out),{recursive:true}); await fs.writeFile(out,`${JSON.stringify(manifest,null,2)}\n`);
  console.log(JSON.stringify({candidateSha:manifest.candidateSha,releaseEligible:manifest.releaseEligible,signature:manifest.signature,manifest:out}));
  if(!manifest.releaseEligible)process.exitCode=2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
