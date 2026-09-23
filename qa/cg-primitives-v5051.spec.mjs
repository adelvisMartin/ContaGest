import { test, expect } from '@playwright/test';

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/**',async(route)=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname.endsWith('/auth/me'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:route.request().method()==='GET'?[]:{}})});
  });
}

test('50/51 Cg foundation exposes labels dialog focus and touch-safe actions',async({page})=>{
  await seed(page);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?module=marca',{waitUntil:'domcontentloaded'});

  const pilot=page.locator('#cgDesignSystemPilot');
  await expect(pilot).toBeVisible();
  await expect(pilot.getByLabel('Campo de ejemplo')).toBeVisible();
  await expect(pilot.getByLabel('Estado')).toBeVisible();
  await expect(pilot.getByRole('button',{name:'Ayuda del piloto'})).toBeVisible();

  const helpBox=await pilot.getByRole('button',{name:'Ayuda del piloto'}).boundingBox();
  expect(helpBox?.height||0).toBeGreaterThanOrEqual(43.5);
  expect(helpBox?.width||0).toBeGreaterThanOrEqual(43.5);

  const trigger=pilot.getByRole('button',{name:'Probar diálogo'});
  await trigger.focus();
  await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Contrato de diálogo'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Cancelar'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Confirmar'})).toBeVisible();
  const activeInside=await page.evaluate(()=>Boolean(document.querySelector('[role="dialog"]')?.contains(document.activeElement)));
  expect(activeInside).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('50/51 Cg help pilot keeps persistent label and observable state',async({page})=>{
  await seed(page);
  await page.goto('/?module=ayuda',{waitUntil:'domcontentloaded'});
  const pilot=page.locator('#cgHelpMuiPilot');
  await expect(pilot.getByLabel('Buscar ayuda')).toBeVisible();
  await pilot.getByLabel('Buscar ayuda').fill('inventario');
  await pilot.getByRole('button',{name:'Buscar'}).click();
  await expect(pilot.getByText('Filtro aplicado')).toBeVisible();
});
