import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';
import {
  buildErpE2EMatrixV155,
  caseIdentityV155,
  ERP_E2E_ROLES_V155,
  ERP_E2E_VIEWPORTS_V155
} from './support/erp-e2e-matrix-v155.mjs';
import { fixtureForRequest, fixtureMetadata } from './support/erp-system-fixtures-v155.mjs';

test.setTimeout(240_000);

const role=String(process.env.QA_ROLE||'admin');
const viewportName=String(process.env.QA_VIEWPORT||'phone-390');
const candidateSha=String(process.env.CANDIDATE_SHA||'').trim();
if(!ERP_E2E_ROLES_V155.includes(role))throw new Error(`QA_ROLE_INVALID:${role}`);
const viewport=ERP_E2E_VIEWPORTS_V155.find((item)=>item.name===viewportName);
if(!viewport)throw new Error(`QA_VIEWPORT_INVALID:${viewportName}`);
if(!/^[a-f0-9]{40}$/i.test(candidateSha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');

const ROLE_USER={admin:'user-admin',operator:'user-gerente','read-only':'user-readonly-demo'};
const rbac=AccessControlService.defaultState();
rbac.activeUserId=ROLE_USER[role];
const activeUser=rbac.users.find((item)=>item.id===rbac.activeUserId);
const activeRole=rbac.roles.find((item)=>item.id===activeUser?.roleId);
if(!activeUser||!activeRole)throw new Error(`QA_RBAC_PROFILE_NOT_FOUND:${role}`);
const session={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant-a',
  tenant:{id:'qa-tenant-a',name:'ContaGest QA A',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:activeUser.id,name:activeUser.fullName,fullName:activeUser.fullName,email:`${role}@example.test`,role:role==='admin'?'admin':'staff',permissions:[...activeRole.permissions]},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};
const stateSeed={rbac,settings:{theme:'light',lang:'es',businessMode:'admin',companyName:'ContaGest QA A',companyRif:'J-00000000-0'}};
const canAccess=(route)=>AccessControlService.canAccessRoute({rbac},route);
const artifactRoot=path.resolve('artifacts/qa/erp-v155-shards',candidateSha,`${role}__${viewportName}`);
const resultFile=path.join(artifactRoot,'results.jsonl');
fs.mkdirSync(artifactRoot,{recursive:true});
fs.writeFileSync(path.join(artifactRoot,'meta.json'),JSON.stringify({candidateSha,role,viewport,rbacRole:activeRole.id,fixture:fixtureMetadata(),startedAt:new Date().toISOString()},null,2)+'\n');

const selected=buildErpE2EMatrixV155().filter((item)=>item.role===role&&item.viewport===viewportName);
const groups=new Map();
for(const item of selected){const key=`${item.route}|${item.criticalFlow}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}

function safeSlug(value){return String(value).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'case';}
function appendResult(row){fs.appendFileSync(resultFile,JSON.stringify(row)+'\n');}
function expectedNetworkNoise(text){return /Failed to load resource|net::ERR_|ERR_INTERNET_DISCONNECTED|QA_SYNTHETIC_ERROR|403 \(Forbidden\)|500 \(Internal Server Error\)/i.test(text);}

async function installHarness(page,stateRef){
  await page.addInitScript(({auth,store})=>{
    localStorage.setItem('contagest_ve_enterprise_v7_state',JSON.stringify(store));
    localStorage.setItem('contagest_auth_session',JSON.stringify(auth));
    window.confirm=()=>true;window.open=()=>null;
  },{auth:session,store:stateSeed});
  await page.route('**/api/**',async(route)=>{
    const request=route.request();const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:session})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa-signed-token-12345678901234567890',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    if(stateRef.value==='offline')return route.abort('internetdisconnected');
    let postBody=null;try{postBody=request.postDataJSON();}catch{}
    const fixture=fixtureForRequest({url:request.url(),method:request.method(),state:stateRef.value,body:postBody});
    if(fixture.delayMs)await new Promise((resolve)=>setTimeout(resolve,fixture.delayMs));
    return route.fulfill({status:fixture.status,contentType:'application/json',body:JSON.stringify(fixture.body)});
  });
}

async function openRoute(page,item){
  await page.setViewportSize({width:item.width,height:item.height});
  await page.goto(`/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector(item.route==='login'?'.login-shell':'#app',{state:'attached',timeout:20_000});
  await page.waitForTimeout(item.route==='veterinaria'?420:160);
  return{requested:item.route,actual:await page.locator('body').getAttribute('data-route'),root:item.route==='login'?'.login-shell':'#pages'};
}

async function exercise(page,item){
  const result={interactions:[],warnings:[]};const selector=item.route==='login'?'.login-shell':'#pages';const root=page.locator(selector);
  await root.evaluate((node)=>node.scrollTo?.(0,node.scrollHeight)).catch(()=>{});await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(20);await page.evaluate(()=>window.scrollTo(0,0));result.interactions.push('scroll-cycle');
  await page.keyboard.press('Tab').catch(()=>{});const focused=await page.evaluate(()=>document.activeElement&&document.activeElement!==document.body&&document.activeElement!==document.documentElement);if(focused)result.interactions.push('keyboard-focus');else result.warnings.push('NO_KEYBOARD_FOCUS_TARGET');
  const details=page.locator(`${selector} details:visible`).first();if(await details.count()){await details.evaluate((node)=>{node.open=true;});result.interactions.push('details-open');}
  const tab=page.locator('[role="tab"]:visible,.cgx-tabs button:visible,.page-tabs button:visible,.cg-vertical-tabs button:visible').first();if(await tab.count()){await tab.click({timeout:2500}).catch(()=>{});result.interactions.push('tab-click');}
  if(/create|update|post|calculate|generate|reconcile|persist|configuration|primary-workflow|record/i.test(item.criticalFlow)){
    const form=page.locator(`${selector} form:visible`).first();
    if(await form.count()){
      const textInputs=form.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]),textarea:not([disabled])');const n=Math.min(await textInputs.count(),5);
      for(let i=0;i<n;i+=1){const input=textInputs.nth(i);const type=(await input.getAttribute('type'))||'text';const name=(await input.getAttribute('name'))||'';let value='QA 123';if(type==='email')value='qa-flow@example.test';else if(type==='number')value='123';else if(type==='date')value='2026-09-03';else if(type==='time')value='10:30';else if(/rif/i.test(name))value='J-00000000-0';else if(/password/i.test(name))value='Qa-Synthetic-Password-123!';await input.fill(value).catch(()=>{});}
      const selects=form.locator('select:not([disabled])');for(let i=0;i<Math.min(await selects.count(),3);i+=1){const select=selects.nth(i);const options=select.locator('option:not([disabled])');if(await options.count()>1){const value=await options.nth(1).getAttribute('value');if(value)await select.selectOption(value).catch(()=>{});}}
      const submit=form.locator('button[type="submit"]:not([disabled]),input[type="submit"]:not([disabled])').first();if(await submit.count()){await submit.click({timeout:3000}).catch(()=>{});result.interactions.push('form-submit-mocked');}else result.interactions.push('form-exercised');
    }else result.warnings.push('NO_FORM_FOR_DECLARED_FLOW');
  }
  if(/cancel|reversal|reverse|reject|deprecate/i.test(item.criticalFlow)){const candidate=page.getByRole('button',{name:/revers|anular|cancel|rechaz|deprecar|deshacer/i}).first();if(await candidate.count()){await candidate.click({timeout:2500}).catch(()=>{});result.interactions.push('reversal-or-cancel-click');}else result.warnings.push('NO_REVERSAL_CONTROL_FOUND');}
  if(/navigation/i.test(item.criticalFlow)){const targets=page.locator('[data-route]:visible');let clicked=false;for(let i=0;i<Math.min(await targets.count(),12);i+=1){const candidate=targets.nth(i);if((await candidate.getAttribute('data-route'))!==item.route){await candidate.click({timeout:2500}).catch(()=>{});clicked=true;break;}}if(clicked){await page.goBack({waitUntil:'domcontentloaded'}).catch(()=>{});result.interactions.push('cross-route-back');}else result.warnings.push('NO_CROSS_ROUTE_TARGET');}
  return result;
}

function auditDom(){
  const root=document.querySelector('#pages')||document.querySelector('.login-shell');const findings=[];
  const visible=(node)=>{if(!(node instanceof HTMLElement))return false;const s=getComputedStyle(node),r=node.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>1&&r.height>1;};
  const label=(node)=>String(node.getAttribute?.('aria-label')||node.textContent||node.getAttribute?.('placeholder')||node.id||node.className||node.tagName||'').replace(/\s+/g,' ').trim().slice(0,100);
  if(!root||!String(root.textContent||'').trim())findings.push({kind:'EMPTY_VIEW'});if(document.documentElement.scrollWidth>innerWidth+2)findings.push({kind:'DOCUMENT_HORIZONTAL_OVERFLOW',scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth});
  const ids=[...document.querySelectorAll('[id]')].map((node)=>node.id).filter(Boolean);const dup=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];if(dup.length)findings.push({kind:'DUPLICATE_IDS',ids:dup.slice(0,10)});
  const scrollOwners='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.MuiTabs-scroller,.cg-kanban,.cgx-tabs,.page-tabs,.cg-vertical-tabs,.overflow-x-auto';
  const out=[...root.querySelectorAll('*')].filter(visible).filter((node)=>!node.closest(scrollOwners)).filter((node)=>{const r=node.getBoundingClientRect();return r.left<-2||r.right>innerWidth+2;}).slice(0,10).map((node)=>({target:label(node),left:Math.round(node.getBoundingClientRect().left),right:Math.round(node.getBoundingClientRect().right)}));if(out.length)findings.push({kind:'VIEWPORT_OVERFLOW',items:out});
  const buttons=[...root.querySelectorAll('button,[role="button"],summary,a')].filter(visible);
  if(innerWidth<=430){
    const small=buttons.filter((node)=>{const r=node.getBoundingClientRect();return r.height<43.5&&(r.width<43.5||!String(node.textContent||'').trim());}).slice(0,10).map((node)=>({target:label(node),width:Math.round(node.getBoundingClientRect().width),height:Math.round(node.getBoundingClientRect().height)}));if(small.length)findings.push({kind:'TOUCH_TARGET_UNDERSIZED',items:small});
    const zoomRisk=[...root.querySelectorAll('input,select,textarea')].filter(visible).filter((node)=>parseFloat(getComputedStyle(node).fontSize)<16).slice(0,10).map((node)=>({target:label(node),fontSize:getComputedStyle(node).fontSize}));if(zoomRisk.length)findings.push({kind:'MOBILE_INPUT_FONT_LT_16',items:zoomRisk});
  }
  const unlabeled=buttons.filter((node)=>!String(node.getAttribute('aria-label')||node.getAttribute('title')||node.textContent||'').trim()).slice(0,10).map(label);if(unlabeled.length)findings.push({kind:'UNLABELED_INTERACTIVE',items:unlabeled});
  const clipped=[...root.querySelectorAll('h1,h2,h3,h4,p,label,button,summary,.cgx-btn,.btn')].filter(visible).filter((node)=>!node.closest(scrollOwners)).filter((node)=>{const s=getComputedStyle(node);return s.overflow==='hidden'&&(node.scrollWidth>node.clientWidth+3||node.scrollHeight>node.clientHeight+3);}).slice(0,10).map(label);if(clipped.length)findings.push({kind:'CLIPPED_OPERATIONAL_TEXT',items:clipped});
  const occluded=buttons.filter((node)=>{const r=node.getBoundingClientRect();const x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2));const y=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2));if(x<0||y<0||x>=innerWidth||y>=innerHeight)return false;const top=document.elementFromPoint(x,y);return Boolean(top&&top!==node&&!node.contains(top)&&!top.contains(node));}).slice(0,10).map((node)=>({target:label(node)}));if(occluded.length)findings.push({kind:'INTERACTIVE_OCCLUDED',items:occluded});
  const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(visible);for(const dialog of dialogs){const r=dialog.getBoundingClientRect();if(r.left<-2||r.right>innerWidth+2||r.top<-2||r.bottom>innerHeight+2)findings.push({kind:'DIALOG_OUTSIDE_VIEWPORT',target:label(dialog)});if(dialog.scrollWidth>dialog.clientWidth+3)findings.push({kind:'DIALOG_HORIZONTAL_OVERFLOW',target:label(dialog)});}
  return findings;
}

async function auditZoom200(page){
  await page.evaluate(()=>{document.documentElement.style.zoom='2';});
  await page.waitForTimeout(40);
  const findings=(await page.evaluate(auditDom)).map((item)=>({...item,mode:'zoom-200'}));
  await page.evaluate(()=>{document.documentElement.style.zoom='';});
  await page.waitForTimeout(20);
  return findings;
}

async function auditThemeModes(page,item){
  if(item.route==='login')return{findings:[],interactions:['theme-skip-login'],warnings:[]};
  const findings=[];const interactions=[];const warnings=[];
  const select=page.locator('#userMenuTheme');
  if(!(await select.count()))return{findings,interactions,warnings:['THEME_CONTROL_NOT_FOUND']};
  for(const mode of ['light','dark']){
    await select.selectOption(mode).catch(()=>{});
    await page.waitForTimeout(40);
    const applied=await page.evaluate((expected)=>document.documentElement.dataset.theme===expected,mode);
    if(!applied)findings.push({kind:'THEME_MODE_NOT_APPLIED',mode});
    findings.push(...(await page.evaluate(auditDom)).map((item)=>({...item,mode:`theme-${mode}`})));
    interactions.push(`theme-${mode}`);
  }
  return{findings,interactions,warnings};
}

for(const [groupKey,cases] of groups){
  const[routeName,flowName]=groupKey.split('|');
  test(`${role} · ${viewportName} · ${routeName} · ${flowName}`,async({page})=>{
    const stateRef={value:'baseline'};await installHarness(page,stateRef);const groupFailures=[];const allowed=canAccess(routeName);
    for(const item of cases){
      stateRef.value=item.state;const pageErrors=[];const consoleErrors=[];const onPageError=(error)=>pageErrors.push(String(error?.message||error));const onConsole=(message)=>{if(message.type()==='error'&&!expectedNetworkNoise(message.text()))consoleErrors.push(message.text());};page.on('pageerror',onPageError);page.on('console',onConsole);
      const startedAt=new Date().toISOString();let status='PASS',findings=[],interactions=[],warnings=[];const evidence=[];
      try{
        const navigation=await openRoute(page,item);
        if(!allowed){
          if(navigation.actual===item.route)findings.push({kind:'RBAC_ROUTE_SHOULD_BE_DENIED',role,rbacRole:activeRole.id});else interactions.push(`rbac-denial:${navigation.actual||'unknown'}`);
          const bodyText=await page.locator('body').innerText().catch(()=>'');if(/QA-LARGO-ÁÉÍÓÚ-漢字|Cliente QA|Producto QA/.test(bodyText)&&navigation.actual===item.route)findings.push({kind:'RBAC_DENIED_DATA_LEAK'});
        }else{
          if(navigation.actual!==item.route)findings.push({kind:'AUTHORIZED_ROUTE_NOT_RENDERED',expected:item.route,actual:navigation.actual});
          if(item.state==='loading'){const loadingVisible=await page.locator('[aria-busy="true"]:visible,.loading:visible,.spinner:visible,.skeleton:visible,[data-loading="true"]:visible').count();if(!loadingVisible)warnings.push('LOADING_STATE_NOT_VISUALLY_OBSERVED');await page.waitForTimeout(800);}
          if(item.state==='error'||item.state==='offline'){const recovery=page.getByRole('button',{name:/reintentar|recargar|actualizar|retry/i}).first();stateRef.value='baseline';if(await recovery.count())await recovery.click({timeout:2500}).catch(()=>{});else await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector(item.route==='login'?'.login-shell':'#app',{state:'attached',timeout:15_000});interactions.push('error-offline-recovery');}
          const flow=await exercise(page,item);interactions.push(...flow.interactions);warnings.push(...flow.warnings);
          findings.push(...await page.evaluate(auditDom));
          if(['baseline','boundary'].includes(item.state)){
            findings.push(...await auditZoom200(page));
            const themed=await auditThemeModes(page,item);findings.push(...themed.findings);interactions.push(...themed.interactions);warnings.push(...themed.warnings);
          }
          if(item.state==='role-denied'){const bodyText=await page.locator('body').innerText().catch(()=>'');if(/QA-LARGO-ÁÉÍÓÚ-漢字/.test(bodyText))findings.push({kind:'ROLE_DENIED_DATA_LEAK'});}
        }
        if(pageErrors.length)findings.push({kind:'PAGE_ERROR',items:pageErrors.slice(0,8)});if(consoleErrors.length)findings.push({kind:'CONSOLE_ERROR',items:consoleErrors.slice(0,8)});
        if(findings.length){status='FAIL';const shot=path.join(artifactRoot,'failures',`${safeSlug(caseIdentityV155(item))}.png`);fs.mkdirSync(path.dirname(shot),{recursive:true});await page.screenshot({path:shot,fullPage:true}).catch(()=>{});if(fs.existsSync(shot))evidence.push(path.relative(process.cwd(),shot));}
      }catch(error){status='FAIL';findings.push({kind:'CASE_EXCEPTION',message:String(error?.message||error)});}finally{page.off('pageerror',onPageError);page.off('console',onConsole);}
      const row={...item,status,evidence,findings,interactions,warnings,expectedAccess:allowed,rbacRole:activeRole.id,startedAt,completedAt:new Date().toISOString(),fixture:'SYNTHETIC_TEST_ONLY'};appendResult(row);if(status==='FAIL')groupFailures.push({case:caseIdentityV155(item),findings,warnings});
    }
    expect(groupFailures,JSON.stringify(groupFailures.slice(0,30),null,2)).toEqual([]);
  });
}
