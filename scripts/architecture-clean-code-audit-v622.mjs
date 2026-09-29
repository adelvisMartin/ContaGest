#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const POLICY_PATH='config/architecture-clean-code-authority-v1.json';
const policy=JSON.parse(fs.readFileSync(POLICY_PATH,'utf8'));
const SOURCE_EXTENSIONS=new Set(['.js','.jsx','.mjs','.cjs','.ts','.tsx']);
const IGNORE=new Set(['node_modules','.git','dist','coverage','.next','build']);
const roots=policy.sourceRoots.filter((root)=>fs.existsSync(path.join(ROOT,root)));

function rel(file){return path.relative(ROOT,file).replaceAll('\\','/');}
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    if(IGNORE.has(entry.name))return [];
    const absolute=path.join(dir,entry.name);
    if(entry.isDirectory())return walk(absolute);
    return SOURCE_EXTENSIONS.has(path.extname(entry.name))?[absolute]:[];
  });
}
const files=[...new Set(roots.flatMap((root)=>walk(path.join(ROOT,root))) )].sort();
const sourceByFile=new Map(files.map((file)=>[rel(file),fs.readFileSync(file,'utf8')]));

function ownerFor(file){
  if(file.startsWith('frontend/src/components/'))return 'frontend-ui';
  if(file.startsWith('frontend/src/pages/'))return 'frontend-route';
  if(file.startsWith('frontend/src/services/'))return 'frontend-service';
  if(file.startsWith('backend/'))return 'backend';
  if(file.startsWith('packages/'))return 'shared-package';
  return 'architecture-review';
}
function finding(type,file,evidence,severity='P2',automatic=true,symbol='file'){
  return {type,severity,file,symbol,evidence,owner:ownerFor(file),classification:automatic?'automatic':'human-review'};
}
function importTargets(file,source){
  const imports=[];
  const matcher=/(?:import\s+(?:[^'\"]+?\s+from\s+)?|export\s+[^'\"]+?\s+from\s+|import\s*\()(['\"])([^'\"]+)\1/g;
  let match;
  while((match=matcher.exec(source))){
    const spec=match[2];
    if(!spec.startsWith('.'))continue;
    const base=path.resolve(ROOT,path.dirname(file),spec);
    const candidates=[base,...SOURCE_EXTENSIONS].flatMap((candidate,index)=>index===0?[candidate]:[`${base}${candidate}`,path.join(base,`index${candidate}`)]);
    const resolved=candidates.find((candidate)=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
    if(resolved)imports.push(rel(resolved));
  }
  return [...new Set(imports)];
}
const graph=new Map([...sourceByFile.entries()].map(([file,source])=>[file,importTargets(file,source)]));
const incoming=new Map([...graph.keys()].map((file)=>[file,0]));
for(const targets of graph.values())for(const target of targets)if(incoming.has(target))incoming.set(target,incoming.get(target)+1);

const findings=[];
for(const [file,source] of sourceByFile){
  const lines=source.split(/\r?\n/).length;
  if(lines>=500)findings.push(finding('OVERSIZED_MODULE',file,`${lines} lines`,lines>=900?'P1':'P2',true));
  if(/\b(?:as\s+any|:\s*any\b)/.test(source)&&/(repository|service|route|controller|schema|prisma|database)/i.test(file)) findings.push(finding('UNSAFE_ANY_BOUNDARY',file,'critical-boundary any/unsafe cast requires review','P1',false));
  if(file.startsWith('frontend/src/pages/')&&/(PrismaClient|\bprisma\.|\$queryRaw|\$executeRaw)/.test(source)) findings.push(finding('PERSISTENCE_LEAK',file,'frontend route references persistence primitive','P0',true));
  if(file==='frontend/src/app.js'&&/AccessControlService\.canAccessRoute\s*=/.test(source)) findings.push(finding('BOUNDARY_VIOLATION',file,'composition root mutates access-control policy at runtime','P1',true,'AccessControlService.canAccessRoute'));
}

const visiting=new Set(),visited=new Set(),cycles=new Set();
function visit(node,trail=[]){
  if(visiting.has(node)){
    const index=trail.indexOf(node);const cycle=[...trail.slice(index),node];cycles.add(cycle.join(' -> '));return;
  }
  if(visited.has(node))return;
  visiting.add(node);
  for(const target of graph.get(node)||[])if(graph.has(target))visit(target,[...trail,node]);
  visiting.delete(node);visited.add(node);
}
for(const file of graph.keys())visit(file,[]);
for(const cycle of [...cycles].sort())findings.push(finding('CYCLIC_DEPENDENCY',cycle.split(' -> ')[0],cycle,'P1',true));

const legacyCandidates=['frontend/src/components/enterprise.js'];
for(const file of legacyCandidates){
  if(sourceByFile.has(file)&&incoming.get(file)===0) findings.push(finding('LEGACY_ADAPTER_ORPHAN',file,'zero static source consumers; deletion still requires characterization contract','P2',true));
}

findings.sort((a,b)=>policy.severityOrder.indexOf(a.severity)-policy.severityOrder.indexOf(b.severity)||a.type.localeCompare(b.type)||a.file.localeCompare(b.file));
const inventory=[...sourceByFile.entries()].map(([file,source])=>({file,owner:ownerFor(file),lines:source.split(/\r?\n/).length,outgoingImports:(graph.get(file)||[]).length,incomingImports:incoming.get(file)||0,exports:(source.match(/\bexport\b/g)||[]).length}));
const report={schemaVersion:1,policy:POLICY_PATH,files:inventory.length,findings,inventory};

if(process.argv.includes('--check')){
  const malformed=findings.filter((item)=>!policy.findingTypes.includes(item.type)||!item.file||!item.evidence||!item.owner||!item.severity);
  if(malformed.length){console.error(JSON.stringify({status:'FAIL',malformed},null,2));process.exit(1);}
  console.log(JSON.stringify({status:'PASS',files:inventory.length,findings:findings.length,bySeverity:Object.fromEntries(policy.severityOrder.map((severity)=>[severity,findings.filter((item)=>item.severity===severity).length]))},null,2));
}else{
  console.log(JSON.stringify(report,null,2));
}
