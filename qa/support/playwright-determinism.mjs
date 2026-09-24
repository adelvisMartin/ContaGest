export async function waitForStableLayout(page, selector='body'){
  await page.evaluate(async(targetSelector)=>{
    if(document.fonts?.ready)await document.fonts.ready;
    const target=document.querySelector(targetSelector)||document.body;
    let previous='';
    let stableFrames=0;
    for(let frame=0;frame<12&&stableFrames<2;frame+=1){
      await new Promise(requestAnimationFrame);
      const rect=target.getBoundingClientRect();
      const signature=[
        Math.round(rect.x*10)/10,
        Math.round(rect.y*10)/10,
        Math.round(rect.width*10)/10,
        Math.round(rect.height*10)/10,
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight
      ].join(':');
      stableFrames=signature===previous?stableFrames+1:0;
      previous=signature;
    }
  },selector);
}

export async function waitForRouteReady(page, route, options={}){
  const standalone=options.standalone??route==='login';
  const rootSelector=options.rootSelector||(standalone?'.login-shell':'#pages');
  await page.waitForSelector(rootSelector,{state:'attached',timeout:20_000});
  await page.waitForFunction(({expectedRoute,selector,isStandalone})=>{
    const root=document.querySelector(selector);
    if(!root||!String(root.textContent||'').trim())return false;
    if(document.body?.dataset?.route!==expectedRoute)return false;
    if(!isStandalone&&document.querySelector('#pages')?.dataset?.renderedRoute!==expectedRoute)return false;
    return true;
  },{expectedRoute:route,selector:rootSelector,isStandalone:standalone},{timeout:20_000});
  await waitForStableLayout(page,rootSelector);
}

export async function waitForThemeChange(page, previousTheme){
  await page.waitForFunction((before)=>{
    const current=document.documentElement.getAttribute('data-theme')||'';
    return Boolean(current)&&current!==before;
  },previousTheme,{timeout:5_000});
  await waitForStableLayout(page,'body');
}
