import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';

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
    window.addEventListener('error',(event)=>window.__cgQaRuntimeErrors.push(`error:${event.message||event.error||'unknown'}`));
    window.addEventListener('unhandledrejection',(event)=>window.__cgQaRuntimeErrors.push(`promise:${event.reason?.message||event.reason||'unknown'}`));
    window.confirm=()=>false;
    window.open=()=>null;
    if(navigator.share)Object.defineProperty(navigator,'share',{configurable:true,value:async()=>undefined});
  },QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const request=route.request();
    const pathname=new URL(request.url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    if(pathname.endsWith('/auth/captcha'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:{token:'qa-token',question:'2 + 2',prompt:'Resuelve 2 + 2',expiresAt:new Date(Date.now()+300000).toISOString()}})});
    return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'QA controlled backend refusal: no real mutation executed.'})});
  });
}

async function openRoute(page,route){
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#pages',{state:'attached',timeout:20_000});
  await page.waitForTimeout(route==='veterinaria'?420:130);
  await page.evaluate(()=>{window.__cgQaRuntimeErrors=[];});
}

async function descriptors(page){
  return page.evaluate(()=>{
    const visible=(node)=>{
      if(!(node instanceof HTMLElement))return false;
      const style=getComputedStyle(node),rect=node.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>1&&rect.height>1;
    };
    const buttons=[...document.querySelectorAll('#pages button')].filter(visible).filter((button)=>!button.disabled&&button.getAttribute('aria-disabled')!=='true');
    const actionButtons=buttons.filter((button)=>String(button.type||button.getAttribute('type')||'button').toLowerCase()!=='submit');
    const submitButtons=buttons.filter((button)=>String(button.type||button.getAttribute('type')||'button').toLowerCase()==='submit');
    const describe=(node,index)=>({
      index,
      id:node.id||'',
      label:String(node.getAttribute('aria-label')||node.textContent||node.title||'').replace(/\s+/g,' ').trim().slice(0,100),
      className:String(node.className||'').slice(0,120),
      data:[...node.attributes].filter((attr)=>attr.name.startsWith('data-')).map((attr)=>`${attr.name}=${attr.value}`).slice(0,8)
    });
    return{
      actions:actionButtons.map(describe),
      submits:submitButtons.map(describe),
      forms:[...document.querySelectorAll('#pages form')].filter(visible).map((form,index)=>({index,id:form.id||'',submitCount:[...form.querySelectorAll('button[type="submit"],input[type="submit"]')].filter(visible).length}))
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
    const form=button.form||button.closest('form');
    const valid=form?form.checkValidity():true;
    button.click();
    return{missing:false,valid,label:String(button.getAttribute('aria-label')||button.textContent||'').replace(/\s+/g,' ').trim().slice(0,100),formId:form?.id||''};
  },index);
}

async function runtimeErrors(page){
  return page.evaluate(()=>Array.isArray(window.__cgQaRuntimeErrors)?[...window.__cgQaRuntimeErrors]:[]).catch(()=>[]);
}

test('every visible module action and submit can be invoked without an unhandled runtime failure',async({page})=>{
  await seed(page);
  const failures=[];
  let actionCount=0,submitCount=0,formCount=0;

  for(const item of MODULE_VISUAL_CATALOG){
    if(item.route==='login')continue;
    try{
      await openRoute(page,item.route);
      const initial=await descriptors(page);
      formCount+=initial.forms.length;

      for(let index=0;index<initial.actions.length;index+=1){
        await openRoute(page,item.route);
        const beforeUrl=page.url();
        const invoked=await invokeNthAction(page,index);
        if(invoked.missing){failures.push({route:item.route,kind:'action-disappeared',descriptor:initial.actions[index],invoked});continue;}
        actionCount+=1;
        await page.waitForTimeout(90);
        const errors=await runtimeErrors(page);
        if(errors.length)failures.push({route:item.route,kind:'action-runtime-error',descriptor:initial.actions[index],invoked,beforeUrl,afterUrl:page.url(),errors});
      }

      for(let index=0;index<initial.submits.length;index+=1){
        await openRoute(page,item.route);
        const invoked=await invokeNthSubmit(page,index);
        if(invoked.missing){failures.push({route:item.route,kind:'submit-disappeared',descriptor:initial.submits[index],invoked});continue;}
        submitCount+=1;
        await page.waitForTimeout(100);
        const errors=await runtimeErrors(page);
        if(errors.length)failures.push({route:item.route,kind:'submit-runtime-error',descriptor:initial.submits[index],invoked,errors});
      }
    }catch(error){failures.push({route:item.route,kind:'route-audit-error',error:String(error?.message||error)});}
  }

  console.log(`[module-actions-v163] rutas=${MODULE_VISUAL_CATALOG.length-1} forms=${formCount} actions-clicked=${actionCount} submits-clicked=${submitCount} fallos=${failures.length}`);
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});
