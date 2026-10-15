#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const VALID_DOMAINS=new Set(['platform','commercial','financial','operations','vertical','frontend','quality','infrastructure']);
export const REQUIRED_CONTEXTS=Object.freeze(["auth","tenancy","rbac","schema","sales","purchases","ledger","fiscal","fx","banking","payables","payroll","inventory","imports","verticals","hipico-api","hipico-bridge","hipico-pwa","ui-components","ui-tokens","browser-qa","release-evidence","observability","release-ops"]);
const validPath=(v)=>typeof v==='string' && /^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(v) &&
 !v.split('/').includes('..')&&!v.split('/').includes('.');
const isCore=(domain)=>['platform','commercial','financial','operations'].includes(domain);
function checkPath(p, label, findings, exists, absent=false){
 if(!validPath(p)){findings.push(label+':INVALID_RELATIVE_PATH');return;}
 if(absent?exists(p):!exists(p))findings.push(label+':'+(absent?'DEPRECATED_OWNER_EXISTS:':'PATH_MISSING:')+p);
}
/** Structural intent, not a claim that declared dependencies were imported. */
export function validateOwnership(manifest,{exists=()=>true}={}){
 const findings=[];
 if(!manifest||manifest.schemaVersion!==1||manifest.issue!==653||!Array.isArray(manifest.contexts)||!Array.isArray(manifest.deprecations))
   return {ok:false,findings:['INVALID_MANIFEST']};
 const seen=new Map(),ownerMap=new Map(),contexts=manifest.contexts;
 for(const c of contexts){
   if(!c||!(/^[a-z][a-z0-9-]*$/).test(c.id??'')){findings.push('INVALID_CONTEXT');continue;}
   if(seen.has(c.id))findings.push('DUPLICATE_ID:'+c.id);
   seen.set(c.id,c);
   if(!VALID_DOMAINS.has(c.domain))findings.push('INVALID_DOMAIN:'+c.id);
   for(const key of ['owner','contract','gate'])checkPath(c[key],c.id+':'+key,findings,exists);
   if(c.persistence!=='NONE')checkPath(c.persistence,c.id+':persistence',findings,exists);
   else if(!['frontend','quality','infrastructure'].includes(c.domain))findings.push('MISSING_PERSISTENCE:'+c.id);
   if(!Array.isArray(c.dependencies))findings.push('DEPENDENCIES_NOT_ARRAY:'+c.id);
   if(typeof c.forbiddenShortcut!=='string'||!c.forbiddenShortcut.trim())findings.push('MISSING_RESTRICTION:'+c.id);
   if(validPath(c.owner)){
     for(const [prior,id] of ownerMap)
       if(c.owner===prior||c.owner.startsWith(prior+'/')||prior.startsWith(c.owner+'/'))
         findings.push('DUPLICATE_OWNER:'+c.id+':'+id);
     ownerMap.set(c.owner,c.id);
   }
 }
 for(const required of REQUIRED_CONTEXTS)if(!seen.has(required))findings.push('MISSING_CONTEXT:'+required);
 for(const c of contexts){
   if(!c||!Array.isArray(c.dependencies))continue;
   const unique=new Set();
   for(const depId of c.dependencies){
     if(unique.has(depId))findings.push('DUPLICATE_DEPENDENCY:'+c.id+':'+depId);
     unique.add(depId);
     const dep=seen.get(depId);
     if(!dep||depId===c.id)findings.push('INVALID_DEPENDENCY:'+c.id+':'+depId);
     else if(isCore(c.domain)&&dep.domain==='vertical')findings.push('CORE_IMPORTS_VERTICAL:'+c.id);
     else if(c.domain==='vertical'&&isCore(dep.domain))findings.push('VERTICAL_IMPORTS_ERP:'+c.id);
   }
 }
 const priorDeprecations=new Set();
 for(const d of manifest.deprecations){
   if(!d||!validPath(d.owner)||priorDeprecations.has(d.owner)){findings.push('DUPLICATE_OR_INVALID_DEPRECATION');continue;}
   priorDeprecations.add(d.owner);
   if(!['removed','superseded'].includes(d.status))findings.push('INVALID_DEPRECATION_STATUS:'+d.owner);
   if(d.status==='removed'){
     checkPath(d.owner,'deprecated',findings,exists,true);
     if(d.consumers!==0)findings.push('DEPRECATED_OWNER_HAS_CONSUMERS:'+d.owner);
   }
   if(ownerMap.has(d.owner))findings.push('ACTIVE_DEPRECATED_OWNER:'+d.owner);
   if(!Number.isInteger(d.issue)||d.issue<1)findings.push('DEPRECATION_ISSUE_MISSING:'+d.owner);
   if(!Array.isArray(d.replacements)||!d.replacements.length)findings.push('DEPRECATION_REPLACEMENTS_MISSING:'+d.owner);
   else for(const p of d.replacements)checkPath(p,'replacement',findings,exists);
   checkPath(d.consumerProof,'consumerProof',findings,exists);
 }
 return {ok:findings.length===0,contextCount:contexts.length,findings:findings.sort()};
}
export function auditOwnership(root=ROOT){
 const manifestPath=path.join(root,'config/architecture-ownership-v653.json');
 if(!fs.existsSync(manifestPath))return {ok:false,findings:['OWNERSHIP_MANIFEST_MISSING']};
 let manifest;
 try{manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));}
 catch{return {ok:false,findings:['INVALID_MANIFEST_JSON']};}
 return validateOwnership(manifest,{exists:(p)=>validPath(p)&&fs.existsSync(path.join(root,p))});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=auditOwnership();
 console.log(JSON.stringify(result));
 if(!result.ok)process.exitCode=1;
}
