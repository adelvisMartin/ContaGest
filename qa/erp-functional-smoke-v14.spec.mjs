import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

test.setTimeout(300_000);

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seedAuthenticatedUi(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/auth/me',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})}));
}

async function openRoute(page,route){
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector(route==='login'?'.login-shell':'#pages',{state:'attached',timeout:15_000});
  await waitForRouteReady(page,route,{standalone:route==='login'});
}

test('58 registered routes mount without duplicate DOM ids or legacy global chrome',async({page})=>{
  await seedAuthenticatedUi(page);
  const failures=[];
  for(const item of MODULE_VISUAL_CATALOG){
    const pageErrors=[];
    const listener=(error)=>pageErrors.push(String(error?.message||error));
    page.on('pageerror',listener);
    try{
      await openRoute(page,item.route);
      const audit=await page.evaluate((route)=>{
        const ids=[...document.querySelectorAll('[id]')].map((node)=>node.id).filter(Boolean);
        const counts=ids.reduce((map,id)=>map.set(id,(map.get(id)||0)+1),new Map());
        const duplicates=[...counts].filter(([,value])=>value>1).map(([id,value])=>({id,count:value}));
        const root=route==='login'?document.querySelector('.login-shell'):document.querySelector('#pages');
        const visible=(node)=>{if(!(node instanceof HTMLElement))return false;const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&rect.width>1&&rect.height>1;};
        const clippedButtons=[...document.querySelectorAll('button')].filter(visible).filter((node)=>node.scrollWidth>node.clientWidth+3&&getComputedStyle(node).whiteSpace==='nowrap').slice(0,8).map((node)=>node.textContent?.trim().slice(0,70));
        return{hasRoot:Boolean(root&&root.textContent?.trim()),duplicates,clippedButtons,globalKpi:Boolean(document.querySelector('.hf-kpi-strip')),quickbar:Boolean(document.querySelector('.hf-quickbar')),openMenuGroups:document.querySelectorAll('.hf-menu-section[open]').length,docOverflow:document.documentElement.scrollWidth>innerWidth+2};
      },item.route);
      if(!audit.hasRoot||audit.duplicates.length||audit.clippedButtons.length||audit.globalKpi||audit.quickbar||audit.docOverflow||pageErrors.length)failures.push({route:item.route,audit,pageErrors});
    }catch(error){failures.push({route:item.route,error:String(error?.message||error),pageErrors});}
    finally{page.off('pageerror',listener);}
  }
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});

test('psychology creates an appointment, uses human labels and updates the weekly agenda',async({page})=>{
  await seedAuthenticatedUi(page);
  const patients=[{id:'c95cf55e-3d19-4e18-a0b5-023f0a6cea82',kind:'human',displayName:'Ana Torres',firstName:'Ana',lastName:'Torres',phone:'0412-0000000',email:'ana@example.test'}];
  let appointments=[];
  let posted=null;
  await page.route('**/api/v1/verticals/health/patients**',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:patients})}));
  await page.route('**/api/v1/verticals/health/appointments**',async(route)=>{
    if(route.request().method()==='POST'){
      posted=route.request().postDataJSON();
      const record={id:'apt-qa-1',...posted};
      appointments=[record,...appointments];
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({ok:true,data:record})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:appointments})});
  });
  await openRoute(page,'psicologia');
  const patientSelect=page.locator('#psychAppointmentForm select[name="patientId"]');
  await expect(patientSelect).toBeVisible();
  await expect(patientSelect.locator('option',{hasText:'Ana Torres'})).toHaveCount(1);
  await expect(patientSelect).not.toContainText('c95cf55e-3d19-4e18-a0b5-023f0a6cea82');
  await patientSelect.selectOption(patients[0].id);
  const agendaDate=await page.evaluate(()=>{
    const date=new Date();
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  });
  await page.locator('#psychAppointmentForm input[name="date"]').fill(agendaDate);
  await page.locator('#psychAppointmentForm input[name="time"]').fill('10:30');
  await page.locator('#psychAppointmentForm input[name="durationMinutes"]').fill('50');
  await page.locator('#psychAppointmentForm input[name="reason"]').fill('Seguimiento QA');
  const submit=page.locator('#psychAppointmentForm button[type="submit"]');
  await expect(submit).toBeVisible();
  await submit.click();
  await expect.poll(()=>posted).not.toBeNull();
  expect(posted.patientId).toBe(patients[0].id);
  expect(posted.type).toBe('psychology');
  expect(posted.status).toBe('scheduled');
  expect(posted.reason).toBe('Seguimiento QA');
  await expect(page.locator('body')).toContainText('Cita registrada');
  await expect(page.locator('.cg-psych-event')).toContainText('Ana Torres');
});

test('sidebar is mode-scoped, compact and preserves one active module group',async({page})=>{
  await seedAuthenticatedUi(page);
  await openRoute(page,'psicologia');
  await expect(page.locator('.hf-primary-nav')).toBeVisible();
  expect(await page.locator('.hf-menu-section[open]').count()).toBeLessThanOrEqual(1);
  await expect(page.locator('.hf-kpi-strip')).toHaveCount(0);
  await expect(page.locator('.hf-quickbar')).toHaveCount(0);
  const menuText=await page.locator('#mainMenu').innerText();
  expect(menuText.length).toBeLessThan(1800);
});

test('dark/light share geometry and dark workspace is neutral rather than blue-gradient',async({page})=>{
  await seedAuthenticatedUi(page);
  await openRoute(page,'dashboard');
  const geometry=async()=>page.evaluate(()=>{const sidebar=document.querySelector('#sidebar')?.getBoundingClientRect(),header=document.querySelector('.hf-topbar')?.getBoundingClientRect();return{sidebar:sidebar&&{w:sidebar.width,h:sidebar.height},header:header&&{w:header.width,h:header.height},body:getComputedStyle(document.body).backgroundColor,bgImage:getComputedStyle(document.body).backgroundImage};});
  const light=await geometry();
  await page.locator('#btnTema').click();
  await waitForStableLayout(page,'#pages');
  const dark=await geometry();
  expect(Math.abs((light.sidebar?.w||0)-(dark.sidebar?.w||0))).toBeLessThan(2);
  expect(Math.abs((light.header?.h||0)-(dark.header?.h||0))).toBeLessThan(2);
  expect(dark.bgImage).toBe('none');
  expect(dark.body).not.toBe(light.body);
});