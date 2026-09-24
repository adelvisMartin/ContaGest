import { test, expect } from '@playwright/test';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

const ROUTES = [
  'dashboard','cotizacion','clientes','ventas','inventario','tributos','normativa','historial','reportes',
  'contabilidad','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable',
  'bancos','nomina','proveedores','compras','auditoria','configuracion','ayuda','tasks','profile','mobile',
  'libro-ventas','marca','admin','backend','vistas','plan-cuentas','rrhh','analytics','qr','inventario-scan',
  'pedidos','pos-sede','tracking-pedidos','delivery-mapa','asistente-ia','soporte','demo-control',
  'modulos-madurez','reglas-negocio','licencias','importacion-data','kardex','normativa-contable','pretesting',
  'salud','veterinaria','psicologia','odontologia','gimnasio','rutinas','nutricion','mensajes'
];

async function seedAuthenticatedUi(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      sessionMode:'cookie', mode:'cookie', tenantId:'qa-tenant',
      tenant:{ id:'qa-tenant', name:'Empresa de QA con nombre suficientemente largo para probar layout', rif:'J-00000000-0', plan:'enterprise' },
      user:{ id:'qa-admin', name:'QA Admin', fullName:'QA Admin', email:'qa@contagest.local', role:'admin', permissions:['*'] },
      audience:'staff', expiresAt:Date.now() + 8 * 60 * 60 * 1000
    }));
  });
}

async function openRoute(page, route) {
  await page.goto(`/?module=${route}`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('#pages', { state:'attached', timeout:15_000 });
  await waitForRouteReady(page,route);
}

async function auditVisualHierarchy(page) {
  return page.evaluate(() => {
    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style=getComputedStyle(node); const rect=node.getBoundingClientRect();
      return style.display!=='none' && style.visibility!=='hidden' && Number(style.opacity)!==0 && rect.width>1 && rect.height>1;
    };
    const fontPx=(node)=>Number.parseFloat(getComputedStyle(node).fontSize||'0');
    const rect=(node)=>node.getBoundingClientRect();
    const titles=[...document.querySelectorAll('.cgx-page-header h1,.cg-ui-page-title,.pl-header h2,.ds-page-header h2,.hf-page-head h2,.pretest-hero h2,.hf-brand-header h2')].filter(visible);
    const sections=[...document.querySelectorAll('.cgx-section-head h2,.cg-ui-section-title,.cg-vertical-head h3,.pretest-panel h3,.admin-card h3,.brand-card-title h3,.ds-card-head h3,.cgv-card-head h3')].filter(visible);
    const metrics=[...document.querySelectorAll('.cgx-metric strong,.kpi strong,.pl-kpi strong,.ds-kpi strong,.cgv-kpi-value,.admin-metric strong,.cg-vertical-kpis strong,#kpiTotal')].filter(visible);
    const metricCards=[...document.querySelectorAll('.cgx-metric,.kpi,.pl-kpi,.ds-kpi,.cgv-kpi,.admin-metric,.cg-vertical-kpis article')].filter(visible);
    const controls=[...document.querySelectorAll('.cgx-page-actions button,.cgx-section-actions button,.cg-row-actions button,.cgx-btn')].filter(visible);
    const pseudoDecorations=metricCards.filter((node)=>{
      const before=getComputedStyle(node,'::before'); const after=getComputedStyle(node,'::after');
      return !['none','normal','""'].includes(before.content) || !['none','normal','""'].includes(after.content);
    }).map((node)=>({ className:String(node.className||'').slice(0,100), before:getComputedStyle(node,'::before').content, after:getComputedStyle(node,'::after').content }));
    const docWidth=document.documentElement.scrollWidth;
    return {
      viewport:innerWidth,
      docWidth,
      titleSizes:titles.map((node)=>({ text:(node.textContent||'').trim().slice(0,80), size:fontPx(node), width:rect(node).width })),
      sectionSizes:sections.map((node)=>({ text:(node.textContent||'').trim().slice(0,80), size:fontPx(node) })),
      metricSizes:metrics.map((node)=>({ text:(node.textContent||'').trim().slice(0,80), size:fontPx(node), whiteSpace:getComputedStyle(node).whiteSpace, wordBreak:getComputedStyle(node).wordBreak })),
      metricCards:metricCards.map((node)=>({ width:Math.round(rect(node).width), height:Math.round(rect(node).height), radius:parseFloat(getComputedStyle(node).borderRadius||'0') })).slice(0,24),
      controls:controls.map((node)=>({ width:Math.round(rect(node).width), height:Math.round(rect(node).height) })).slice(0,30),
      pseudoDecorations,
      pageFont:fontPx(document.body),
      tokens:{
        page:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-text-page').trim(),
        kpi:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-text-kpi').trim(),
        surface:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-surface').trim(),
        text:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-text').trim()
      }
    };
  });
}

test.describe('ContaGest Visual System v12', () => {
  test('all operational routes keep compact desktop hierarchy', async ({ page }) => {
    await page.setViewportSize({ width:1440, height:900 });
    await seedAuthenticatedUi(page);
    for (const route of ROUTES) {
      await openRoute(page, route);
      const audit=await auditVisualHierarchy(page);
      expect(audit.tokens.page, `${route}: v12 token missing`).not.toBe('');
      expect(audit.tokens.kpi, `${route}: KPI token missing`).not.toBe('');
      expect(audit.docWidth, `${route}: document overflow\n${JSON.stringify(audit,null,2)}`).toBeLessThanOrEqual(1441);
      expect(audit.pageFont, `${route}: body type must remain operational`).toBeLessThanOrEqual(15);
      for (const item of audit.titleSizes) {
        expect(item.size, `${route}: oversized page title ${JSON.stringify(item)}`).toBeLessThanOrEqual(27);
        expect(item.size, `${route}: page title too small ${JSON.stringify(item)}`).toBeGreaterThanOrEqual(18);
      }
      for (const item of audit.sectionSizes) {
        expect(item.size, `${route}: oversized section title ${JSON.stringify(item)}`).toBeLessThanOrEqual(19);
      }
      for (const item of audit.metricSizes) {
        expect(item.size, `${route}: oversized KPI ${JSON.stringify(item)}`).toBeLessThanOrEqual(21);
        expect(item.whiteSpace, `${route}: KPI must not wrap ${JSON.stringify(item)}`).toBe('nowrap');
        expect(['normal','keep-all'], `${route}: KPI word-break ${JSON.stringify(item)}`).toContain(item.wordBreak);
      }
      for (const card of audit.metricCards) {
        expect(card.height, `${route}: giant KPI card ${JSON.stringify(card)}`).toBeLessThanOrEqual(112);
        expect(card.radius, `${route}: billboard-like KPI radius ${JSON.stringify(card)}`).toBeLessThanOrEqual(14);
      }
      expect(audit.pseudoDecorations, `${route}: KPI blob/pseudo decoration`).toEqual([]);
    }
  });

  test('representative mobile routes stay dense, touch-safe and single-column where required', async ({ page }) => {
    await page.setViewportSize({ width:390, height:844 });
    await seedAuthenticatedUi(page);
    for (const route of ['dashboard','ventas','inventario','contabilidad','admin','salud','veterinaria','psicologia','gimnasio']) {
      await openRoute(page, route);
      const audit=await auditVisualHierarchy(page);
      expect(audit.docWidth, `${route}: mobile overflow\n${JSON.stringify(audit,null,2)}`).toBeLessThanOrEqual(391);
      for (const item of audit.titleSizes) expect(item.size, `${route}: mobile title ${JSON.stringify(item)}`).toBeLessThanOrEqual(23);
      for (const item of audit.metricSizes) expect(item.size, `${route}: mobile KPI ${JSON.stringify(item)}`).toBeLessThanOrEqual(17);
      for (const card of audit.metricCards) expect(card.height, `${route}: mobile KPI height ${JSON.stringify(card)}`).toBeLessThanOrEqual(108);
      for (const control of audit.controls) expect(control.height, `${route}: touch target ${JSON.stringify(control)}`).toBeGreaterThanOrEqual(38);
    }
  });

  test('light and dark theme change semantic colors without changing metric geometry', async ({ page }) => {
    await page.setViewportSize({ width:1440, height:900 });
    await seedAuthenticatedUi(page);
    await openRoute(page,'dashboard');
    const light=await page.evaluate(() => ({
      surface:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-surface').trim(),
      text:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-text').trim(),
      cards:[...document.querySelectorAll('.cgx-metric')].map((n)=>{const r=n.getBoundingClientRect();return[Math.round(r.width),Math.round(r.height)];})
    }));
    await page.locator('#btnTema').click();
    await waitForStableLayout(page,'#pages');
    const dark=await page.evaluate(() => ({
      surface:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-surface').trim(),
      text:getComputedStyle(document.documentElement).getPropertyValue('--cg-v-text').trim(),
      cards:[...document.querySelectorAll('.cgx-metric')].map((n)=>{const r=n.getBoundingClientRect();return[Math.round(r.width),Math.round(r.height)];})
    }));
    expect(dark.surface).not.toBe(light.surface);
    expect(dark.text).not.toBe(light.text);
    expect(dark.cards).toEqual(light.cards);
  });
});
