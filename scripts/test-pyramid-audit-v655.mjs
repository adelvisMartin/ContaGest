#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const TEST_FILE=/(?:\.test|\.spec)\.[cm]?[jt]sx?$/;
const SKIP=new Set(['.git','node_modules','dist','build','coverage','playwright-report','test-results','artifacts']);
const LEVELS=new Set(['UNIT','CONTRACT','POSTGRES_INTEGRATION','BROWSER_E2E','PROVIDER_SPECIFIC']);
const SAFE_FILE=/^(?:backend\/src|qa|tests|tools\/hipico-whatsapp-(?:web-)?bridge)\/[A-Za-z0-9_./-]+$/;
const SAFE_SCOPE=/^(?:backend\/src|qa|tests|tools\/hipico-whatsapp-(?:web-)?bridge)$/;

export function discoverTests(root,roots){
 const found=new Set();
 function visit(relative){
  const full=path.join(root,relative);
  if (!fs.existsSync(full))return;
  for(const entry of fs.readdirSync(full,{withFileTypes:true})){
   if(SKIP.has(entry.name)||entry.isSymbolicLink())continue;
   const next=path.posix.join(relative,entry.name);
   if(entry.isDirectory())visit(next);
   else if(entry.isFile()&&TEST_FILE.test(entry.name))found.add(next);
  }
 }
 for(const scope of roots) {
  if(!SAFE_SCOPE.test(scope))throw new Error('PYRAMID_SCAN_SCOPE_UNSAFE:'+scope);
  visit(scope);
 }
 return [...found].sort();
}

export function inferredTestOwner(file){
 if(file.startsWith('tools/hipico-'))return 'hipico-reliability';
 if(file.startsWith('backend/src/modules/hipico'))return 'hipico-reliability';
 if(file.startsWith('backend/src/modules/'))return 'backend-api';
 if(file.startsWith('backend/src/'))return 'backend-api';
 if(file.startsWith('qa/'))return 'qa-release';
 if(file.startsWith('tests/hipico_'))return 'hipico-reliability';
 return 'qa-release';
}
export function inferredTestLevel(file){
 if(file.startsWith('qa/')&&file.endsWith('.spec.mjs'))return 'BROWSER_E2E';
 if(file.endsWith('.integration.test.ts'))return 'POSTGRES_INTEGRATION';
 if(file.startsWith('backend/src/')&&file.endsWith('.test.ts'))return 'UNIT';
 return 'CONTRACT';
}

export function auditTestPyramid({root=ROOT,manifest=null}={}){
 const errors=[],warnings=[];
 if(manifest===null){
  try{manifest=JSON.parse(fs.readFileSync(path.join(root,'config/test-pyramid-v655.json'),'utf8'));}
  catch{return {ok:false,errors:['PYRAMID_MANIFEST_UNAVAILABLE'],warnings,tests:[],critical:[]};}
 }
 if(manifest?.schemaVersion!==655||!Array.isArray(manifest.scanRoots)||!Array.isArray(manifest.criticalBehaviors)||!Number.isInteger(manifest.baselineTestFiles))
  return {ok:false,errors:['PYRAMID_MANIFEST_INVALID'],warnings,tests:[],critical:[]};
 let files;
 try{files=discoverTests(root,manifest.scanRoots);}catch(error){
  return {ok:false,errors:['PYRAMID_DISCOVERY_FAILED:'+error.message],warnings,tests:[],critical:[]};
 }
 if(files.length<manifest.baselineTestFiles)errors.push('PYRAMID_TEST_COUNT_REGRESSION:'+files.length+':'+manifest.baselineTestFiles);
 const fileSet=new Set(files);
 const ids=new Set(),protectedFiles=new Set(),critical=[];
 for(const c of manifest.criticalBehaviors){
  if(!c||typeof c.id!=='string'||!/^[a-z0-9-]+$/.test(c.id)||ids.has(c.id)){errors.push('PYRAMID_CRITICAL_ID_INVALID_OR_DUPLICATE');continue}
  ids.add(c.id);
  if(!SAFE_FILE.test(c.file||'')||c.file.includes('..')){errors.push('PYRAMID_CRITICAL_PATH_INVALID:'+c.id);continue}
  if(protectedFiles.has(c.file))errors.push('PYRAMID_DUPLICATE_CRITICAL_FILE:'+c.file);
  protectedFiles.add(c.file);
  if(!fileSet.has(c.file))errors.push('PYRAMID_CRITICAL_BEHAVIOR_ORPHAN:'+c.id);
  if(!LEVELS.has(c.level))errors.push('PYRAMID_INVALID_LEVEL:'+c.id);
  if(!c.owner||!/^[a-z][a-z0-9-]*$/.test(c.owner))errors.push('PYRAMID_INVALID_OWNER:'+c.id);
  if(!c.environment || typeof c.environment!=='string')errors.push('PYRAMID_ENVIRONMENT_MISSING:'+c.id);
  if(!c.command || typeof c.command!=='string' || !c.command.includes(c.file.replace(/^backend\//,'')) && !c.command.includes(c.file))
   errors.push('PYRAMID_COMMAND_NOT_LINKED:'+c.id);
  if(c.evidenceStatus!=='NOT_EXECUTED')errors.push('PYRAMID_STATIC_EVIDENCE_CANNOT_CLAIM_PASS:'+c.id);
  if(c.supersededBy&&!c.consumerProof)errors.push('PYRAMID_SUPERSESSION_PROOF_REQUIRED:'+c.id);
  if(['tenant-isolation','ledger-posting','financial-reconciliation','financial-fx','financial-idempotency','fiscal-authority','payables-persistence'].includes(c.id) && c.level!=='POSTGRES_INTEGRATION')
   errors.push('PYRAMID_PROTECTED_DB_DOWNGRADE:'+c.id);
  if(['erp-main-journey','a11y-browser'].includes(c.id) && c.level!=='BROWSER_E2E')
   errors.push('PYRAMID_BROWSER_JOURNEY_DOWNGRADE:'+c.id);
  critical.push({id:c.id,file:c.file,level:c.level,owner:c.owner,command:c.command,evidenceStatus:c.evidenceStatus});
 }
 if(!critical.length)errors.push('PYRAMID_NO_CRITICAL_BEHAVIORS');
 const explicit=new Map(critical.map(c=>[c.file,c]));
 const tests=files.map(file=>{
  const assigned=explicit.get(file);
  return {file,level:assigned?.level||inferredTestLevel(file),owner:assigned?.owner||inferredTestOwner(file),classification:assigned?'EXPLICIT':'INFERRED',evidenceStatus:'NOT_EXECUTED'};
 });
 if(files.length>manifest.baselineTestFiles)warnings.push('PYRAMID_NEW_TESTS_REVIEW_OWNERS:'+String(files.length-manifest.baselineTestFiles));
 return {ok:errors.length===0,baseline:manifest.baselineTestFiles,count:files.length,explicit:critical.length,inferred:tests.length-critical.length,errors:errors.sort(),warnings,critical,tests};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const r=auditTestPyramid();
 const output=process.argv.includes('--json')?r:{ok:r.ok,baseline:r.baseline,count:r.count,explicit:r.explicit,inferred:r.inferred,errors:r.errors,warnings:r.warnings,critical:r.critical};
 console.log(JSON.stringify(output,null,2));
 if(!r.ok)process.exitCode=1;
}
