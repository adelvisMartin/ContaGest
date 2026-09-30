#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const API_CONTRACT_VERSION = '1.0.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND_SRC = 'backend/src';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k, stable(v)]));
  return value;
}
export function stableContractHash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
export function normalizeApiPath(base = '', child = '') {
  const joined = `${base || ''}/${child || ''}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  const normalized = joined.length > 1 ? joined.replace(/\/$/, '') : joined;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}
function routeKey(route) { return `${String(route.method).toUpperCase()} ${route.path}`; }
export function routeConflicts(routes) {
  const owners = new Map(); const conflicts = [];
  for (const route of routes) {
    const key = routeKey(route); const previous = owners.get(key);
    if (previous) conflicts.push({ key, sources:[previous, route.source || 'unknown'].sort() });
    else owners.set(key, route.source || 'unknown');
  }
  return conflicts.sort((a,b)=>a.key.localeCompare(b.key));
}
export function assertNoRouteConflicts(routes) {
  const conflict = routeConflicts(routes)[0];
  if (conflict) throw new Error(`API_CONTRACT_DUPLICATE_ROUTE:${conflict.key}:${conflict.sources.join(':')}`);
  return true;
}
function setDifference(left = [], right = []) { const r = new Set(right); return left.filter((value) => !r.has(value)); }
export function compareApiContracts(base, current) {
  const breaking = []; const additive = [];
  const baseRoutes = new Map((base?.routes || []).map((route) => [routeKey(route), route]));
  const currentRoutes = new Map((current?.routes || []).map((route) => [routeKey(route), route]));
  for (const [key, before] of baseRoutes) {
    const after = currentRoutes.get(key);
    if (!after) { breaking.push(`ROUTE_REMOVED:${key}`); continue; }
    if (!before.auth?.tenantRequired && after.auth?.tenantRequired) breaking.push(`AUTH_TIGHTENED:${key}`);
    const addedPermissions = setDifference(after.auth?.permissions || [], before.auth?.permissions || []);
    if (addedPermissions.length) breaking.push(`RBAC_TIGHTENED:${key}:${addedPermissions.join(',')}`);
    if ((before.request?.bodySchema || null) !== (after.request?.bodySchema || null)) breaking.push(`REQUEST_SCHEMA_CHANGED:${key}`);
    const removedStatuses = setDifference(before.responses?.success || [], after.responses?.success || []);
    if (removedStatuses.length) breaking.push(`SUCCESS_STATUS_REMOVED:${key}:${removedStatuses.join(',')}`);
  }
  for (const key of currentRoutes.keys()) if (!baseRoutes.has(key)) additive.push(`ROUTE_ADDED:${key}`);
  for (const key of ['successEnvelope','errorEnvelope','correlationHeader','pagination']) {
    if (JSON.stringify(base?.conventions?.[key]) !== JSON.stringify(current?.conventions?.[key])) breaking.push(`${key.replace(/[A-Z]/g,m=>`_${m}`).toUpperCase()}_CHANGED`);
  }
  const baseConflicts = new Set((base?.conflicts || []).map((item)=>item.key));
  for (const conflict of current?.conflicts || []) if (!baseConflicts.has(conflict.key)) breaking.push(`ROUTE_CONFLICT_ADDED:${conflict.key}`);
  return { breaking, additive, compatible: breaking.length === 0 };
}
export function validateEnvelopeSources({ httpSource, errorSource, securitySource }) {
  if (!/ok\s*:\s*true[\s\S]*data[\s\S]*meta/.test(httpSource)) throw new Error('API_SUCCESS_ENVELOPE_DRIFT');
  if (!/ok\s*:\s*false/.test(errorSource) || !/message/.test(errorSource) || !/requestId/.test(errorSource)) throw new Error('API_ERROR_ENVELOPE_DRIFT');
  if (!/payload\.code|code\s*:/.test(errorSource) || !/payload\.details|details\s*:/.test(errorSource)) throw new Error('API_ERROR_OPTIONAL_FIELDS_DRIFT');
  if (!/x-request-id/i.test(securitySource)) throw new Error('API_CORRELATION_HEADER_DRIFT');
  return true;
}

function normalizeSource(text) { return String(text).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim(); }
function fingerprint(text) { return `sha256:${crypto.createHash('sha256').update(normalizeSource(text)).digest('hex')}`; }
function literalNumber(source, pattern, fallback) { const match=source.match(pattern); return match?Number(match[1].replaceAll('_','')):fallback; }
function localReader(root=ROOT) {
  return {
    list(prefix) { const out=[]; const walk=(dir)=>{if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);entry.isDirectory()?walk(full):out.push(path.relative(root,full).replace(/\\/g,'/'));}};walk(path.join(root,prefix));return out; },
    read(file) { return fs.readFileSync(path.join(root,file),'utf8'); }, exists(file) { return fs.existsSync(path.join(root,file)); },
  };
}
function gitReader(ref,cwd=ROOT) {
  const files=execFileSync('git',['ls-tree','-r','--name-only',ref,'--',BACKEND_SRC],{cwd,encoding:'utf8'}).split(/\r?\n/).filter(Boolean); const set=new Set(files);
  return { list:(prefix)=>files.filter((file)=>file.startsWith(prefix)), read:(file)=>execFileSync('git',['show',`${ref}:${file}`],{cwd,encoding:'utf8',maxBuffer:16*1024*1024}), exists:(file)=>set.has(file) };
}
function resolveRelativeImport(fromFile,specifier,reader) {
  if(!specifier.startsWith('.'))return null; const base=path.posix.normalize(path.posix.join(path.posix.dirname(fromFile),specifier)).replace(/\.js$/,'');
  for(const suffix of ['.ts','/index.ts','.tsx']){const candidate=`${base}${suffix}`;if(reader.exists(candidate))return candidate;} return null;
}
function importMap(source,fromFile,reader) {
  const map=new Map(); const re=/import\s+(?:type\s+)?([^;]+?)\s+from\s+['"]([^'"]+)['"]/g;
  for(const match of source.matchAll(re)){const target=resolveRelativeImport(fromFile,match[2],reader);if(!target)continue;const clause=match[1].trim();if(clause.startsWith('{')){for(const part of clause.slice(1,-1).split(',')){const bits=part.trim().split(/\s+as\s+/);if(bits[0])map.set((bits[1]||bits[0]).trim(),target);}}else{const name=clause.split(',')[0].trim();if(name)map.set(name,target);}} return map;
}
function balancedCall(source,openIndex) {
  let depth=0,quote='',escaped=false;
  for(let i=openIndex;i<source.length;i+=1){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue;}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}if(ch==='(')depth+=1;else if(ch===')'){depth-=1;if(depth===0)return source.slice(openIndex+1,i);}} return source.slice(openIndex+1);
}
function permissionsFrom(text){return [...text.matchAll(/requirePermission\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m)=>m[1]);}
function bodySchemaFrom(text,schemaCorpusHash){const match=text.match(/validateBody\(\s*([^,)]+(?:\([^)]*\))?[^,)]*)\s*\)/);return match?`expr:${fingerprint(match[1])}:corpus:${schemaCorpusHash}`:null;}
function responseStatuses(text){const explicit=[...text.matchAll(/\.status\(\s*(\d{3})\s*\)/g)].map((m)=>Number(m[1]));const ternary=[...text.matchAll(/\?\s*(\d{3})\s*:\s*(\d{3})/g)].flatMap((m)=>[Number(m[1]),Number(m[2])]);const all=[...new Set([200,...explicit,...ternary])].sort((a,b)=>a-b);return{success:all.filter((s)=>s<400),errors:all.filter((s)=>s>=400)};}
function inheritedGuards(source,routeIndex){const prefix=source.slice(0,routeIndex);const guards={tenantRequired:false,permissions:[]};for(const match of prefix.matchAll(/\brouter\.use\s*\(/g)){const args=balancedCall(prefix,match.index+match[0].lastIndexOf('('));if(/^\s*['"`]/.test(args))continue;if(/\brequireTenant\b/.test(args))guards.tenantRequired=true;guards.permissions.push(...permissionsFrom(args));}guards.permissions=[...new Set(guards.permissions)].sort();return guards;}
function inferRoute({method,fullPath,callText,inherited,source,schemaCorpusHash}) {
  const permissions=[...new Set([...(inherited.permissions||[]),...permissionsFrom(callText)])].sort(); const tenantRequired=inherited.tenantRequired||/\brequireTenant\b/.test(callText)||permissions.length>0; const bodySchema=bodySchemaFrom(callText,schemaCorpusHash); const statuses=responseStatuses(callText); const errors=new Set(statuses.errors);
  if(tenantRequired)errors.add(401);if(permissions.length)errors.add(403);if(bodySchema)errors.add(422);for(const match of callText.matchAll(/(?:HttpError|AppError)\(\s*(\d{3})/g))errors.add(Number(match[1]));
  const envelope=/^\/(?:api\/v1\/)?health(?:\/|$)|^\/metrics$/.test(fullPath)?'probe':fullPath==='/api/v1/security/csp-report'?'telemetry':'canonical';
  return {method:method.toUpperCase(),path:fullPath,auth:{tenantRequired:Boolean(tenantRequired),permissions},request:{bodySchema},responses:{success:statuses.success,errors:[...errors].sort((a,b)=>a-b)},envelope,deprecated:/@deprecated/.test(callText),source};
}
function scanRouteCalls(source,file,basePath,schemaCorpusHash,routerNames='router|app') {
  const routes=[]; const re=new RegExp(`\\b(?:${routerNames})\\.(get|post|put|patch|delete|options|head)\\s*\\(\\s*(['\"])([^'\"]+)\\2`,'g');
  for(const match of source.matchAll(re)){const open=source.indexOf('(',match.index);routes.push(inferRoute({method:match[1],fullPath:normalizeApiPath(basePath,match[3]),callText:balancedCall(source,open),inherited:inheritedGuards(source,match.index),source:file,schemaCorpusHash}));} return routes;
}
function parseMounts(source,file,basePath,reader){const imports=importMap(source,file,reader);const mounts=[];for(const match of source.matchAll(/\b(?:app|router)\.use\s*\(\s*(['"])(\/[^'"]*)\1/g)){const args=balancedCall(source,source.indexOf('(',match.index));for(const[name,target]of imports)if(new RegExp(`\\b${name}\\b`).test(args))mounts.push({file:target,base:normalizeApiPath(basePath,match[2])});}return mounts;}
function scanManifest(reader,schemaCorpusHash,basePath='/api/v1') {
  const file='backend/src/modules/route-manifest.ts';const source=reader.read(file);const imports=importMap(source,file,reader);const routes=[];const mounts=[];
  for(const line of source.split(/\r?\n/)){if(!line.includes('{ id:')||!line.includes('path:')||!line.includes('router:'))continue;const pathMatch=line.match(/path:\s*['"]([^'"]+)['"]/);const routerMatch=line.match(/router:\s*(.+)\s*\}\s*,?\s*$/);if(!pathMatch||!routerMatch)continue;const mountPath=normalizeApiPath(basePath,pathMatch[1]);const expr=routerMatch[1].trim();const crud=expr.match(/createCrudRouter\(\s*\{([\s\S]*)\}\s*\)/);
    if(crud){const permission=(crud[1].match(/permission:\s*['"]([^'"]+)['"]/)||[])[1]||'UNRESOLVED_PERMISSION';const schemaExpr=(crud[1].match(/schema:\s*([A-Za-z0-9_]+)/)||[])[1]||'UNRESOLVED_SCHEMA';const schema=`expr:${fingerprint(schemaExpr)}:corpus:${schemaCorpusHash}`;for(const[method,child,body]of[['GET','/',null],['GET','/:id',null],['POST','/',schema],['PUT','/:id',`partial:${schema}`],['DELETE','/:id',null]])routes.push({method,path:normalizeApiPath(mountPath,child),auth:{tenantRequired:true,permissions:[permission]},request:{bodySchema:body},responses:{success:[200],errors:body?[401,403,422]:[401,403]},envelope:'canonical',deprecated:false,source:file});}
    else{const identifier=(expr.match(/^([A-Za-z_$][\w$]*)/)||[])[1];const target=identifier&&imports.get(identifier);if(target)mounts.push({file:target,base:mountPath});}
  }return{routes,mounts};
}
function scanRouterTree(reader,startFile,basePath,schemaCorpusHash,seen,routes){const key=`${startFile}@${basePath}`;if(seen.has(key)||!reader.exists(startFile))return;seen.add(key);const source=reader.read(startFile);routes.push(...scanRouteCalls(source,startFile,basePath,schemaCorpusHash));if(startFile.endsWith('/modules/index.ts')){const manifest=scanManifest(reader,schemaCorpusHash,basePath);routes.push(...manifest.routes);for(const mount of manifest.mounts)scanRouterTree(reader,mount.file,mount.base,schemaCorpusHash,seen,routes);}for(const mount of parseMounts(source,startFile,basePath,reader))scanRouterTree(reader,mount.file,mount.base,schemaCorpusHash,seen,routes);}
function schemaCorpus(reader){const files=reader.list(BACKEND_SRC).filter((file)=>/schema/i.test(path.posix.basename(file))&&/\.(ts|tsx)$/.test(file)).sort();return fingerprint(files.map((file)=>`${file}\n${reader.read(file)}`).join('\n---\n'));}
function contractConventions(reader){const httpSource=reader.read('backend/src/shared/http.ts');const errorSource=reader.read('backend/src/shared/middleware/error.ts');const securitySource=reader.read('backend/src/shared/middleware/security.ts');validateEnvelopeSources({httpSource,errorSource,securitySource});const crud=reader.read('backend/src/modules/crud.factory.ts');return{successEnvelope:{required:['ok','data','meta']},errorEnvelope:{required:['ok','message','requestId'],optional:['code','details']},correlationHeader:'x-request-id',pagination:{style:'take-skip',takeDefault:literalNumber(crud,/DEFAULT_LIST_TAKE\s*=\s*([\d_]+)/,100),takeMax:literalNumber(crud,/MAX_LIST_TAKE\s*=\s*([\d_]+)/,500),skipMax:literalNumber(crud,/MAX_LIST_SKIP\s*=\s*([\d_]+)/,1000000),headers:['X-CG-Page-Take','X-CG-Page-Skip'],filter:'q',sort:'createdAt desc,id desc'},versioning:{strategy:'contract-semver; business routes use /api/v1; probes remain stable aliases',contractVersion:API_CONTRACT_VERSION}};}
export function buildApiContract(reader=localReader()) {
  const corpus=schemaCorpus(reader);const routes=[];const seen=new Set();const appFile='backend/src/app.ts';const app=reader.read(appFile);routes.push(...scanRouteCalls(app,appFile,'',corpus,'app'));const imports=importMap(app,appFile,reader);
  for(const match of app.matchAll(/\bapp\.use\s*\(\s*(['"])(\/[^'"]*)\1/g)){const args=balancedCall(app,app.indexOf('(',match.index));const base=normalizeApiPath('',match[2]);for(const[name,target]of imports)if(new RegExp(`\\b${name}\\b`).test(args))scanRouterTree(reader,target,base,corpus,seen,routes);}
  const healthTarget=imports.get('registerHealthRoutes');if(healthTarget)routes.push(...scanRouteCalls(reader.read(healthTarget),healthTarget,'',corpus,'app'));const apiTarget=imports.get('apiRoutes');if(apiTarget&&!seen.has(`${apiTarget}@/api/v1`))scanRouterTree(reader,apiTarget,'/api/v1',corpus,seen,routes);
  const sorted=routes.sort((a,b)=>routeKey(a).localeCompare(routeKey(b))||a.source.localeCompare(b.source));const manifest={schemaVersion:652,apiVersion:API_CONTRACT_VERSION,conventions:contractConventions(reader),routes:sorted,conflicts:routeConflicts(sorted)};return{...manifest,manifestSha256:stableContractHash(manifest)};
}
function parseArgs(argv){const out={base:'main',out:'',print:false,check:false};for(let i=0;i<argv.length;i++){const arg=argv[i];if(arg==='--base')out.base=argv[++i]||'main';else if(arg.startsWith('--base='))out.base=arg.slice(7);else if(arg==='--out')out.out=argv[++i]||'';else if(arg.startsWith('--out='))out.out=arg.slice(6);else if(arg==='--print')out.print=true;else if(arg==='--check')out.check=true;else throw new Error(`API_CONTRACT_ARGUMENT_UNKNOWN:${arg}`);}return out;}
function cli(){const args=parseArgs(process.argv.slice(2));const current=buildApiContract(localReader());let compatibility={breaking:[],additive:[],compatible:true};let baseSha=null;if(args.check){baseSha=execFileSync('git',['merge-base',args.base,'HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();const base=buildApiContract(gitReader(baseSha));compatibility=compareApiContracts(base,current);if(compatibility.breaking.length)throw new Error(`API_CONTRACT_BREAKING_CHANGE:${compatibility.breaking.join('|')}`);}const evidence={ticket:652,candidateSha:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),baseSha,manifest:current,compatibility};if(args.out){const target=path.resolve(ROOT,args.out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,`${JSON.stringify(evidence,null,2)}\n`);}if(args.print||!args.out)process.stdout.write(`${JSON.stringify(evidence,null,2)}\n`);}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{cli();}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}}
