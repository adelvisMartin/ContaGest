import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';

test.setTimeout(360_000);
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

const QA_SESSION={
  sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
  tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
  user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
  audience:'staff',expiresAt:Date.now()+8*60*60*1000
};

async function seed(page){
  await page.addInitScript((session)=>localStorage.setItem('contagest_auth_session',JSON.stringify(session)),QA_SESSION);
  await page.route('**/api/v1/auth/me',async(route)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,data:QA_SESSION})}));
}

async function openRoute(page,route){
  await page.goto(`/?module=${route}`,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#pages',{state:'attached',timeout:20_000});
  await page.waitForTimeout(route==='veterinaria'?420:130);
}

async function auditMobile(page,route){
  return page.evaluate((activeRoute)=>{
    const width=innerWidth;
    const visible=(node)=>{
      if(!(node instanceof HTMLElement))return false;
      const style=getComputedStyle(node),r=node.getBoundingClientRect();
      return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&r.width>1&&r.height>1;
    };
    const intentionalScroll='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.MuiTabs-scroller,.hf-command-results,#mainMenu,.cg-psychology-workspace .cgx-section-body:has(>.cg-psych-calendar),.cg-kanban,.hf-gym-tabs,.cg-gym-v1124-tabs,.cg-pos-tabs';
    const ignoredOffcanvas='.hf-sidebar,#sidebarBackdrop,.hf-command-layer,.MuiPopover-root,.MuiModal-root,.cg-modal-backdrop';
    const offenders=[...document.querySelectorAll('body *')].filter(visible).filter((node)=>{
      if(node.closest(intentionalScroll)||node.closest(ignoredOffcanvas))return false;
      const r=node.getBoundingClientRect();
      return r.left<-2||r.right>width+2;
    }).slice(0,12).map((node)=>{const r=node.getBoundingClientRect();return{tag:node.tagName.toLowerCase(),id:node.id||'',className:String(node.className||'').slice(0,100),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};});

    const targetFindings=[];
    const interactive=[...document.querySelectorAll('button,summary,a[href],input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,textarea')].filter(visible);
    for(const node of interactive){
      if(node.closest('.MuiMenu-list,.MuiPopover-root'))continue;
      const r=node.getBoundingClientRect();
      const style=getComputedStyle(node);
      const isTextLink=node.matches('a[href]')&&!node.classList.contains('cg-whatsapp-float')&&style.display==='inline';
      if(isTextLink)continue;
      if(r.height<43.5)targetFindings.push({kind:'short-target',tag:node.tagName.toLowerCase(),id:node.id||'',label:String(node.getAttribute('aria-label')||node.textContent||node.getAttribute('placeholder')||'').trim().slice(0,70),h:Math.round(r.height*10)/10,w:Math.round(r.width*10)/10});
      if((node.matches('button,summary,a[href]')||node.getAttribute('role')==='button')&&r.width<43.5&&!(node.textContent||'').trim())targetFindings.push({kind:'narrow-icon-target',tag:node.tagName.toLowerCase(),id:node.id||'',label:node.getAttribute('aria-label')||'',h:Math.round(r.height*10)/10,w:Math.round(r.width*10)/10});
    }

    const intersection=(a,b)=>({x:Math.min(a.right,b.right)-Math.max(a.left,b.left),y:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)});
    const overlapFindings=[];
    const clickables=[...document.querySelectorAll('button,summary,a[href],input,select,textarea')].filter(visible);
    for(let i=0;i<clickables.length;i+=1){
      for(let j=i+1;j<clickables.length;j+=1){
        const a=clickables[i],b=clickables[j];
        if(a.contains(b)||b.contains(a))continue;
        if(a.closest('.hf-sidebar')!==b.closest('.hf-sidebar'))continue;
        const hit=intersection(a.getBoundingClientRect(),b.getBoundingClientRect());
        if(hit.x>3&&hit.y>3){overlapFindings.push({a:(a.id||a.className||a.tagName).toString().slice(0,80),b:(b.id||b.className||b.tagName).toString().slice(0,80),x:Math.round(hit.x),y:Math.round(hit.y)});if(overlapFindings.length>=10)break;}
      }
      if(overlapFindings.length>=10)break;
    }

    const clippedButtons=[...document.querySelectorAll('button')].filter(visible).filter((node)=>{
      const style=getComputedStyle(node);
      return style.whiteSpace==='nowrap'&&node.scrollWidth>node.clientWidth+3;
    }).slice(0,10).map((node)=>({id:node.id||'',label:String(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,80),scroll:node.scrollWidth,client:node.clientWidth}));

    const actionSymmetry=[];
    document.querySelectorAll('.cgx-page-actions,.cgx-section-actions,.cg-form-actions,.cg-record-actions,.cg-row-actions').forEach((group)=>{
      if(!visible(group))return;
      const items=[...group.children].filter(visible).map((node)=>node.getBoundingClientRect().height);
      if(items.length>1&&Math.max(...items)-Math.min(...items)>4)actionSymmetry.push({className:String(group.className),heights:items.map((v)=>Math.round(v))});
    });

    return{
      route:activeRoute,
      viewport:width,
      documentWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,
      offenders,
      targetFindings:targetFindings.slice(0,16),
      overlapFindings,
      clippedButtons,
      actionSymmetry
    };
  },route);
}

function rgb(value){const m=String(value||'').match(/rgba?\((\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)\s*,?\s*(\d+(?:\.\d+)?)/);return m?[Number(m[1]),Number(m[2]),Number(m[3])]:null;}
function luminance(c){const s=c.map((v)=>v/255).map((v)=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*s[0]+.7152*s[1]+.0722*s[2];}
function contrast(a,b){const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}

async function primaryContrast(page){
  return page.evaluate(()=>{
    const visible=(node)=>{if(!(node instanceof HTMLElement))return false;const s=getComputedStyle(node),r=node.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>1&&r.height>1;};
    const samples=[...document.querySelectorAll('.cgx-btn-primary,.btn-primary,.MuiButton-containedPrimary')].filter(visible).slice(0,10).map((node)=>{const s=getComputedStyle(node);return{label:String(node.textContent||node.getAttribute('aria-label')||'').trim().slice(0,60),color:s.color,background:s.backgroundColor};});
    return samples;
  });
}

test('all registered modules remain touch-safe, symmetric and inside a 390px viewport',async({page})=>{
  await seed(page);
  const failures=[];
  for(const item of MODULE_VISUAL_CATALOG){
    if(item.route==='login')continue;
    const pageErrors=[];
    const onError=(error)=>pageErrors.push(String(error?.message||error));
    page.on('pageerror',onError);
    try{
      await openRoute(page,item.route);
      const audit=await auditMobile(page,item.route);
      if(audit.documentWidth>391||audit.bodyWidth>391||audit.offenders.length||audit.targetFindings.length||audit.overlapFindings.length||audit.clippedButtons.length||audit.actionSymmetry.length||pageErrors.length){failures.push({...audit,pageErrors});}
    }catch(error){failures.push({route:item.route,error:String(error?.message||error),pageErrors});}
    finally{page.off('pageerror',onError);}
  }
  console.log(`[mobile-deep-v162] rutas=${MODULE_VISUAL_CATALOG.filter((item)=>item.route!=='login').length} fallos=${failures.length}`);
  expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
});

test('mobile shell controls work and primary action contrast stays readable in light/dark',async({page})=>{
  await seed(page);
  await openRoute(page,'dashboard');

  for(const selector of ['#btnOpenSidebar','#btnCommandPalette','#btnTema','#btnUserMenu']){
    await expect(page.locator(selector)).toBeVisible();
    const box=await page.locator(selector).boundingBox();
    expect(box?.height||0,selector).toBeGreaterThanOrEqual(43.5);
    expect(box?.width||0,selector).toBeGreaterThanOrEqual(43.5);
  }

  await page.locator('#btnOpenSidebar').click();
  await expect(page.locator('body')).toHaveClass(/cg-menu-open/);
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#sidebarBackdrop').click({position:{x:385,y:420}});
  await expect(page.locator('body')).not.toHaveClass(/cg-menu-open/);

  await page.locator('#btnCommandPalette').click();
  await expect(page.locator('#commandPalette')).toBeVisible();
  await page.locator('[data-command-close]').last().click();
  await expect(page.locator('#commandPalette')).toBeHidden();

  await page.locator('#btnUserMenu').click();
  await expect(page.locator('#userMenuPanel')).toBeVisible();
  await expect(page.locator('#userMenuPanel')).toHaveCSS('max-height',/./);
  await page.keyboard.press('Escape');
  await expect(page.locator('#userMenuPanel')).toBeHidden();

  const validateContrast=async()=>{
    const samples=await primaryContrast(page);
    for(const sample of samples){
      const fg=rgb(sample.color),bg=rgb(sample.background);
      if(!fg||!bg)continue;
      expect(contrast(fg,bg),JSON.stringify(sample)).toBeGreaterThanOrEqual(4.5);
    }
  };
  await validateContrast();
  await page.locator('#btnTema').click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await validateContrast();
});