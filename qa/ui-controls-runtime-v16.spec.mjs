import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

test.setTimeout(360_000);

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};
const CONSOLE_BLOCKER=/(React does not recognize|Unknown event handler property|Invalid DOM property|validateDOMNesting|Hydration failed|hydrated but some attributes|Cannot update a component while rendering|Each child in a list should have a unique)/i;

async function seedAndInstrument(page){
  await page.addInitScript((session)=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify(session));
    const original=EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener=function(type,listener,options){
      if(this instanceof Element&&['click','submit','change','input','keydown'].includes(String(type))){
        const current=(this.getAttribute('data-qa-bound-events')||'').split(',').filter(Boolean);
        if(!current.includes(type))current.push(type);
        this.setAttribute('data-qa-bound-events',current.join(','));
      }
      return original.call(this,type,listener,options);
    };
  },QA_SESSION);
  await page.route('**/api/v1/auth/me',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})}));
}

async function openRoute(page,route){
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector(route==='login'?'.login-shell':'#pages',{state:'attached',timeout:20_000});
  await waitForRouteReady(page,route,{standalone:route==='login'});
}

async function runtimeControlAudit(page,route){
  return page.evaluate((activeRoute)=>{
    const visible=(node)=>{
      if(!(node instanceof HTMLElement))return false;
      const style=getComputedStyle(node),rect=node.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>1&&rect.height>1;
    };
    const text=(node)=>String(node.textContent||'').replace(/\s+/g,' ').trim();
    const buttonFindings=[],iconFindings=[];
    const buttons=[...document.querySelectorAll('button')].filter(visible);
    for(const button of buttons){
      const type=String(button.getAttribute('type')||'').toLowerCase();
      const label=text(button)||button.getAttribute('aria-label')||button.getAttribute('title')||'';
      const bound=String(button.getAttribute('data-qa-bound-events')||'').split(',').filter(Boolean);
      const form=button.closest('form');
      const formBound=String(form?.getAttribute('data-qa-bound-events')||'').split(',').filter(Boolean);
      const routeControl=Boolean(button.dataset.route||button.dataset.commandRoute||button.dataset.breadcrumbRoute);
      const reactMui=button.classList.contains('MuiButtonBase-root')||Boolean(button.closest('[data-reactroot]'));
      const declarativeData=[...button.attributes].some((attr)=>attr.name.startsWith('data-')&&!['data-qa-bound-events','data-mui-button-fallback','data-cgx-kit'].includes(attr.name));
      const submitBound=type==='submit'&&Boolean(form)&&(formBound.includes('submit')||form.hasAttribute('onsubmit'));
      if(!label)buttonFindings.push({kind:'missing-accessible-name',html:button.outerHTML.slice(0,180)});
      if(!type&&!reactMui)buttonFindings.push({kind:'missing-type',label,html:button.outerHTML.slice(0,180)});
      if(type==='button'&&!bound.includes('click')&&!routeControl&&!declarativeData&&!reactMui)buttonFindings.push({kind:'no-runtime-click-contract',label,id:button.id||'',html:button.outerHTML.slice(0,180)});
      if(type==='submit'&&!submitBound&&!reactMui)buttonFindings.push({kind:'submit-form-unbound',label,formId:form?.id||'',html:button.outerHTML.slice(0,180)});
    }
    const families=['fa-solid','fa-regular','fa-brands','fa-light','fa-thin','fa-duotone','fa-sharp'];
    const icons=[...document.querySelectorAll('i[class*="fa-"]')].filter(visible);
    for(const node of icons){
      const classes=[...node.classList],usedFamilies=families.filter((family)=>classes.includes(family)),glyphs=classes.filter((value)=>value.startsWith('fa-')&&!families.includes(value));
      if(usedFamilies.length!==1)iconFindings.push({kind:'icon-family-count',classes:classes.join(' ')});
      if(!glyphs.length)iconFindings.push({kind:'icon-glyph-missing',classes:classes.join(' ')});
      const parentButton=node.closest('button');
      if(parentButton&&visible(parentButton)&&!text(parentButton)&&!parentButton.getAttribute('aria-label')&&!parentButton.getAttribute('title'))iconFindings.push({kind:'icon-only-button-unlabelled',classes:classes.join(' '),button:parentButton.outerHTML.slice(0,180)});
    }
    const ids=[...document.querySelectorAll('[id]')].map((node)=>node.id).filter(Boolean);
    const duplicates=[...new Set(ids.filter((id,index)=>ids.indexOf(id)!==index))];
    return{route:activeRoute,buttons:buttons.length,icons:icons.length,buttonFindings,iconFindings,duplicates};
  },route);
}

test('all 58 runtime routes expose bound, labelled controls, valid icons and clean React DOM contracts',async({page})=>{
  await seedAndInstrument(page);
  const failures=[];
  let buttonCount=0,iconCount=0;
  for(const item of MODULE_VISUAL_CATALOG){
    const pageErrors=[],consoleFindings=[];
    const errorListener=(error)=>pageErrors.push(String(error?.message||error));
    const consoleListener=(message)=>{
      if(!['warning','error'].includes(message.type()))return;
      const text=message.text();
      if(CONSOLE_BLOCKER.test(text))consoleFindings.push(text.slice(0,500));
    };
    page.on('pageerror',errorListener);
    page.on('console',consoleListener);
    try{
      await openRoute(page,item.route);
      const audit=await runtimeControlAudit(page,item.route);
      buttonCount+=audit.buttons;iconCount+=audit.icons;
      if(audit.buttonFindings.length||audit.iconFindings.length||audit.duplicates.length||pageErrors.length||consoleFindings.length)failures.push({...audit,pageErrors,consoleFindings});
    }catch(error){failures.push({route:item.route,error:String(error?.message||error),pageErrors,consoleFindings});}
    finally{page.off('pageerror',errorListener);page.off('console',consoleListener);}
  }
  console.log(`[browser-control-v163] rutas=${MODULE_VISUAL_CATALOG.length} botones-visibles=${buttonCount} iconos-visibles=${iconCount} fallos=${failures.length}`);
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});
