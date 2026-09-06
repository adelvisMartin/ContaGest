import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.slice(6)||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const repo=String(process.env.GITHUB_REPOSITORY||'').trim();
if(!/^[^/]+\/[^/]+$/.test(repo))throw new Error('GITHUB_REPOSITORY_REQUIRED');
const root=path.resolve('artifacts/qa/erp-v155',sha);
const input=path.join(root,'defect-candidates.json');
if(!fs.existsSync(input))throw new Error(`DEFECT_CANDIDATES_MISSING:${input}`);

function runGh(args){
  const result=spawnSync('gh',args,{encoding:'utf8',env:process.env});
  if(result.status!==0)throw new Error(`GH_COMMAND_FAILED:${args.join(' ')}:${String(result.stderr||result.stdout||'').trim().slice(0,500)}`);
  return String(result.stdout||'');
}
function issueNumberFromKnown(value){
  const match=String(value||'').match(/#(\d+)/);
  return match?Number(match[1]):null;
}
function safeList(value){return Array.isArray(value)?value.map(String):[];}

const payload=JSON.parse(fs.readFileSync(input,'utf8'));
if(String(payload.candidateSha||'').toLowerCase()!==sha.toLowerCase())throw new Error('DEFECT_CANDIDATE_SHA_MISMATCH');
const defects=Array.isArray(payload.defects)?payload.defects:[];
const required=defects.filter((item)=>['P0','P1'].includes(String(item.severity||'').toUpperCase()));
const results=[];

for(const defect of required){
  const fingerprint=String(defect.id||'').trim();
  if(!/^QA155-[A-F0-9]{8}$/i.test(fingerprint))throw new Error(`INVALID_DEFECT_FINGERPRINT:${fingerprint}`);
  const known=issueNumberFromKnown(defect.knownIssue);
  if(known){
    const issue=JSON.parse(runGh(['issue','view',String(known),'--repo',repo,'--json','number,title,url,state']));
    results.push({fingerprint,severity:defect.severity,status:'linked-existing',issueNumber:issue.number,url:issue.url,state:issue.state});
    continue;
  }

  const listed=JSON.parse(runGh(['issue','list','--repo',repo,'--state','all','--search',fingerprint,'--json','number,title,url,state,body','--limit','100']));
  const existing=listed.find((item)=>String(item.title||'').includes(fingerprint)||String(item.body||'').includes(`QA155-FINGERPRINT:${fingerprint}`)||String(item.body||'').includes(fingerprint));
  if(existing){
    results.push({fingerprint,severity:defect.severity,status:'deduplicated-existing',issueNumber:existing.number,url:existing.url,state:existing.state});
    continue;
  }

  const title=`[QA155][${defect.severity}] ${defect.route} · ${defect.criticalFlow} · ${defect.kind} (${fingerprint})`.slice(0,240);
  const body=[
    `<!-- QA155-FINGERPRINT:${fingerprint} -->`,
    '# Hallazgo automático de QA System Campaign #155',
    '',
    `- Candidate SHA: \`${sha}\``,
    `- Severidad: **${defect.severity}**`,
    `- Ruta: \`${defect.route}\``,
    `- Flujo crítico: \`${defect.criticalFlow}\``,
    `- Finding: \`${defect.kind}\``,
    `- Roles: ${safeList(defect.roles).join(', ')||'n/a'}`,
    `- Viewports: ${safeList(defect.viewports).join(', ')||'n/a'}`,
    `- Estados: ${safeList(defect.states).join(', ')||'n/a'}`,
    '',
    '## Precondición',
    String(defect.precondition||'Candidate SHA exacto y fixtures SYNTHETIC_TEST_ONLY.'),
    '',
    '## Pasos',
    ...safeList(defect.steps).map((step,index)=>`${index+1}. ${step}`),
    '',
    '## Actual',
    `La campaña detectó \`${defect.kind}\`. Revisar artifacts SHA-bound antes de corregir.`,
    '',
    '## Esperado',
    String(defect.expected||'El flujo debe ser funcional, seguro, usable y sin regresiones.'),
    '',
    '## Evidencia',
    ...(safeList(defect.evidence).length?safeList(defect.evidence).map((item)=>`- \`${item}\``):['- Referenciada en artifacts de QA #155 del candidate SHA.']),
    '',
    '## Muestras sanitizadas',
    '```json',
    JSON.stringify(Array.isArray(defect.samples)?defect.samples.slice(0,5):[],null,2),
    '```',
    '',
    '## Regresión / rollback',
    '- Añadir o actualizar prueba de regresión junto con la corrección.',
    `- ${String(defect.rollback||'Revertir únicamente el cambio correctivo si introduce una regresión.')}`,
    '',
    '> Generado desde fixtures `SYNTHETIC_TEST_ONLY`; no contiene PII de clientes reales.'
  ].join('\n');
  const url=runGh(['issue','create','--repo',repo,'--title',title,'--body',body]).trim();
  if(!url)throw new Error(`ISSUE_CREATE_RETURNED_EMPTY:${fingerprint}`);
  results.push({fingerprint,severity:defect.severity,status:'created',url});
}

const unresolved=required.filter((defect)=>!results.some((item)=>item.fingerprint===defect.id));
const report={schemaVersion:1,issue:155,candidateSha:sha,requiredP01:required.length,linkedOrCreated:results.length,unresolved:unresolved.map((item)=>item.id),results,generatedAt:new Date().toISOString()};
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'issue-harvest.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(unresolved.length)process.exitCode=2;
