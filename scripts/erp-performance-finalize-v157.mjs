#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repo=String(process.env.GITHUB_REPOSITORY||'adelvisMartin/ContaGest');
const token=String(process.env.GITHUB_TOKEN||'').trim();
const sha=String(process.env.CANDIDATE_SHA||'').trim();
const runUrl=String(process.env.GITHUB_RUN_URL||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
if(!token)throw new Error('GITHUB_TOKEN_REQUIRED');
const summaryPath=path.resolve('artifacts/qa/erp-performance-v157',sha,'summary.json');
if(!fs.existsSync(summaryPath))throw new Error('PERFORMANCE_SUMMARY_REQUIRED');
const summary=JSON.parse(fs.readFileSync(summaryPath,'utf8'));
if(summary.candidateSha!==sha)throw new Error('PERFORMANCE_SUMMARY_SHA_MISMATCH');
if(summary.verdict!=='PASS')throw new Error(`PERFORMANCE_VERDICT_NOT_CLOSABLE:${summary.verdict}`);
if(!/^[a-f0-9]{64}$/i.test(String(summary.measurementHash||'')))throw new Error('PERFORMANCE_MEASUREMENT_HASH_REQUIRED');

const [owner,name]=repo.split('/');
if(!owner||!name)throw new Error('GITHUB_REPOSITORY_INVALID');
const base=`https://api.github.com/repos/${owner}/${name}`;
const headers={
  accept:'application/vnd.github+json',
  authorization:`Bearer ${token}`,
  'x-github-api-version':'2022-11-28',
  'content-type':'application/json'
};
async function api(route,options={}){
  const response=await fetch(`${base}${route}`,{...options,headers:{...headers,...(options.headers||{})}});
  const text=await response.text();let body={};try{body=text?JSON.parse(text):{};}catch{body={message:text};}
  if(!response.ok)throw new Error(`GITHUB_API_${response.status}:${body?.message||route}`);
  return body;
}

const dependency=await api('/issues/155');
if(dependency.state!=='closed')throw new Error('ISSUE_155_MUST_BE_CLOSED_BEFORE_157');
const current=await api('/issues/157');
if(current.state==='closed'){
  console.log(JSON.stringify({issue:157,state:'already-closed',candidateSha:sha,verdict:summary.verdict}));
  process.exit(0);
}

const body=[
  `Capacity QA ejecutado sobre \`${sha}\`: **${summary.verdict}**.`,
  `Evidencia SHA-256: \`${summary.measurementHash}\`.`,
  runUrl?`Run: ${runUrl}.`:'',
  '#155 ya está cerrado y el gate #157 completó todas las dimensiones obligatorias.'
].filter(Boolean).join('\n\n');
await api('/issues/157/comments',{method:'POST',body:JSON.stringify({body})});
await api('/issues/157',{method:'PATCH',body:JSON.stringify({state:'closed',state_reason:'completed'})});
console.log(JSON.stringify({issue:157,state:'closed',candidateSha:sha,verdict:summary.verdict,measurementHash:summary.measurementHash}));
