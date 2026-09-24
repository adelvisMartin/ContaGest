import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG, CRITICAL_VISUAL_ROUTES } from './support/module-visual-catalog.mjs';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

test.setTimeout(300_000);

async function seedAuthenticatedUi(page) {
  await page.addInitScript(() => {
    localStorage.setItem('contagest_auth_session', JSON.stringify({
      sessionMode:'cookie', mode:'cookie', tenantId:'qa-tenant',
      tenant:{ id:'qa-tenant', name:'ContaGest QA', rif:'J-00000000-0', plan:'enterprise' },
      user:{ id:'qa-admin', name:'QA Admin', fullName:'QA Admin', email:'qa@contagest.local', role:'admin', permissions:['*'] },
      audience:'staff', expiresAt:Date.now() + 8 * 60 * 60 * 1000
    }));
  });
}

async function openRoute(page, route, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/?module=${route}`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector(route === 'login' ? '.login-shell' : '#pages', { state:'attached', timeout:15_000 });
  await waitForRouteReady(page,route,{standalone:route==='login'});
}

async function auditGeometry(page, route, viewport) {
  return page.evaluate(({ route, viewport }) => {
    const issues=[];
    const add=(code,detail,selector='')=>issues.push({ code, detail, selector });
    const width=innerWidth;
    const mobile=width <= 430;
    const visible=(node)=>{
      if(!(node instanceof HTMLElement))return false;
      const style=getComputedStyle(node),rect=node.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>1&&rect.height>1;
    };
    const rect=(node)=>node.getBoundingClientRect();
    const horizontalOwners=[
      '.table-wrap','.pl-table-wrap','.ds-table-wrap','.cgv-table-shell','.cgx-table-wrap','.cg-ui-table-wrap',
      '.MuiTableContainer-root','.MuiTabs-scroller','.MuiMenu-list','.hf-quickbar','.hf-command-results','#mainMenu',
      '.cg-kanban','.cg-gym-v1124-tabs','.cg-pos-tabs','[data-horizontal-scroll]'
    ].join(',');
    const ignored=[
      '.hf-sidebar','#sidebarBackdrop','.hf-command-layer','.cg-loading-overlay','.MuiPopover-root','.MuiModal-root',
      '.toast-container','.cg-toast-stack','[role="tooltip"]','.hidden'
    ].join(',');

    if(document.documentElement.scrollWidth > width + 1)add('document-overflow',`${document.documentElement.scrollWidth}px > viewport ${width}px`,'html');
    if(document.body.scrollWidth > width + 1)add('body-overflow',`${document.body.scrollWidth}px > viewport ${width}px`,'body');

    const offenders=[...document.querySelectorAll('body *')].filter((node)=>{
      if(!visible(node)||node.closest(horizontalOwners)||node.closest(ignored))return false;
      const box=rect(node);
      return box.left < -2 || box.right > width + 2;
    }).slice(0,12);
    for(const node of offenders){
      const box=rect(node);
      add('viewport-escape',`left=${Math.round(box.left)} right=${Math.round(box.right)} width=${Math.round(box.width)}`,`${node.tagName.toLowerCase()}#${node.id}.${String(node.className||'').replace(/\s+/g,'.').slice(0,100)}`);
    }

    const pageTitles=[...document.querySelectorAll('.cgx-page-header h1,.cg-ui-page-title,.pl-header h2,.ds-page-header h2,.hf-page-head h2,.pretest-hero h2,.login-copy h2,.login-panel h2')].filter(visible);
    for(const node of pageTitles){
      const size=parseFloat(getComputedStyle(node).fontSize);
      const max=mobile?23:27;
      if(size>max)add('page-title-size',`${size}px > ${max}px`,node.tagName.toLowerCase());
      const style=getComputedStyle(node),line=parseFloat(style.lineHeight)||size*1.2;
      if(rect(node).height > line*2.35)add('page-title-lines',`title consumes >2 lines (${Math.round(rect(node).height)}px)`,node.textContent?.trim().slice(0,80));
    }

    const metrics=[...document.querySelectorAll('.cgx-metric,.kpi,.pl-kpi,.ds-kpi,.cgv-kpi,.admin-metric,.cg-vertical-kpis article')].filter(visible);
    for(const node of metrics){
      const box=rect(node),style=getComputedStyle(node);
      const radius=parseFloat(style.borderTopLeftRadius)||0;
      if(box.height>132)add('metric-height',`${Math.round(box.height)}px > 132px`,String(node.className||''));
      if(radius>18)add('metric-radius',`${radius}px > 18px`,String(node.className||''));
      const value=node.querySelector('strong,.cgv-kpi-value,#kpiTotal');
      if(value&&visible(value)){
        const valueStyle=getComputedStyle(value),size=parseFloat(valueStyle.fontSize),max=mobile?17.5:21;
        if(size>max)add('metric-font',`${size}px > ${max}px`,value.textContent?.trim().slice(0,60));
        if(valueStyle.whiteSpace!=='nowrap')add('metric-wrap','metric value is allowed to wrap',value.textContent?.trim().slice(0,60));
      }
      for(const pseudo of ['::before','::after']){
        const p=getComputedStyle(node,pseudo),content=String(p.content||'');
        const pWidth=parseFloat(p.width)||0,pHeight=parseFloat(p.height)||0;
        if(content!=='none'&&content!=='normal'&&content!=='""'&&(pWidth>8||pHeight>8))add('metric-pseudo',`${pseudo} content=${content} ${pWidth}x${pHeight}`,String(node.className||''));
      }
    }

    const actionContainers=[...document.querySelectorAll('.cgx-page-actions,.cgx-section-actions,.cg-row-actions,.cg-record-actions,.cg-form-actions,.settings-actions,.coordinate-actions,.cg-order-actions')].filter(visible);
    const overlaps=(nodes)=>{
      const items=nodes.filter(visible).map((node)=>({node,box:rect(node)}));
      const hits=[];
      for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
        const a=items[i],b=items[j];
        if(a.node.contains(b.node)||b.node.contains(a.node))continue;
        const x=Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left);
        const y=Math.min(a.box.bottom,b.box.bottom)-Math.max(a.box.top,b.box.top);
        if(x>3&&y>3)hits.push([a.node,b.node]);
      }
      return hits;
    };
    for(const container of actionContainers){
      for(const [a,b] of overlaps([...container.children]))add('action-overlap',`${a.textContent?.trim().slice(0,35)} <> ${b.textContent?.trim().slice(0,35)}`,String(container.className||''));
    }

    const fields=[...document.querySelectorAll('form .cgx-field,form .field,form .MuiFormControl-root,form .pl-field')].filter(visible);
    for(const [a,b] of overlaps(fields))add('field-overlap',`${String(a.className||'').slice(0,45)} <> ${String(b.className||'').slice(0,45)}`,'form');

    const controls=[...document.querySelectorAll('button,input:not([type="hidden"]),select,textarea,[role="button"]')].filter((node)=>visible(node)&&!node.closest(ignored));
    for(const node of controls){
      const box=rect(node),style=getComputedStyle(node);
      const iconOnly=node.matches('.hf-icon-button,.icon-action-button,.cgx-btn-icon,#btnTema,#btnOpenSidebar,.login-captcha-refresh')||(!node.textContent?.trim()&&node.querySelector('i,svg'));
      const minHeight=mobile?38:30;
      if(box.height<minHeight&&!iconOnly)add('control-height',`${Math.round(box.height)}px < ${minHeight}px`,`${node.tagName.toLowerCase()} ${node.textContent?.trim().slice(0,45)}`);
      if(box.width>width+2)add('control-width',`${Math.round(box.width)}px > viewport`,node.tagName.toLowerCase());
      if(node.matches('button')&&style.whiteSpace==='nowrap'&&node.scrollWidth>node.clientWidth+3)add('button-clipped',`${node.scrollWidth}px > ${node.clientWidth}px`,node.textContent?.trim().slice(0,60));
    }

    const tables=[...document.querySelectorAll('table')].filter(visible);
    for(const table of tables){
      const owner=table.closest(horizontalOwners);
      if(table.scrollWidth > width+2 && !owner)add('table-owner','wide table has no canonical horizontal scroll owner',String(table.className||''));
      if(owner){
        const overflow=getComputedStyle(owner).overflowX;
        if(table.scrollWidth>owner.clientWidth+2&&!['auto','scroll'].includes(overflow))add('table-overflow-policy',`owner overflow-x=${overflow}`,String(owner.className||''));
      }
    }

    const giantText=[...document.querySelectorAll('main *,#pages *')].filter((node)=>{
      if(!visible(node)||node.matches('svg,path,canvas'))return false;
      const size=parseFloat(getComputedStyle(node).fontSize)||0;
      return size>32;
    }).slice(0,10);
    for(const node of giantText)add('giant-text',`${getComputedStyle(node).fontSize}`,`${node.tagName.toLowerCase()} ${node.textContent?.trim().slice(0,50)}`);

    const bodyStyle=getComputedStyle(document.body);
    const bodySize=parseFloat(bodyStyle.fontSize);
    if(bodySize<13||bodySize>16)add('body-font',`${bodySize}px fuera de 13–16px`,'body');
    if(!bodyStyle.fontFamily.toLowerCase().includes('inter'))add('font-family',bodyStyle.fontFamily,'body');

    return {
      route, viewport, issues,
      summary:{ metrics:metrics.length, controls:controls.length, tables:tables.length, fields:fields.length, pageTitles:pageTitles.length }
    };
  }, { route, viewport });
}

async function runMatrix(page, testInfo, routes, viewport) {
  const failures=[];
  let attachments=0;
  for(const route of routes){
    try{
      await openRoute(page, route, viewport);
      const result=await auditGeometry(page, route, viewport);
      if(result.issues.length){
        failures.push(result);
        if(attachments<3){
          attachments+=1;
          await testInfo.attach(`${viewport.width}-${route}.png`, { body:await page.screenshot({ fullPage:true }), contentType:'image/png' });
        }
      }
    }catch(error){
      failures.push({ route, viewport, issues:[{ code:'route-error', detail:String(error?.message||error), selector:'' }] });
    }
  }
  return failures;
}

for(const viewport of [
  { width:768,height:1024 },
  { width:1024,height:768 },
  { width:1440,height:900 }
]){
  test(`all modules deep visual audit @ ${viewport.width}px`, async ({ page }, testInfo) => {
    await seedAuthenticatedUi(page);
    const failures=await runMatrix(page,testInfo,MODULE_VISUAL_CATALOG.map((item)=>item.route),viewport);
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}

for(const viewport of [
  { width:360,height:800 },
  { width:390,height:844 },
  { width:430,height:932 }
]){
  test(`critical modules dense mobile audit @ ${viewport.width}px`, async ({ page }, testInfo) => {
    await seedAuthenticatedUi(page);
    const failures=await runMatrix(page,testInfo,CRITICAL_VISUAL_ROUTES,viewport);
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}

const THEME_GEOMETRY_ROUTES=['dashboard','ventas','contabilidad','admin','pos-sede','veterinaria','psicologia','odontologia','gimnasio'];

test('light/dark changes color, never shared geometry', async ({ page }) => {
  await seedAuthenticatedUi(page);
  const failures=[];
  for(const route of THEME_GEOMETRY_ROUTES){
    await openRoute(page,route,{ width:1440,height:900 });
    const before=await page.evaluate(()=>{
      const nodes=[document.querySelector('.hf-app-main'),document.querySelector('.cgx-page-header'),document.querySelector('.cgx-metric'),document.querySelector('.cgx-section')].filter(Boolean);
      return nodes.map((node)=>{const r=node.getBoundingClientRect();return{w:r.width,h:r.height,x:r.x,y:r.y};});
    });
    const themeButton=page.locator('#btnTema');
    if(await themeButton.count()){
      await themeButton.click();
      await waitForStableLayout(page,'#pages');
      const after=await page.evaluate(()=>{
        const nodes=[document.querySelector('.hf-app-main'),document.querySelector('.cgx-page-header'),document.querySelector('.cgx-metric'),document.querySelector('.cgx-section')].filter(Boolean);
        return nodes.map((node)=>{const r=node.getBoundingClientRect();return{w:r.width,h:r.height,x:r.x,y:r.y};});
      });
      if(before.length!==after.length)failures.push({route,reason:'geometry node count changed',before,after});
      else before.forEach((a,index)=>{
        const b=after[index],delta=Math.max(Math.abs(a.w-b.w),Math.abs(a.h-b.h),Math.abs(a.x-b.x),Math.abs(a.y-b.y));
        if(delta>2.5)failures.push({route,index,reason:`geometry drift ${delta.toFixed(2)}px`,before:a,after:b});
      });
    }
  }
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});
