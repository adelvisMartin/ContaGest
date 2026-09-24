import { test, expect } from '@playwright/test';

const RUN=`B58-${Date.now().toString(36).toUpperCase()}`;
const ADMIN_RIF='00000000';
const ADMIN_EMAIL='admin@erp.local';
const ADMIN_PASSWORD=String(process.env.SEED_ADMIN_PASSWORD||'').trim();
if(ADMIN_PASSWORD.length<12)throw new Error('58/75 requires SEED_ADMIN_PASSWORD from the isolated QA environment.');

function solve(question){
  const match=String(question||'').match(/(-?\d+)\s*([+\-×x*])\s*(-?\d+)/);
  if(!match)throw new Error(`Captcha no reconocido: ${question}`);
  const left=Number(match[1]),right=Number(match[3]);
  if(match[2]==='+')return String(left+right);
  if(match[2]==='-')return String(left-right);
  return String(left*right);
}

async function login(page){
  await page.goto('/?module=login',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-captcha-question]')).not.toHaveText(/cargando|No se pudo/i);
  const question=await page.locator('[data-captcha-question]').textContent();
  await page.getByLabel('RIF de la empresa').fill(ADMIN_RIF);
  await page.getByLabel('Correo electrónico').fill(ADMIN_EMAIL);
  await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
  await page.locator('[name="captchaAnswer"]').fill(solve(question));
  const loginResponse=page.waitForResponse((response)=>
    response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/auth/login'
  );
  await page.getByRole('button',{name:'Entrar a ContaGest'}).click();
  const response=await loginResponse;
  expect(response.ok(),await response.text()).toBeTruthy();
  await expect(page.locator('body')).toHaveAttribute('data-route','dashboard');
}

async function openModule(page,route){
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-route',route);
  await expect(page.locator('#pages')).toHaveAttribute('data-rendered-route',route);
}

test('58/75 browser → real API → real PostgreSQL persists dentistry veterinary and gym mutations',async({page})=>{
  const dentalName=`${RUN} Dental`;
  const vetName=`${RUN} Pet`;
  const gymName=`${RUN} Gym`;
  const gymCode=`${RUN}-M1`;

  await login(page);

  await test.step('dentistry UI creates and reloads a real patient',async()=>{
    await openModule(page,'odontologia');
    const form=page.getByRole('button',{name:'Guardar paciente'}).locator('xpath=ancestor::form');
    await form.getByLabel('Nombre completo').fill(dentalName);
    await form.getByLabel('Correo').fill(`${RUN.toLowerCase()}.dental@example.test`);
    const created=page.waitForResponse((response)=>
      response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/verticals/health/patients'
    );
    await form.getByRole('button',{name:'Guardar paciente'}).click();
    const response=await created;
    expect(response.status(),await response.text()).toBe(201);
    await expect(page.getByText(dentalName,{exact:true}).first()).toBeVisible();

    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('body')).toHaveAttribute('data-route','odontologia');
    await expect(page.getByText(dentalName,{exact:true}).first()).toBeVisible();
  });

  await test.step('veterinary UI creates and reloads a real pet',async()=>{
    await openModule(page,'veterinaria');
    await page.getByRole('button',{name:'Nueva mascota'}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/Nombre de la mascota/).fill(vetName);
    await dialog.getByLabel(/Especie/).fill('canine');
    await dialog.getByLabel(/Tutor/).fill('QA58 Guardian');
    const created=page.waitForResponse((response)=>
      response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/verticals/health/patients'
    );
    await dialog.getByRole('button',{name:'Guardar',exact:true}).click();
    const response=await created;
    expect(response.status(),await response.text()).toBe(201);
    await expect(dialog).toBeHidden();

    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('body')).toHaveAttribute('data-route','veterinaria');
    await page.getByRole('tab',{name:'Mascotas'}).click();
    await expect(page.getByText(vetName,{exact:true}).first()).toBeVisible();
  });

  await test.step('gym UI creates and reloads a real member',async()=>{
    await openModule(page,'gimnasio');
    await page.getByRole('tab',{name:'Clientes'}).click();
    const form=page.getByRole('button',{name:'Guardar cliente'}).locator('xpath=ancestor::form');
    await form.getByLabel('Código').fill(gymCode);
    await form.getByLabel('Nombre completo').fill(gymName);
    await form.getByLabel('Correo').fill(`${RUN.toLowerCase()}.gym@example.test`);
    const created=page.waitForResponse((response)=>
      response.request().method()==='POST'&&new URL(response.url()).pathname==='/api/v1/verticals/gym/members'
    );
    await form.getByRole('button',{name:'Guardar cliente'}).click();
    const response=await created;
    expect(response.status(),await response.text()).toBe(201);
    await expect(page.getByText(gymName,{exact:true}).first()).toBeVisible();

    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('body')).toHaveAttribute('data-route','gimnasio');
    await page.getByRole('tab',{name:'Clientes'}).click();
    await expect(page.getByText(gymName,{exact:true}).first()).toBeVisible();
  });
});
