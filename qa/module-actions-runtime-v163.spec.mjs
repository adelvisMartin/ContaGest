import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

test.setTimeout(900_000);

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.addInitScript((session)=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    window.__cgQaRuntimeErrors=[];
    window.__cgQaEffects={open:0,print:0,clipboard:0,share:0,fileClick:0,download:0,confirm:0};
    window.addEventListener('error',(event)=>window.__cgQaRuntimeErrors.push(`error:${event.message||event.error||'unknown'}`));
    window.addEventListener('unhandledrejection',(event)=>window.__cgQaRuntimeErrors.push(`promise:${event.reason?.message||event.reason||'unknown'}`));
    window.confirm=()=>{window.__cgQaEffects.confirm+=1;return false;};
    window.open=()=>{window.__cgQaEffects.open+=1;return null;};
    window.print=()=>{window.__cgQaEffects.print+=1;};
    if(navigator.share)Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.__cgQaEffects.share+=1;}});
    if(navigator.clipboard?.writeText){
      try{Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{window.__cgQaEffects.clipboard+=1;}});}catch{}
    }
    const inputClick=HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click=function(...args){if(this.type==='file')window.__cgQaEffects.fileClick+=1;return inputClick.apply(this,args);};
    const anchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(...args){if(this.hasAttribute('download'))window.__cgQaEffects.download+=1;return anchorClick.apply(this,args);};
  },QA_SESSION);
}

async function installApiIsolation(page,onApiRequest){
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request(),pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa-token',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    onApiRequest({method:request.method(),pathname});
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'QA controlled backend refusal: no real mutation executed.'})});
  });
}

async function openRoute(page,route){
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#pages',{state:'attached',timeout:20_000});
  await waitForRouteReady(page,route);
  await page.evaluate(()=>{window.__cgQaRuntimeErrors=[];window.__cgQaEffects={open:0,print:0,clipboard:0,share:0,fileClick:0,download:0,confirm:0};});
}

async function descriptors(page){
  return page.evaluate(()=>{
    const visible=(node)=>{if(!(node instanceof HTMLElement))return false;const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>1&&rect.height>1;};
    const buttons=[...document.querySelectorAll('#pages button')].filter(visible).filter((button)=>!button.disabled&&button.getAttribute('aria-disabled')!=='true');
    const actionButtons=buttons.filter((button)=>String(button.type||button.getAttribute('type')||'button').toLowerCase()!=='submit');
    const submitButtons=buttons.filter((button)=>String(button.type||button.getAttribute('type')||'button').toLowerCase()==='submit');
    const describe=(node,index)=>({
      index,id:node.id||'',label:String(node.getAttribute('aria-label')||node.textContent||node.title||'').replace(/\s+/g,' ').trim().slice(0,100),className:String(node.className||'').slice(0,120),
      route:node.dataset.route||node.dataset.commandRoute||node.dataset.breadcrumbRoute||'',pressed:node.getAttribute('aria-pressed')||'',selected:node.getAttribute('aria-selected')||'',
      data:[...node.attributes].filter((attr)=>attr.name.startsWith('data-')).map((attr)=>`${attr.name}=${attr.value}`).slice(0,8)
    });
    return{actions:actionButtons.map(describe),submits:submitButtons.map(describe),forms:[...document.querySelectorAll('#pages form')].filter(visible).map((form,index)=>({index,id:form.id||'',submitCount:[...form.querySelectorAll('button[type="submit"],input[type="submit"]')].filter(visible).length}))};
  });
}

async function snapshot(page){
  return page.evaluate(()=>{
    const hash=(value)=>{let h=2166136261;for(let i=0;i<value.length;i+=1){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
    const pages=document.getElementById('pages');
    const visible=(node)=>node instanceof HTMLElement&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden'&&node.getBoundingClientRect().width>1&&node.getBoundingClientRect().height>1;
    const overlays=[...document.querySelectorAll('.cg-modal-backdrop,.MuiModal-root,[role="dialog"],.toast,.cg-toast,[data-hot-toast]')].filter(visible).map((node)=>String(node.textContent||node.className||'').replace(/\s+/g,' ').trim().slice(0,180));
    const active=document.activeElement;
    return{
      route:document.body.dataset.route||'',url:location.href,domHash:hash(pages?.innerHTML||''),textHash:hash(pages?.textContent||''),overlays,
      active:active?`${active.tagName}:${active.id||active.getAttribute('name')||active.className||''}`:'',
      effects:{...(window.__cgQaEffects||{})}
    };
  });
}

async function invokeNthAction(page,index){
  return page.evaluate((targetIndex)=>{
    const visible=(node)=>{if(!(node instanceof HTMLElement))return false;const s=getComputedStyle(node),r=node.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>1&&r.height>1;};
    const buttons=[...document.querySelectorAll('#pages button')].filter(visible).filter((button)=>!button.disabled&&button.getAttribute('aria-disabled')!=='true').filter((button)=>String(button.type||button.getAttribute('type')||'button').toLowerCase()!=='submit');
    const button=buttons[targetIndex];
    if(!button)return{missing:true,count:buttons.length};
    button.click();
    return{missing:false,label:String(button.getAttribute('aria-label')||button.textContent||'').replace(/\s+/g,' ').trim().slice(0,100)};
  },index);
}

async function invokeNthSubmit(page,index){
  return page.evaluate((targetIndex)=>{
    const visible=(node)=>{if(!(node instanceof HTMLElement))return false;const s=getComputedStyle(node),r=node.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>1&&r.height>1;};
    const buttons=[...document.querySelectorAll('#pages button')].filter(visible).filter((button)=>!button.disabled&&button.getAttribute('aria-disabled')!=='true').filter((button)=>String(button.type||button.getAttribute('type')||'button').toLowerCase()==='submit');
    const button=buttons[targetIndex];
    if(!button)return{missing:true,count:buttons.length};
    const form=button.form||button.closest('form'),valid=form?form.checkValidity():true;
    button.click();
    return{missing:false,valid,label:String(button.getAttribute('aria-label')||button.textContent||'').replace(/\s+/g,' ').trim().slice(0,100),formId:form?.id||''};
  },index);
}

async function runtimeErrors(page){return page.evaluate(()=>Array.isArray(window.__cgQaRuntimeErrors)?[...window.__cgQaRuntimeErrors]:[]).catch(()=>[]);}
const changedEffects=(before,after)=>Object.keys(after||{}).some((key)=>Number(after[key]||0)>Number(before?.[key]||0));
const observable=(before,after,requestsBefore,requestsAfter)=>before.url!==after.url||before.route!==after.route||before.domHash!==after.domHash||before.textHash!==after.textHash||before.active!==after.active||JSON.stringify(before.overlays)!==JSON.stringify(after.overlays)||changedEffects(before.effects,after.effects)||requestsAfter>requestsBefore;

 test('every visible module action and submit has a safe runtime contract and an observable effect',async({page})=>{
  let apiRequestCount=0;
  const apiRequests=[];
  await seed(page);
  await installApiIsolation(page,(request)=>{apiRequestCount+=1;apiRequests.push(request);});
  const failures=[],unobserved=[];
  let actionCount=0,submitCount=0,formCount=0;

  for(const item of MODULE_VISUAL_CATALOG){
    if(item.route==='login')continue;
    try{
      await openRoute(page,item.route);
      const initial=await descriptors(page);
      formCount+=initial.forms.length;

      for(let index=0;index<initial.actions.length;index+=1){
        await openRoute(page,item.route);
        const descriptor=initial.actions[index],before=await snapshot(page),requestsBefore=apiRequestCount;
        const invoked=await invokeNthAction(page,index);
        if(invoked.missing){failures.push({route:item.route,kind:'action-disappeared',descriptor,invoked});continue;}
        actionCount+=1;
        await waitForStableLayout(page,'#pages');
        const after=await snapshot(page),errors=await runtimeErrors(page),requestsAfter=apiRequestCount;
        if(errors.length){failures.push({route:item.route,kind:'action-runtime-error',descriptor,invoked,before,after,errors,apiRequests:apiRequests.slice(-3)});continue;}
        if(descriptor.route){
          if(after.route!==descriptor.route)failures.push({route:item.route,kind:'route-button-did-not-navigate',descriptor,before,after});
          continue;
        }
        const idempotentActive=descriptor.pressed==='true'||descriptor.selected==='true'||/(^|\s)(active|is-active|selected)(\s|$)/.test(descriptor.className);
        if(!idempotentActive&&!observable(before,after,requestsBefore,requestsAfter))unobserved.push({route:item.route,descriptor,before,after});
      }

      for(let index=0;index<initial.submits.length;index+=1){
        await openRoute(page,item.route);
        const descriptor=initial.submits[index],before=await snapshot(page),requestsBefore=apiRequestCount;
        const invoked=await invokeNthSubmit(page,index);
        if(invoked.missing){failures.push({route:item.route,kind:'submit-disappeared',descriptor,invoked});continue;}
        submitCount+=1;
        await waitForStableLayout(page,'#pages');
        const after=await snapshot(page),errors=await runtimeErrors(page),requestsAfter=apiRequestCount;
        if(errors.length){failures.push({route:item.route,kind:'submit-runtime-error',descriptor,invoked,errors});continue;}
        // Invalid empty forms legitimately stop at native validation. Valid forms must
        // produce state/UI/network feedback rather than silently swallowing submit.
        if(invoked.valid&&!observable(before,after,requestsBefore,requestsAfter))unobserved.push({route:item.route,kind:'valid-submit-no-effect',descriptor,invoked,before,after});
      }
    }catch(error){failures.push({route:item.route,kind:'route-audit-error',error:String(error?.message||error)});}
  }

  console.log(`[module-actions-v163] rutas=${MODULE_VISUAL_CATALOG.length-1} forms=${formCount} actions-clicked=${actionCount} submits-clicked=${submitCount} runtime-failures=${failures.length} no-effect=${unobserved.length}`);
  if(unobserved.length)console.log(`[module-actions-v163][NO_EFFECT] ${JSON.stringify(unobserved,null,2)}`);
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  expect(unobserved,`Botones/submits con listener aparente pero sin efecto observable:\n${JSON.stringify(unobserved,null,2)}`).toEqual([]);
});
