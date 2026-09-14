import { test, expect } from '@playwright/test';

const challenge=(suffix='a',expiresAt=Date.now()+5*60*1000)=>({
  ok:true,
  data:{
    kind:'math',
    question:'7 + 5',
    prompt:'¿Cuánto es 7 + 5?',
    token:`qa221-${suffix}-${'x'.repeat(48)}`,
    expiresAt,
    refreshAfterSeconds:300
  }
});

async function stubCaptcha(page,handler){
  await page.route('**/api/v1/auth/captcha',handler);
}

async function expectNoHorizontalOverflow(page,label='viewport'){
  const metrics=await page.evaluate(()=>({
    htmlScroll:document.documentElement.scrollWidth,
    htmlClient:document.documentElement.clientWidth,
    bodyScroll:document.body?.scrollWidth||0,
    bodyClient:document.body?.clientWidth||0
  }));
  expect(metrics.htmlScroll,`${label}: documentElement overflow`).toBeLessThanOrEqual(metrics.htmlClient+1);
  expect(metrics.bodyScroll,`${label}: body overflow`).toBeLessThanOrEqual(metrics.bodyClient+1);
}

async function openLogin(page){
  await page.goto('/');
  await expect(page.locator('#loginForm')).toBeVisible();
  return{
    form:page.locator('#loginForm'),
    submit:page.locator('#btnLoginSubmit'),
    answer:page.locator('#login-captchaAnswer'),
    token:page.locator('[data-captcha-token]'),
    refresh:page.locator('[data-captcha-refresh]'),
    question:page.locator('[data-captcha-question]'),
    expiry:page.locator('[data-captcha-expiry]'),
    status:page.locator('[data-login-status]')
  };
}

test.describe('#221 CAPTCHA/login fail-closed and recovery',()=>{
  test('submit is disabled while delayed CAPTCHA has not produced a valid challenge',async({page})=>{
    await stubCaptcha(page,async(route)=>{
      await new Promise((resolve)=>setTimeout(resolve,700));
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge('delayed'))});
    });
    const ui=await openLogin(page);
    await expect(ui.form).toHaveAttribute('data-captcha-ready','false');
    await expect(ui.answer).toBeDisabled();
    await expect(ui.submit).toBeDisabled();
    await expect(ui.question).toContainText('cargando');
    await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
    await expect(ui.answer).toBeEnabled();
    await expect(ui.submit).toBeEnabled();
    await expect(ui.token).not.toHaveValue('');
  });

  test('infrastructure failure remains fail-closed and manual refresh recovers without page reload',async({page})=>{
    let attempts=0;
    await stubCaptcha(page,async(route)=>{
      attempts+=1;
      if(attempts===1){
        await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,error:'FUNCTION_INVOCATION_FAILED'})});
        return;
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge('recovered'))});
    });
    const ui=await openLogin(page);
    await expect(ui.question).toContainText('No se pudo cargar el reto');
    await expect(ui.status).toContainText('servicio de verificación no está disponible');
    await expect(ui.form).toHaveAttribute('data-captcha-ready','false');
    await expect(ui.answer).toBeDisabled();
    await expect(ui.submit).toBeDisabled();
    const hrefBefore=page.url();
    await ui.refresh.click();
    await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
    await expect(ui.question).toContainText('7 + 5');
    await expect(ui.submit).toBeEnabled();
    expect(page.url()).toBe(hrefBefore);
    expect(attempts).toBe(2);
  });

  test('a loaded challenge expires fail-closed, clears its token and refreshes safely',async({page})=>{
    let attempts=0;
    await stubCaptcha(page,async(route)=>{
      attempts+=1;
      const payload=attempts===1?challenge('short',Date.now()+1200):challenge('fresh');
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
    });
    const ui=await openLogin(page);
    await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
    await expect(ui.token).not.toHaveValue('');
    await expect(ui.status).toContainText('La verificación expiró',{timeout:4000});
    await expect(ui.form).toHaveAttribute('data-captcha-ready','false');
    await expect(ui.token).toHaveValue('');
    await expect(ui.answer).toBeDisabled();
    await expect(ui.submit).toBeDisabled();
    await expect(ui.expiry).toContainText('Reto expirado');
    const hrefBefore=page.url();
    await ui.refresh.click();
    await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
    await expect(ui.submit).toBeEnabled();
    await expect(ui.token).not.toHaveValue('');
    expect(page.url()).toBe(hrefBefore);
    expect(attempts).toBe(2);
  });

  test('an already expired challenge from the server never becomes usable',async({page})=>{
    await stubCaptcha(page,async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge('expired',Date.now()-1000))}));
    const ui=await openLogin(page);
    await expect(ui.question).toContainText('No se pudo cargar el reto');
    await expect(ui.status).toContainText('ya expiró');
    await expect(ui.form).toHaveAttribute('data-captcha-ready','false');
    await expect(ui.token).toHaveValue('');
    await expect(ui.answer).toBeDisabled();
    await expect(ui.submit).toBeDisabled();
  });

  test('submit is blocked when the signed CAPTCHA token is missing',async({page})=>{
    await stubCaptcha(page,async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge('submit'))}));
    const ui=await openLogin(page);
    await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
    await page.locator('#login-tenantRif').fill('J-12345678-9');
    await page.locator('#login-email').fill('qa221@example.test');
    await page.locator('#login-password').fill('not-a-real-password');
    await ui.answer.fill('12');
    await ui.token.evaluate((node)=>{node.value='';});
    await ui.submit.click();
    await expect(ui.status).toContainText('verificación humana válida');
    await expect(ui.form).toHaveAttribute('data-captcha-ready','false');
    await expect(ui.submit).toBeDisabled();
  });
});

test.describe('#221 CAPTCHA/login responsive regression',()=>{
  const viewports=[
    [360,640],[390,844],[430,932],[768,1024],[1366,768]
  ];
  for(const [width,height] of viewports){
    test(`${width}x${height} has no global horizontal overflow or CAPTCHA overlap`,async({page})=>{
      await page.setViewportSize({width,height});
      await stubCaptcha(page,async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge(`${width}x${height}`))}));
      const ui=await openLogin(page);
      await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
      await expect(page.locator('[data-captcha-box]')).toBeVisible();
      await expect(page.locator('#btnLoginSubmit')).toBeVisible();
      await expectNoHorizontalOverflow(page,`${width}x${height}`);
      if(width<=430){
        const refreshBox=await ui.refresh.boundingBox();
        expect(refreshBox,`${width}x${height}: CAPTCHA refresh target missing`).not.toBeNull();
        expect(refreshBox.width,`${width}x${height}: CAPTCHA refresh width`).toBeGreaterThanOrEqual(44);
        expect(refreshBox.height,`${width}x${height}: CAPTCHA refresh height`).toBeGreaterThanOrEqual(44);
      }
    });
  }

  for(const zoom of [1.25,1.5,2]){
    test(`CSS layout zoom ${Math.round(zoom*100)}% remains horizontally contained`,async({page})=>{
      await page.setViewportSize({width:1366,height:768});
      await stubCaptcha(page,async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge(`zoom-${zoom}`))}));
      const ui=await openLogin(page);
      await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
      await page.evaluate((factor)=>{document.documentElement.style.zoom=String(factor);},zoom);
      await expectNoHorizontalOverflow(page,`zoom-${zoom}`);
      await expect(page.locator('[data-captcha-box]')).toBeVisible();
    });
  }

  test('orientation resize keeps CAPTCHA and submit usable',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await stubCaptcha(page,async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(challenge('orientation'))}));
    const ui=await openLogin(page);
    await expect(ui.form).toHaveAttribute('data-captcha-ready','true');
    await page.setViewportSize({width:844,height:390});
    await expectNoHorizontalOverflow(page,'landscape');
    await expect(page.locator('[data-captcha-box]')).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    await expectNoHorizontalOverflow(page,'portrait-restored');
    await expect(ui.submit).toBeEnabled();
  });
});
