export function visualAudit(){
  const root=document.querySelector('#pages')||document.querySelector('.login-shell');
  const allowedOverflow='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.MuiTabs-root,.MuiTabs-scroller,[role="tablist"],.cg-vertical-tabs,.cg-gym-v1124-tabs,.page-tabs,.cgx-tabs,.overflow-x-auto';
  const visible=(el)=>{
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0;
  };
  const findings=[];
  if(!root||!String(root.textContent||'').trim())findings.push({kind:'empty-view'});
  if(document.documentElement.scrollWidth>document.documentElement.clientWidth+2){
    findings.push({kind:'document-overflow',scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth});
  }
  for(const node of [...(root?.querySelectorAll('*')||[])].filter(visible)){
    if(node.closest(allowedOverflow))continue;
    const r=node.getBoundingClientRect();
    if(r.left<-2||r.right>innerWidth+2){
      findings.push({kind:'outside-viewport',tag:node.tagName,left:Math.round(r.left),right:Math.round(r.right),text:String(node.textContent||'').trim().slice(0,80)});
    }
    const text=String(node.textContent||'').trim();
    const interactive=node.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="dialog"]');
    if((text||interactive)&&r.width>0&&r.height>0){
      const left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),topY=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
      if(right>left&&bottom>topY){
        const top=document.elementFromPoint(left+(right-left)/2,topY+(bottom-topY)/2);
        if(top&&!node.contains(top)&&!top.contains(node)&&!node.closest('[aria-hidden="true"]')){
          const positioned=getComputedStyle(top).position;
          if(['fixed','absolute','sticky'].includes(positioned)){
            findings.push({kind:'occluded-center',tag:node.tagName,by:top.tagName,text:text.slice(0,60)});
          }
        }
      }
    }
    if(findings.length>=24)break;
  }
  if(innerWidth<=430){
    for(const control of [...(root?.querySelectorAll('button,[role="button"],input,select,textarea')||[])].filter(visible)){
      const r=control.getBoundingClientRect();
      if(r.height<43.5)findings.push({kind:'touch-height',height:Math.round(r.height),text:String(control.getAttribute('aria-label')||control.textContent||'').trim().slice(0,60)});
      if(findings.length>=24)break;
    }
  }
  return findings;
}

export async function auditKeyboardFocus(page){
  const issues=[];
  for(let index=0;index<12;index+=1){
    await page.keyboard.press('Tab');
    const state=await page.evaluate(()=>{
      const el=document.activeElement;
      if(!el||el===document.body)return null;
      const r=el.getBoundingClientRect();
      return {tag:el.tagName,text:String(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,80),left:r.left,right:r.right,visible:r.width>1&&r.height>1};
    });
    const width=page.viewportSize()?.width||0;
    if(state&&(!state.visible||state.left<-2||state.right>width+2))issues.push({kind:'focus-clipped',...state});
  }
  return issues;
}

export async function auditOptionalDialog(page){
  const triggers=page.getByRole('button',{name:/nuevo|nueva|crear|agregar|registrar/i});
  for(let index=0;index<await triggers.count();index+=1){
    const trigger=triggers.nth(index);
    if(!(await trigger.isVisible().catch(()=>false))||!(await trigger.isEnabled().catch(()=>false)))continue;
    await trigger.click({timeout:5_000}).catch(()=>undefined);
    const dialog=page.getByRole('dialog').first();
    if(!(await dialog.count())||!(await dialog.isVisible().catch(()=>false)))return [];
    const box=await dialog.boundingBox(),viewport=page.viewportSize(),issues=[];
    if(box&&viewport&&(box.x<-2||box.x+box.width>viewport.width+2||box.y<-2||box.y+box.height>viewport.height+2)){
      issues.push({kind:'dialog-clipped',box,viewport});
    }
    await page.keyboard.press('Escape');
    return issues;
  }
  return [];
}
