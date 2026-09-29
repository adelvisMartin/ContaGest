#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { FULL_ROUTE_BROWSER_CONTRACT } from '../qa/support/full-route-browser-contract-v640.mjs';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const MODE=String(process.argv[2]||'affected').trim();
const BROWSER=String(process.argv[3]||'chromium').trim();
const VALID_MODES=new Set(['affected','full']);
const VALID_BROWSERS=new Set(['chromium','firefox','webkit']);
const root=process.cwd();
const artifactRoot=path.join(root,'artifacts/browser-matrix');
const sharedUiPrefixes=['frontend/src/components/','frontend/src/styles/','frontend/src/design-system/','frontend/src/app.js','frontend/src/data/pageRegistry.js','qa/support/','playwright.config.mjs'];

if(!VALID_MODES.has(MODE))throw new Error(`BROWSER_MATRIX_MODE_INVALID:${MODE}`);
if(!VALID_BROWSERS.has(BROWSER))throw new Error(`BROWSER_MATRIX_BROWSER_INVALID:${BROWSER}`);

const regexEscape=(value)=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const unique=(values)=>[...new Set(values)];
const canonicalRoutes=new Set(FULL_ROUTE_BROWSER_CONTRACT.routes);

function git(args){return execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();}
function pageFileForRegistryEntry(entry){return `frontend/src/${String(entry?.[0]||'').replace(/^\.\//,'')}`;}
function routesForFiles(files){
  if(files.some((file)=>sharedUiPrefixes.some((prefix)=>file===prefix||file.startsWith(prefix))))return [...FULL_ROUTE_BROWSER_CONTRACT.routes];
  const rendererRoutes=[];
  for(const [route,entry] of Object.entries(PAGE_REGISTRY)){
    const pageFile=pageFileForRegistryEntry(entry);
    if(files.includes(pageFile))rendererRoutes.push(route);
  }
  return unique(rendererRoutes);
}
function explicitRoutes(){
  const raw=String(process.env.CG_AFFECTED_ROUTES||'').trim();
  if(!raw)return [];
  const routes=unique(raw.split(',').map((item)=>item.trim()).filter(Boolean));
  const invalid=routes.filter((route)=>!canonicalRoutes.has(route));
  if(invalid.length)throw new Error(`BROWSER_MATRIX_UNKNOWN_ROUTE:${invalid.join(',')}`);
  return routes;
}
function affectedRoutes(){
  const explicit=explicitRoutes();
  if(explicit.length)return explicit;
  const base=String(process.env.CG_BASE_REF||'main').trim()||'main';
  let files=[];
  try{files=git(['diff','--name-only',`${base}...HEAD`]).split(/\r?\n/).filter(Boolean);}
  catch(error){throw new Error(`BROWSER_MATRIX_DIFF_FAILED:${error instanceof Error?error.message:String(error)}`);}
  const routes=routesForFiles(files);
  if(routes.length)return routes;
  return FULL_ROUTE_BROWSER_CONTRACT.routes.filter((route)=>FULL_ROUTE_BROWSER_CONTRACT.routeClasses[route]?.priority==='critical');
}
function browserProjects(browser){
  if(browser==='webkit')return ['webkit-safari','webkit-iphone'];
  return [browser];
}
function routePattern(routes){return `(?:${routes.map(regexEscape).join('|')})`;}
function run(command,args,label){
  console.log(`[browser-matrix] ${label}`);
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',stdio:'inherit',shell:false,env:{...process.env,CI:'1',PLAYWRIGHT_HTML_OPEN:'never'}});
  if(result.error)return {label,status:'BLOCKED',exitCode:null,error:result.error.message};
  return {label,status:result.status===0?'PASS':'FAIL',exitCode:result.status??1};
}
function runPlaywright(specs,{project,routes,label}){
  const args=['--no-install','playwright','test',...specs,'--project='+project,'--workers=1'];
  if(routes?.length)args.push('--grep',routePattern(routes));
  return run('npx',args,label);
}

const routes=MODE==='full'?[...FULL_ROUTE_BROWSER_CONTRACT.routes]:affectedRoutes();
if(!routes.length)throw new Error('BROWSER_MATRIX_EMPTY_ROUTE_SET');
const results=[];

if(BROWSER==='chromium'&&MODE==='full'){
  results.push(run(process.execPath,['scripts/erp-browser-58x5-v251.mjs','full'],'canonical 58-route Chromium suite'));
}else{
  for(const project of browserProjects(BROWSER)){
    results.push(runPlaywright(['qa/exhaustive-route-v164.spec.mjs'],{project,routes,label:`${project} responsive/theme/deep-link ${MODE}`}));
    results.push(runPlaywright(['qa/erp-visual-overlap-v6175.spec.mjs'],{project,routes,label:`${project} overlap/zoom ${MODE}`}));
  }
}

for(const project of browserProjects(BROWSER)){
  results.push(runPlaywright(['qa/accessibility-wcag22-v99.spec.mjs'],{project,label:`${project} accessibility` }));
  results.push(runPlaywright(['qa/contrast-v15.spec.mjs'],{project,label:`${project} contrast` }));
}

const status=results.some((item)=>item.status==='FAIL')?'FAIL':results.some((item)=>item.status==='BLOCKED')?'BLOCKED':'PASS';
const manifest={
  schemaVersion:640,
  mode:MODE,
  browser:BROWSER,
  routeCount:routes.length,
  routes,
  contract:{themes:FULL_ROUTE_BROWSER_CONTRACT.themes,motion:FULL_ROUTE_BROWSER_CONTRACT.motion,zoom:FULL_ROUTE_BROWSER_CONTRACT.zoom,viewports:FULL_ROUTE_BROWSER_CONTRACT.viewports},
  results,
  status,
  generatedAt:new Date().toISOString(),
};
fs.mkdirSync(artifactRoot,{recursive:true});
const artifactPath=path.join(artifactRoot,`v640-${MODE}-${BROWSER}.json`);
fs.writeFileSync(artifactPath,`${JSON.stringify(manifest,null,2)}\n`,'utf8');
console.log(`[browser-matrix] status=${status} routes=${routes.length} artifact=${path.relative(root,artifactPath)}`);
if(status!=='PASS')process.exitCode=1;
