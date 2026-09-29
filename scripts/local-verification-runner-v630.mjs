#!/usr/bin/env node
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const VALID_STATUSES = new Set(['PASS','FAIL','BLOCKED','NOT_EXECUTED','NOT_APPLICABLE']);
const DB_PROFILES = new Set(['database','financial','full']);
const UI_PROFILES = new Set(['ui','ui-routes','full']);

const gate=(id,command,{required=true}={})=>Object.freeze({id,command,required});

export const PROFILE_GATES = Object.freeze({
  backend:Object.freeze([
    gate('backend-typecheck','npm run typecheck'),
    gate('backend-tests','npm test'),
    gate('backend-build','npm run build:backend'),
  ]),
  frontend:Object.freeze([
    gate('frontend-build','npm run build:frontend'),
    gate('frontend-contracts','npm run test:visual'),
  ]),
  database:Object.freeze([
    gate('database-typecheck','npm run typecheck'),
    gate('database-canonical-gate','node scripts/canonical-database-gate-v632.mjs'),
  ]),
  financial:Object.freeze([
    gate('financial-typecheck','npm run typecheck'),
    gate('financial-canonical-database-gate','node scripts/canonical-database-gate-v632.mjs'),
    gate('financial-decimal','npm run test:financial:decimal'),
    gate('financial-ledger-unit','npm run test:ledger:unit'),
    gate('financial-domain-real','npm run test:backend:financial:real'),
    gate('financial-reconciliation-real','npm run test:backend:financial:reconciliation:real'),
    gate('financial-fx-real','npm run test:backend:financial:fx:real'),
    gate('financial-fiscal-authority-real','npm run test:backend:fiscal:authority:real'),
    gate('financial-idempotency-real','npm run test:backend:idempotency:real'),
    gate('financial-build','npm run build:backend'),
  ]),
  ui:Object.freeze([
    gate('ui-frontend-build','npm run build:frontend'),
    gate('ui-theme-state-a11y-contract','node --test tests/theme_state_accessibility_issue_645.test.mjs'),
    gate('ui-theme-state-a11y-browser','node scripts/ux-contract-browser-v645.mjs'),
    gate('ui-authoritative','npm run qa:ui:58'),
    gate('ui-browser-a11y','npm run test:browser:a11y'),
    gate('ui-browser-contrast','npm run test:browser:contrast'),
    gate('ui-browser-functional','npm run test:browser:functional'),
  ]),
  'ui-routes':Object.freeze([
    gate('ui-routes-frontend-build','npm run build:frontend'),
    gate('ui-routes-browser-matrix','npm run qa:browser:routes:full'),
  ]),
});

function dedupeGates(gates){
  const seen=new Set();
  return gates.filter((item)=>{if(seen.has(item.command))return false;seen.add(item.command);return true;});
}

export function buildProfilePlan(profile){
  if(profile==='full') return dedupeGates([
    ...PROFILE_GATES.backend,...PROFILE_GATES.frontend,...PROFILE_GATES.database,...PROFILE_GATES.financial,...PROFILE_GATES.ui,...PROFILE_GATES['ui-routes'],
  ]);
  const plan=PROFILE_GATES[profile];
  if(!plan) throw new Error(`VERIFY_PROFILE_UNKNOWN:${profile}`);
  return [...plan];
}

export function profilesForRouterDomains(domainIds=[]){
  const out=new Set();
  for(const id of domainIds){
    if(['database-migration','data-lifecycle'].includes(id)) out.add('database');
    if(id==='accounting-financial') out.add('financial');
    if(['frontend-shell-design','vertical-runtime','pwa-offline'].includes(id)) out.add('ui');
    if(['identity-tenant-rbac','api-governance','integrations','observability','privacy-sensitive','health-sensitive','hipico-automation'].includes(id)) out.add('backend');
    if(['release-infrastructure','agent-system','supply-chain'].includes(id)) out.add('backend');
  }
  return [...out];
}

function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim();}

export function resolveGitContext({cwd=process.cwd(),expectedSha='',baseRef='main'}={}){
  const candidateSha=git(cwd,['rev-parse','HEAD']);
  if(expectedSha && candidateSha!==expectedSha) throw new Error(`EVIDENCE_SHA_MISMATCH:expected=${expectedSha}:actual=${candidateSha}`);
  const dirty=git(cwd,['status','--porcelain']);
  if(dirty) throw new Error('EVIDENCE_WORKTREE_DIRTY');
  let baseSha;
  try{baseSha=git(cwd,['merge-base',baseRef,'HEAD']);}
  catch{baseSha=git(cwd,['rev-parse',baseRef]);}
  return {candidateSha,baseRef,baseSha};
}

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='manifestSha256').sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
  return value;
}
export function computeManifestHash(value){return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');}

export function sanitizeEnvironmentValue(value){
  const text=String(value??'');
  if(/bearer\s+\S+/i.test(text)||/eyJ[A-Za-z0-9_-]{8,}\./.test(text))return '[REDACTED]';
  try{
    const url=new URL(text);
    if(url.password||url.username){url.username='';url.password='';return url.toString().replace('://@','://');}
  }catch{}
  return text;
}

function splitCommand(command){
  const parts=command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)||[];
  return parts.map((part)=>part.replace(/^['"]|['"]$/g,''));
}

async function defaultExecute(gateItem,{cwd,env,logDir}){
  const startedAt=new Date();
  const [command,...args]=splitCommand(gateItem.command);
  const executable=process.platform==='win32'&&command==='npm'?'npm.cmd':command;
  const result=spawnSync(executable,args,{cwd,env,encoding:'utf8',shell:false});
  const endedAt=new Date();
  const logPath=path.join(logDir,`${gateItem.id}.log`);
  const output=[result.stdout||'',result.stderr||'',result.error?`${result.error.message}\n`:'' ].join('');
  await writeFile(logPath,output,'utf8');
  if(output)process.stdout.write(output);
  if(result.error)return {status:'BLOCKED',exitCode:null,error:`MISSING_PREREQUISITE:${result.error.message}`,startedAt:startedAt.toISOString(),endedAt:endedAt.toISOString(),durationMs:endedAt-startedAt,logPath};
  const exitCode=result.status??1;
  return {status:exitCode===0?'PASS':'FAIL',exitCode,startedAt:startedAt.toISOString(),endedAt:endedAt.toISOString(),durationMs:endedAt-startedAt,logPath};
}

export async function runPlan({plan,execute,remote={ci:'NOT_EXECUTED',deploy:'NOT_EXECUTED'},context={}}){
  const gates=[];
  let profileStatus='PASS';
  let profileExit=0;
  for(const item of plan){
    const result=await execute(item,context);
    if(!VALID_STATUSES.has(result.status))throw new Error(`VERIFY_STATUS_INVALID:${result.status}`);
    gates.push({...item,...result});
    if(item.required&&(result.status==='FAIL'||result.status==='BLOCKED'||result.status==='NOT_EXECUTED')){
      profileStatus=result.status==='FAIL'?'FAIL':'BLOCKED';
      profileExit=result.exitCode||1;
      break;
    }
  }
  return {status:profileStatus,exitCode:profileExit,gates,remote};
}

function isLoopback(hostname){return ['localhost','127.0.0.1','::1','[::1]'].includes(hostname);}
function quoteIdentifier(value){return `"${String(value).replaceAll('"','""')}"`;}

export function ephemeralDatabaseConfig({candidateSha,env=process.env}={}){
  const raw=String(env.LOCAL_VERIFY_DATABASE_ADMIN_URL||env.DATABASE_URL||'').trim();
  if(!raw)throw new Error('LOCAL_POSTGRES_BLOCKED:MISSING_ADMIN_URL');
  const admin=new URL(raw);
  if(!['postgres:','postgresql:'].includes(admin.protocol))throw new Error('LOCAL_POSTGRES_BLOCKED:INVALID_PROTOCOL');
  if(!isLoopback(admin.hostname))throw new Error(`LOCAL_POSTGRES_BLOCKED:NON_LOCAL_HOST=${admin.hostname}`);
  admin.pathname='/postgres';admin.search='';
  const suffix=`${candidateSha.slice(0,8)}_${process.pid}_${Date.now()}`.replace(/[^a-zA-Z0-9_]/g,'');
  const databaseName=`contagest_verify_${suffix}_e2e`.toLowerCase();
  const databaseUrl=new URL(admin.toString());databaseUrl.pathname=`/${databaseName}`;
  return {adminUrl:admin.toString(),databaseName,databaseUrl:databaseUrl.toString()};
}

function runPsql(adminUrl,sql,{cwd}){
  const executable=process.platform==='win32'?'psql.exe':'psql';
  const result=spawnSync(executable,['--dbname',adminUrl,'-v','ON_ERROR_STOP=1','-c',sql],{cwd,encoding:'utf8',shell:false});
  if(result.error)throw new Error(`LOCAL_POSTGRES_BLOCKED:${result.error.message}`);
  if(result.status!==0)throw new Error(`LOCAL_POSTGRES_FAILED:exit=${result.status}:${result.stderr||result.stdout}`);
}

export async function withEphemeralDatabase({candidateSha,cwd=process.cwd(),env=process.env},fn){
  const config=ephemeralDatabaseConfig({candidateSha,env});
  runPsql(config.adminUrl,`CREATE DATABASE ${quoteIdentifier(config.databaseName)}`,{cwd});
  try{return await fn({...env,DATABASE_URL:config.databaseUrl},config);}
  finally{runPsql(config.adminUrl,`DROP DATABASE IF EXISTS ${quoteIdentifier(config.databaseName)} WITH (FORCE)`,{cwd});}
}

function commandVersion(command,args,{cwd}){
  const executable=process.platform==='win32'&&command==='npm'?'npm.cmd':command;
  const result=spawnSync(executable,args,{cwd,encoding:'utf8',shell:false});
  return result.status===0?String(result.stdout||result.stderr).trim():'UNAVAILABLE';
}

function parseArgs(argv){
  const out={profile:'',base:'main',expectedSha:'',dryRun:false,remoteCi:'NOT_EXECUTED',remoteDeploy:'NOT_EXECUTED'};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--profile')out.profile=argv[++i]||'';
    else if(arg.startsWith('--profile='))out.profile=arg.slice(10);
    else if(arg==='--base')out.base=argv[++i]||'main';
    else if(arg.startsWith('--base='))out.base=arg.slice(7);
    else if(arg==='--expected-sha')out.expectedSha=argv[++i]||'';
    else if(arg.startsWith('--expected-sha='))out.expectedSha=arg.slice(15);
    else if(arg==='--dry-run')out.dryRun=true;
    else if(arg.startsWith('--remote-ci='))out.remoteCi=arg.slice(12);
    else if(arg.startsWith('--remote-deploy='))out.remoteDeploy=arg.slice(16);
    else throw new Error(`VERIFY_ARGUMENT_UNKNOWN:${arg}`);
  }
  if(!out.profile)throw new Error('VERIFY_PROFILE_REQUIRED');
  return out;
}

function changedPlan({cwd,baseRef}){
  const files=git(cwd,['diff','--name-only',`${baseRef}...HEAD`]).split(/\r?\n/).filter(Boolean);
  const router=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','--silent','agent:gates','--','--base',baseRef],{cwd,encoding:'utf8',shell:false});
  if(router.error||router.status!==0)throw new Error(`LOCAL_GATE_FAILED:agent:gates:${router.error?.message||router.stderr}`);
  const parsed=JSON.parse(router.stdout);
  const profiles=profilesForRouterDomains((parsed.domains||[]).map((item)=>item.id));
  if(files.some((file)=>file.startsWith('frontend/'))&&!profiles.includes('frontend'))profiles.push('frontend');
  if(files.some((file)=>file.startsWith('backend/'))&&!profiles.includes('backend'))profiles.push('backend');
  if(!profiles.length)profiles.push('backend');
  return {files,profiles,plan:dedupeGates(profiles.flatMap((profile)=>buildProfilePlan(profile)))};
}

async function cli(){
  const args=parseArgs(process.argv.slice(2));
  const cwd=process.cwd();
  const gitContext=resolveGitContext({cwd,expectedSha:args.expectedSha,baseRef:args.base});
  const changed=args.profile==='changed'?changedPlan({cwd,baseRef:args.base}):null;
  const plan=changed?.plan||buildProfilePlan(args.profile);
  const metadata={
    schemaVersion:630,
    candidateSha:gitContext.candidateSha,
    baseSha:gitContext.baseSha,
    baseRef:gitContext.baseRef,
    profile:args.profile,
    changedFiles:changed?.files||[],
    derivedProfiles:changed?.profiles||[],
    platform:{os:`${os.platform()} ${os.release()}`,arch:os.arch(),node:process.version,npm:commandVersion('npm',['--version'],{cwd}),postgres:DB_PROFILES.has(args.profile)?commandVersion('psql',['--version'],{cwd}):'NOT_APPLICABLE',playwright:UI_PROFILES.has(args.profile)?commandVersion('npx',['playwright','--version'],{cwd}):'NOT_APPLICABLE'},
    remote:{ci:args.remoteCi,deploy:args.remoteDeploy},
  };
  if(args.dryRun){
    console.log(JSON.stringify({...metadata,status:'NOT_EXECUTED',gates:plan.map((item)=>({...item,status:'NOT_EXECUTED'}))},null,2));
    return;
  }
  const artifactRoot=path.join(cwd,'artifacts','local-verification',gitContext.candidateSha,args.profile);
  const logDir=path.join(artifactRoot,'logs');await mkdir(logDir,{recursive:true});
  const execute=(item,ctx)=>defaultExecute(item,{cwd,env:ctx.env||process.env,logDir});
  const run=async(env)=>runPlan({plan,execute,remote:metadata.remote,context:{env}});
  let result;
  if(DB_PROFILES.has(args.profile)||(args.profile==='changed'&&changed?.profiles.some((p)=>DB_PROFILES.has(p)))){
    result=await withEphemeralDatabase({candidateSha:gitContext.candidateSha,cwd,env:process.env},async(env,db)=>{
      metadata.postgres={databaseName:db.databaseName,adminUrl:sanitizeEnvironmentValue(db.adminUrl)};
      return run(env);
    });
  }else result=await run(process.env);
  const manifest={...metadata,status:result.status,exitCode:result.exitCode,gates:result.gates,finishedAt:new Date().toISOString()};
  manifest.manifestSha256=computeManifestHash(manifest);
  await writeFile(path.join(artifactRoot,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`,'utf8');
  console.log(JSON.stringify({status:manifest.status,manifest:path.relative(cwd,path.join(artifactRoot,'manifest.json')),manifestSha256:manifest.manifestSha256},null,2));
  if(result.status!=='PASS')process.exitCode=result.exitCode||1;
}

const invokedAsScript=process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href;
if(invokedAsScript)cli().catch((error)=>{console.error('[verify-local-v630]',error instanceof Error?error.message:String(error));process.exitCode=1;});
