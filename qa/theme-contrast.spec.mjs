import { test, expect } from '@playwright/test';

function rgb(value='') {
  const match=String(value).match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return match ? match.slice(1,4).map(Number) : [0,0,0];
}
function luminance([r,g,b]) {
  const channel=(v)=>{const s=v/255;return s<=.03928?s/12.92:((s+.055)/1.055)**2.4;};
  return .2126*channel(r)+.7152*channel(g)+.0722*channel(b);
}
function contrast(a,b) {
  const l1=luminance(rgb(a)),l2=luminance(rgb(b));
  return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
}

async function mockSession(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session',JSON.stringify({tenantId:'tenant-contrast',expiresAt:Date.now()+3600000,sessionMode:'cookie',mode:'cookie'}));
    localStorage.setItem('contagest_auto_sync_enabled','false');
    localStorage.setItem('contagest_analytics_backend_enabled','false');
  });
  await page.route('**/api/v1/**',(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:[]})}));
}

test('dark semantic surfaces preserve readable text contrast on mobile', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await mockSession(page);
  await page.goto('/?module=reportes',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Reportes y análisis',exact:true})).toBeVisible();

  // Exercise actual rendered dark surfaces. Transparent KPI wrappers are intentionally excluded;
  // they inherit the enclosing section/gradient and are not independent color surfaces.
  await page.evaluate(()=>document.documentElement.classList.add('dark'));
  const sample=await page.evaluate(()=>{
    const section=document.querySelector('.cgx-section');
    const sectionText=section?.querySelector('h2');
    const field=document.querySelector('.select, .input, .textarea');
    const style=(node)=>node?getComputedStyle(node):null;
    return {
      sectionColor:style(sectionText)?.color||'',sectionBg:style(section)?.backgroundColor||'',
      fieldColor:style(field)?.color||'',fieldBg:style(field)?.backgroundColor||''
    };
  });

  expect(sample.sectionBg,JSON.stringify(sample)).not.toBe('rgba(0, 0, 0, 0)');
  expect(sample.fieldBg,JSON.stringify(sample)).not.toBe('rgba(0, 0, 0, 0)');
  expect(contrast(sample.sectionColor,sample.sectionBg),JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(sample.fieldColor,sample.fieldBg),JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('#cg-install-app')).toHaveCount(0);
  await page.screenshot({path:'test-results/screenshots/v11-15-reportes-mobile-contrast.png',fullPage:true});
});
