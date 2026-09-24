import { test, expect } from '@playwright/test';

const RUN=String(process.env.CG_REAL_BROWSER_RUN||'').trim();
const PREFIX=`V58-${RUN}`;
const ADMIN_PASSWORD=String(process.env.SEED_ADMIN_PASSWORD||'Adm1n$2026');

function solve(question){
  const match=String(question||'').match(/(\d+)\s*([+\-×])\s*(\d+)/);
  if(!match)throw new Error(`Unsupported captcha question: ${question}`);
  const left=Number(match[1]),right=Number(match[3]);
  return String(match[2]==='+'?left+right:match[2]==='-'?left-right:left*right);
}

async function login(page,context){
  await page.goto('/?module=login',{waitUntil:'domcontentloaded'});
  await page.locator('input[name="tenantRif"]').fill('00000000');
  await page.locator('input[name="email"]').fill('admin@erp.local');
  await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
  const question=page.locator('[data-captcha-question]');
  await expect(question).not.toHaveText(/cargando/i);
  await page.locator('input[name="captchaAnswer"]').fill(solve(await question.textContent()));
  await Promise.all([
    page.waitForResponse((response)=>response.url().includes('/api/v1/auth/login')&&response.request().method()==='POST'&&response.status()===200),
    page.getByRole('button',{name:'Entrar a ContaGest'}).click()
  ]);
  await expect(page.locator('body')).not.toHaveAttribute('data-route','login');
  const cookies=await context.cookies();
  for(const name of ['cg_access','cg_refresh','cg_csrf'])expect(cookies.some((cookie)=>cookie.name===name),`missing browser cookie ${name}`).toBeTruthy();
}

async function browserJson(page,path){
  return page.evaluate(async(pathname)=>{
    const response=await fetch(`http://127.0.0.1:3030/api/v1${pathname}`,{credentials:'include'});
    const payload=await response.json();
    if(!response.ok||payload?.ok===false)throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
    return payload.data??payload;
  },path);
}

test('58/75 browser -> real API -> PostgreSQL: three verticals persist and remain tenant-isolated',async({page,context})=>{
  expect(RUN,'CG_REAL_BROWSER_RUN is required').not.toBe('');
  await login(page,context);

  const dentalName=`${PREFIX} Dental Patient`;
  await page.goto('/?module=odontologia',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Consultorio odontológico'})).toBeVisible();
  const dentalForm=page.getByRole('button',{name:'Guardar paciente'}).locator('xpath=ancestor::form');
  await dentalForm.getByLabel('Nombre completo').fill(dentalName);
  await Promise.all([
    page.waitForResponse((response)=>response.url().includes('/api/v1/verticals/health/patients')&&response.request().method()==='POST'&&response.ok()),
    dentalForm.getByRole('button',{name:'Guardar paciente'}).click()
  ]);
  await expect(page.getByText(dentalName,{exact:true}).first()).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByText(dentalName,{exact:true}).first()).toBeVisible();
  const dentalPatients=await browserJson(page,'/verticals/health/patients?kind=human');
  expect(JSON.stringify(dentalPatients)).not.toContain(`${PREFIX}-FOREIGN-PATIENT`);

  const petName=`${PREFIX} Pet`;
  await page.goto('/?module=veterinaria',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Clínica veterinaria'})).toBeVisible();
  await page.getByRole('button',{name:'Nueva mascota'}).click();
  const petDialog=page.getByRole('dialog',{name:'Nueva mascota'});
  await petDialog.getByLabel(/Nombre de la mascota/).fill(petName);
  await petDialog.getByLabel(/Especie/).fill('Canino');
  await petDialog.getByLabel(/Tutor/).fill('Tutor QA58');
  await Promise.all([
    page.waitForResponse((response)=>response.url().includes('/api/v1/verticals/health/patients')&&response.request().method()==='POST'&&response.ok()),
    petDialog.getByRole('button',{name:'Guardar',exact:true}).click()
  ]);
  await page.getByRole('tab',{name:'Mascotas'}).click();
  await expect(page.getByText(petName,{exact:true}).first()).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('tab',{name:'Mascotas'}).click();
  await expect(page.getByText(petName,{exact:true}).first()).toBeVisible();
  const pets=await browserJson(page,'/verticals/health/patients?kind=animal');
  expect(JSON.stringify(pets)).not.toContain(`${PREFIX}-FOREIGN-PET`);

  const memberName=`${PREFIX} Gym Member`;
  const memberCode=`${PREFIX}-MEMBER`;
  await page.goto('/?module=gimnasio',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Control integral de gimnasio'})).toBeVisible();
  await page.getByRole('tab',{name:'Clientes'}).click();
  const memberForm=page.getByRole('button',{name:'Guardar cliente'}).locator('xpath=ancestor::form');
  await memberForm.getByLabel('Código').fill(memberCode);
  await memberForm.getByLabel('Nombre completo').fill(memberName);
  await Promise.all([
    page.waitForResponse((response)=>response.url().includes('/api/v1/verticals/gym/members')&&response.request().method()==='POST'&&response.ok()),
    memberForm.getByRole('button',{name:'Guardar cliente'}).click()
  ]);
  await expect(page.getByText(memberName,{exact:true}).first()).toBeVisible();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.getByRole('tab',{name:'Clientes'}).click();
  await expect(page.getByText(memberName,{exact:true}).first()).toBeVisible();
  const members=await browserJson(page,'/verticals/gym/members');
  expect(JSON.stringify(members)).not.toContain(`${PREFIX}-FOREIGN-MEMBER`);
});
