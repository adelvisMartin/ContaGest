import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { waitForRouteReady } from './support/playwright-determinism.mjs';

const BASE=String(process.env.ERP_PRODUCTION_URL||'').replace(/\/$/,'');
const SHA=String(process.env.CANDIDATE_SHA||'').toLowerCase();
const SESSION_RAW=String(process.env.ERP_QA_SESSION_JSON||'');
const WIDTHS=[360,390,430];

function prerequisites(){
  if(!BASE)throw new Error('ERP_PRODUCTION_URL_REQUIRED');
  if(!/^[a-f0-9]{40}$/.test(SHA))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
  if(!SESSION_RAW)throw new Error('ERP_QA_SESSION_JSON_REQUIRED');
  return JSON.parse(SESSION_RAW);
}

function mobileFindings(){
  const root=document.querySelector('#pages');const findings=[];
  if(document.documentElement.scrollWidth>innerWidth+2)findings.push({kind:'document-overflow',scrollWidth:document.documentElement.scrollWidth,innerWidth});
  const visible=(el)=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>1&&r.height>1&&s.display!=='none'&&s.visibility!=='hidden';};
  const owned='.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell,.cgx-table-wrap,.MuiTableContainer-root,.cg-vertical-tabs,.cg-gym-v1124-tabs,.page-tabs,.cgx-tabs';
  for(const el of [...(root?.querySelectorAll('*')||[])].filter(visible)){
    if(el.closest(owned))continue;const r=el.getBoundingClientRect();if(r.left<-2||r.right>innerWidth+2){findings.push({kind:'outside-viewport',tag:el.tagName,className:String(el.className||'').slice(0,80)});if(findings.length>10)break;}
  }
  return findings;
}

test.describe('ERP production mobile #182',()=>{
  test('served build identity matches exact candidate',async({request})=>{
    prerequisites();const response=await request.get(`${BASE}/build-info.json?qa=${Date.now()}`,{headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}});expect(response.ok()).toBeTruthy();const info=await response.json();expect(info.product).toBe('contagest-erp');expect(info.bound).toBe(true);expect(String(info.candidateSha).toLowerCase()).toBe(SHA);
  });

  for(const item of MODULE_VISUAL_CATALOG){
    test(`${item.route} served mobile 360/390/430`,async({page})=>{
      const session=prerequisites();await page.addInitScript((value)=>localStorage.setItem('contagest_auth_session',JSON.stringify(value)),session);
      const failures=[];
      for(const width of WIDTHS){await page.setViewportSize({width,height:width===360?800:width===390?844:932});await page.goto(`${BASE}/?module=${encodeURIComponent(item.route)}`,{waitUntil:'domcontentloaded'});await page.waitForSelector('#pages',{timeout:20_000});await waitForRouteReady(page,item.route,{standalone:item.standalone});const findings=await page.evaluate(mobileFindings);if(findings.length)failures.push({width,findings});}
      expect(failures,JSON.stringify(failures,null,2)).toEqual([]);
    });
  }
});
