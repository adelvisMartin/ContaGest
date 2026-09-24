import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

test.setTimeout(300_000);

async function seed(page,theme){
  await page.addInitScript(({theme})=>{
    localStorage.setItem('contagest_auth_session',JSON.stringify({
      sessionMode:'cookie',mode:'cookie',tenantId:'qa-tenant',
      tenant:{id:'qa-tenant',name:'ContaGest QA',rif:'J-00000000-0',plan:'enterprise'},
      user:{id:'qa-admin',name:'QA Admin',fullName:'QA Admin',email:'qa@contagest.local',role:'admin',permissions:['*']},
      audience:'staff',expiresAt:Date.now()+8*60*60*1000
    }));
    const stateKey='contagest_ve_enterprise_v7_state';
    const current=JSON.parse(localStorage.getItem(stateKey)||'{}');
    current.settings={...(current.settings||{}),theme};
    localStorage.setItem(stateKey,JSON.stringify(current));
  },{theme});
}

function routeUrl(route){return `/?module=${encodeURIComponent(route)}`;}

async function contrastIssues(page,route,theme){
  return page.evaluate(({route,theme})=>{
    const issues=[];
    const parse=(value)=>{
      const match=String(value||'').match(/rgba?\((\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)[, ]+(\d+(?:\.\d+)?)(?:[, /]+(\d+(?:\.\d+)?))?\)/i);
      if(!match)return null;
      return {r:Number(match[1]),g:Number(match[2]),b:Number(match[3]),a:match[4]===undefined?1:Number(match[4])};
    };
    const luminance=({r,g,b})=>{
      const channel=(v)=>{const n=v/255;return n<=.03928?n/12.92:((n+.055)/1.055)**2.4;};
      return .2126*channel(r)+.7152*channel(g)+.0722*channel(b);
    };
    const ratio=(a,b)=>{const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);};
    const visible=(node)=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0&&r.width>1&&r.height>1;};
    const backgroundFor=(node)=>{
      let current=node;
      while(current&&current!==document.documentElement){
        const parsed=parse(getComputedStyle(current).backgroundColor);
        if(parsed&&parsed.a>.96)return parsed;
        current=current.parentElement;
      }
      return parse(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1};
    };
    const selector='h1,h2,h3,h4,p,small,label,th,td,button,a,.cgx-badge,.hf-menu-item,.cg-area-toggle,.hf-header-context,.cgx-metric-main strong,.cgx-metric-main p';
    const nodes=[...document.querySelectorAll(selector)].filter(visible).filter((node)=>!node.closest('.hf-command-layer.hidden,.hidden,[aria-hidden="true"]'));
    for(const node of nodes){
      const style=getComputedStyle(node);
      const color=parse(style.color),bg=backgroundFor(node);
      if(!color||color.a<.96||!bg)continue;
      const fontSize=parseFloat(style.fontSize)||13;
      const weight=Number(style.fontWeight)||400;
      const large=fontSize>=18.66||(fontSize>=14&&weight>=700);
      const required=large?3:4.5;
      const actual=ratio(color,bg);
      if(actual+0.05<required){
        issues.push({
          text:String(node.textContent||'').trim().replace(/\s+/g,' ').slice(0,80),
          selector:`${node.tagName.toLowerCase()}${node.id?`#${node.id}`:''}.${String(node.className||'').trim().replace(/\s+/g,'.').slice(0,80)}`,
          ratio:Number(actual.toFixed(2)),required,fontSize,weight,color:style.color,background:`rgb(${bg.r}, ${bg.g}, ${bg.b})`
        });
      }
      if(issues.length>=20)break;
    }
    return {route,theme,issues};
  },{route,theme});
}

for(const theme of ['light','dark']){
  test(`v15 text contrast across 58 routes · ${theme}`,async({page},testInfo)=>{
    await seed(page,theme);
    const failures=[];
    let screenshots=0;
    for(const item of MODULE_VISUAL_CATALOG){
      await page.goto(routeUrl(item.route),{waitUntil:'domcontentloaded'});
      await page.waitForSelector(item.route==='login'?'.login-shell':'#pages',{state:'attached',timeout:15_000});
      await waitForRouteReady(page,item.route,{standalone:item.route==='login'});
      const result=await contrastIssues(page,item.route,theme);
      if(result.issues.length){
        failures.push(result);
        if(screenshots<3){screenshots++;await testInfo.attach(`${theme}-${item.route}-contrast.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});}
      }
    }
    expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
  });
}
