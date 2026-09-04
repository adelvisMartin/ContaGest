#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sha=String(process.env.CANDIDATE_SHA||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const create=process.argv.includes('--create');
const repo=process.env.GITHUB_REPOSITORY||'adelvisMartin/ContaGest';
const dir=path.resolve('artifacts/qa/erp-performance-v157',sha);
const summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'));
const candidates=(summary.checks||[]).filter((check)=>check.value!==null&&check.pass===false).map((check)=>({
  key:check.key,
  value:check.value,
  budget:check.budget,
  direction:check.direction,
  title:`[PERF][#157] ${check.key} fuera de budget`,
  body:`## Evidencia\n\n- Parent: #157\n- SHA medido: \`${sha}\`\n- Métrica: \`${check.key}\`\n- Valor: **${check.value}**\n- Budget: **${check.direction==='min'?'>=':'<='} ${check.budget}**\n\n## Regla\nEste ticket sólo existe porque el benchmark reproducible produjo un valor finito fuera del presupuesto. Repetir el mismo escenario antes y después de cualquier optimización y conservar evidencia por SHA.\n\nRefs #157`
}));
fs.writeFileSync(path.join(dir,'defect-candidates.json'),JSON.stringify({issue:157,candidateSha:sha,candidates},null,2)+'\n');

function gh(args){return execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env,windowsHide:true}).trim();}
if(create&&summary.verdict==='FAIL')for(const candidate of candidates){
  const found=gh(['issue','list','--repo',repo,'--state','open','--search',`in:title "${candidate.title}"`,'--json','number,title']);
  const parsed=JSON.parse(found||'[]');
  if(parsed.some((item)=>item.title===candidate.title))continue;
  gh(['issue','create','--repo',repo,'--title',candidate.title,'--body',candidate.body]);
}
console.log(JSON.stringify({issue:157,candidateSha:sha,verdict:summary.verdict,candidateCount:candidates.length,created:create&&summary.verdict==='FAIL'}));
