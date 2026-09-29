#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const candidates=[process.env.CHROMIUM_BIN,'/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].filter(Boolean);
const chromium=candidates.find((candidate)=>fs.existsSync(candidate));
if(!chromium){console.error('BLOCKED_BROWSER_RUNTIME: Chromium executable not found');process.exit(2);}

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);
  const target=path.resolve(repoRoot,`.${pathname}`);
  if(!target.startsWith(`${repoRoot}${path.sep}`)&&target!==repoRoot){response.writeHead(403);response.end('forbidden');return;}
  try{
    const stat=fs.statSync(target);
    if(!stat.isFile())throw new Error('not-file');
    response.writeHead(200,{'content-type':types[path.extname(target)]||'text/plain; charset=utf-8','cache-control':'no-store'});
    fs.createReadStream(target).pipe(response);
  }catch{response.writeHead(404);response.end('not found');}
});

await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const {port}=server.address();
const widths=[390,430,768,1366];
const themes=['light','dark','system'];
const cases=themes.flatMap((theme)=>widths.map((width)=>({theme,width,zoom:width===390?2:1,reduced:false})));
cases.push({theme:'system',width:430,zoom:1,reduced:true});
let failures=0;
try{
  for(const profile of cases){
    const query=new URLSearchParams({theme:profile.theme,zoom:String(profile.zoom)});
    const url=`http://127.0.0.1:${port}/frontend/public/ux-contract-v645.html?${query}`;
    const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',`--window-size=${profile.width},900`,'--virtual-time-budget=1600','--run-all-compositor-stages-before-draw','--dump-dom'];
    if(profile.reduced)args.push('--force-prefers-reduced-motion');
    args.push(url);
    const result=spawnSync(chromium,args,{encoding:'utf8',timeout:15000,maxBuffer:4*1024*1024});
    if(result.error){console.error(`BROWSER_EXECUTION_ERROR ${profile.theme}/${profile.width}: ${result.error.message}`);failures++;continue;}
    const html=String(result.stdout||'');
    const match=html.match(/<pre id="uxResult"[^>]*>([^<]*)<\/pre>/);
    const status=/id="uxResult"[^>]*data-status="PASS"/.test(html);
    if(!match||!status){console.error(`UX_CONTRACT_FAIL ${profile.theme}/${profile.width}/zoom${profile.zoom}${profile.reduced?'/reduced':''}`);console.error(String(result.stderr||'').slice(-1200));failures++;continue;}
    let details;
    try{details=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));}catch(error){console.error(`UX_RESULT_PARSE_FAIL ${error.message}`);failures++;continue;}
    const profilePass=details.preference===profile.theme&&details.viewport>0&&details.focusVisible&&details.escapeClosed&&details.focusRestored&&details.contrastPass&&details.zoomNoOverflow&&details.touchTarget&&(!profile.reduced||details.reducedMotion===true);
    console.log(`[ux645] theme=${profile.theme} width=${profile.width} zoom=${profile.zoom} reduced=${profile.reduced} status=${profilePass?'PASS':'FAIL'} contrast=${details.contrast} resolved=${details.resolved}`);
    if(!profilePass)failures++;
  }
}finally{
  await new Promise((resolve)=>server.close(resolve));
}
if(failures){console.error(`UX_CONTRACT_FAILURES:${failures}`);process.exit(1);}
console.log(`UX_CONTRACT_PASS profiles=${cases.length}`);
