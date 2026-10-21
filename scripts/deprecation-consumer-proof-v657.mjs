#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_EXT=new Set(['.js','.jsx','.ts','.tsx','.mjs','.cjs','.json','.html','.css','.webmanifest']);
const EXCLUDE=new Set(['node_modules','.git','.next','dist','build','coverage','artifacts']);
const RUNTIME_ROOTS=['frontend/src','backend/src','packages','frontend/public'];
const RUNTIME_ENTRIES=['frontend/index.html','frontend/package.json','backend/package.json','package.json','vite.config.js','vite.config.ts','vercel.json','frontend/vercel.json'];
function isSafe(value) {
  return typeof value==='string' && /^[\w./-]+$/.test(value) &&
    !value.startsWith('/') && !value.startsWith('./') && !value.split('/').includes('..');
}
function walk(base,dir) {
  if(!fs.existsSync(dir)) return [];
  const out=[];
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(EXCLUDE.has(item.name) || item.isSymbolicLink()) continue;
    const current=path.join(dir,item.name);
    if(item.isDirectory()) out.push(...walk(base,current));
    if(item.isFile() && SOURCE_EXT.has(path.extname(item.name)))
      out.push(path.relative(base,current).split(path.sep).join('/'));
  }
  return out;
}
function hasComputedConsumer(content) {
  // Literal concatenation also computes a path: import('./' + name).
  const calls=/\b(?:import|require(?:\.resolve)?)\s*\(([^()\n]*)\)/g;
  for(const match of content.matchAll(calls)){
    const arg=match[1].trim();
    if(!/^(['"])[^'"]*\1$/.test(arg))return true;
  }
  return false;
}
export function auditRetiredAdapter(root, policy) {
  const record=policy?.firstRefactorBatch;
  if(!record || !isSafe(record.candidate) ||
     !['ACTIVE','RETIRED'].includes(record.status) ||
     record.requiredConsumerCount!==0 ||
     !Array.isArray(record.canonicalOwners) || !record.canonicalOwners.length ||
     !record.canonicalOwners.every(isSafe)) throw Error('DEPRECATION_POLICY_INVALID');
  if(record.status==='RETIRED' &&
     (!Number.isInteger(record.retirementOwnerIssue) ||
      !Array.isArray(record.retirementEvidence) || !record.retirementEvidence.length ||
      !record.retirementEvidence.every(isSafe))) throw Error('DEPRECATION_EVIDENCE_INVALID');
  const source=[...new Set([...RUNTIME_ROOTS.flatMap(p=>walk(root,path.join(root,p))),
    ...RUNTIME_ENTRIES.filter(p=>fs.existsSync(path.join(root,p)))])].sort();
  const leaf=path.basename(record.candidate);
  const stem=leaf.replace(/\.[^.]+$/,'');
  const references=[],computed=[];
  for(const file of source){
    if(file===record.candidate)continue;
    const content=fs.readFileSync(path.join(root,file),'utf8');
    if(content.includes('/'+leaf) || content.includes("'./"+stem+"'") ||
      content.includes('"./'+stem+'"') || content.includes("'../components/"+stem+"'") ||
      content.includes('"../components/'+stem+'"')) references.push(file);
    if(hasComputedConsumer(content)) computed.push(file);
  }
  const present=fs.existsSync(path.join(root,record.candidate));
  const missingOwners=record.canonicalOwners.filter(p=>!fs.existsSync(path.join(root,p)));
  const missingEvidence=(record.retirementEvidence||[]).filter(p=>!fs.existsSync(path.join(root,p)));
  const errors=[];
  if(record.status==='RETIRED'&&present)errors.push('RETIRED_ADAPTER_REAPPEARED');
  if(record.status==='RETIRED'&&references.length)errors.push('RETIRED_ADAPTER_HAS_CONSUMERS');
  if(missingOwners.length)errors.push('CANONICAL_OWNER_MISSING');
  if(record.status==='RETIRED'&&missingEvidence.length)errors.push('RETIREMENT_EVIDENCE_MISSING');
  // Computed imports cannot be counted as proof of zero runtime consumers.
  const sourceStatus=errors.length?'FAIL':present||computed.length?'REVIEW_REQUIRED':'PASS';
  return {schemaVersion:657,adapter:record.candidate,sourceStatus,
    references,computedImportsToReview:computed,missingOwners,missingEvidence,errors,
    automaticallyDeletable:false,releaseVerified:false,
    caveat:'Source contract only. Computed imports, public URLs, route registries, deployed assets and branch protection require review before any new deletion.'};
}
const invoked=process.argv[1] && fileURLToPath(import.meta.url)===path.resolve(process.argv[1]);
if(invoked)try{
  const root=process.cwd();
  const policy=JSON.parse(fs.readFileSync(path.join(root,'config/architecture-clean-code-authority-v1.json'),'utf8'));
  const result=auditRetiredAdapter(root,policy);
  console.log(JSON.stringify(result,null,2));
  if(result.sourceStatus==='FAIL')process.exitCode=1;
}catch(e){console.error('[consumer-proof #657]',e.message);process.exitCode=1;}
