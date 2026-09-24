import { test, expect } from '@playwright/test';
import { waitForStableLayout } from './support/playwright-determinism.mjs';

const VIEWPORTS = [
  { name:'360', width:360, height:800 },
  { name:'390', width:390, height:844 },
  { name:'430', width:430, height:932 }
];

async function seedAuthenticatedUi(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      sessionMode:'cookie', mode:'cookie', tenantId:'qa-tenant',
      tenant:{ id:'qa-tenant', name:'ContaGest QA', rif:'00000000', plan:'enterprise' },
      user:{ id:'qa-admin', name:'QA Admin', fullName:'QA Admin', email:'qa@contagest.local', role:'admin', permissions:['*'] },
      audience:'staff', expiresAt:Date.now() + 8 * 60 * 60 * 1000
    }));
  });
}

async function openDashboard(page) {
  await page.goto('/?module=dashboard', { waitUntil:'domcontentloaded' });
  await page.waitForSelector('.hf-app-topbar', { state:'visible', timeout:15_000 });
  await waitForStableLayout(page,'.hf-app-topbar');
}

for (const viewport of VIEWPORTS) {
  test.describe(`mobile header v11.22 @ ${viewport.name}`, () => {
    test.use({ viewport:{ width:viewport.width, height:viewport.height } });

    test('keeps every primary control inside one aligned header row', async ({ page }) => {
      await seedAuthenticatedUi(page);
      await openDashboard(page);

      const audit = await page.evaluate(() => {
        const header=document.querySelector('.hf-app-topbar');
        const selectors=['#btnOpenSidebar','.hf-header-brand','#btnCommandPalette','.hf-rate-compact','#btnTema','#btnUserMenu'];
        const headerRect=header.getBoundingClientRect();
        const items=selectors.map((selector)=>{
          const node=document.querySelector(selector);
          const rect=node.getBoundingClientRect();
          const style=getComputedStyle(node);
          return { selector, top:rect.top, bottom:rect.bottom, left:rect.left, right:rect.right, width:rect.width, height:rect.height, centerY:rect.top+rect.height/2, position:style.position };
        });
        const search=document.querySelector('#btnCommandPalette').getBoundingClientRect();
        const quick=document.querySelector('.hf-quickbar-shell')?.getBoundingClientRect();
        return {
          header:{ top:headerRect.top, bottom:headerRect.bottom, height:headerRect.height, display:getComputedStyle(header).display, flexWrap:getComputedStyle(header).flexWrap },
          items,
          searchAboveQuick:!quick || search.bottom <= quick.top + 1
        };
      });

      expect(audit.header.display).toBe('flex');
      expect(audit.header.flexWrap).toBe('nowrap');
      expect(audit.searchAboveQuick, JSON.stringify(audit,null,2)).toBe(true);
      for (const item of audit.items) {
        expect(item.top, JSON.stringify(audit,null,2)).toBeGreaterThanOrEqual(audit.header.top - 1);
        expect(item.bottom, JSON.stringify(audit,null,2)).toBeLessThanOrEqual(audit.header.bottom + 1);
        expect(item.position, `${item.selector} escaped the row`).not.toBe('absolute');
      }
      const centers=audit.items.map((item)=>item.centerY);
      expect(Math.max(...centers)-Math.min(...centers), JSON.stringify(audit,null,2)).toBeLessThanOrEqual(3);
    });

    test('uses the canonical mark, numeric BCV amount and exactly one theme glyph', async ({ page }) => {
      await seedAuthenticatedUi(page);
      await openDashboard(page);

      const logo=page.locator('.hf-header-logo img');
      await expect(logo).toBeVisible();
      await expect(logo).toHaveAttribute('src', /contagest-mark\.svg|data:image\/svg\+xml/i);

      const rate=page.locator('#tasaHeaderMobile');
      await expect(rate).toBeVisible();
      const rateText=(await rate.textContent())?.trim() || '';
      expect(rateText).not.toContain('Bs.S');
      expect(rateText).toMatch(/^\d{1,3}(?:[.\s]\d{3})*,\d{2}$/);
      const rateGeometry=await rate.evaluate((node)=>({clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,textOverflow:getComputedStyle(node).textOverflow}));
      expect(rateGeometry.scrollWidth).toBeLessThanOrEqual(rateGeometry.clientWidth + 1);
      expect(rateGeometry.textOverflow).not.toBe('ellipsis');

      const theme=page.locator('#btnTema');
      await expect(theme.locator(':scope > svg.hf-theme-svg')).toHaveCount(1);
      await expect(theme.locator(':scope > i')).toHaveCount(0);
      const pseudo=await theme.evaluate((node)=>({before:getComputedStyle(node,'::before').content,after:getComputedStyle(node,'::after').content}));
      expect(['none','normal','""']).toContain(pseudo.before);
      expect(['none','normal','""']).toContain(pseudo.after);
    });
  });
}
