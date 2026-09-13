import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootVercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const frontendVercel=JSON.parse(readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));
const hipico=rootVercel.headers.find((entry)=>entry.source==='/hipico-control/(.*)');
const rootGlobal=rootVercel.headers.find((entry)=>entry.source==='/(.*)');
const frontendGlobal=frontendVercel.headers.find((entry)=>entry.source==='/(.*)');

function scopedHeader(scope,name){
  return scope?.headers?.find((item)=>String(item.key).toLowerCase()===name.toLowerCase())?.value||'';
}

function header(name){
  return scopedHeader(hipico,name);
}

function globalCsp(scope){
  return scopedHeader(scope,'Content-Security-Policy')||scopedHeader(scope,'Content-Security-Policy-Report-Only');
}

test('Control Hípico has an enforced CSP independent from the repo-wide policy',()=>{
  assert.ok(hipico,'missing scoped Control Hípico headers');
  const csp=header('Content-Security-Policy');
  assert.match(csp,/default-src 'self'/);
  assert.match(csp,/script-src 'self'/);
  assert.match(csp,/script-src-attr 'none'/);
  assert.match(csp,/object-src 'none'/);
  assert.match(csp,/frame-ancestors 'none'/);
  assert.match(csp,/frame-src 'none'/);
  assert.match(csp,/worker-src 'self' blob:/);
  assert.match(csp,/connect-src 'self' https: wss:/);
  assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(csp,/script-src[^;]*https:/);
});

test('Control Hípico reduces browser permissions while both Vercel entry configs retain explicit repo-wide CSP',()=>{
  assert.equal(header('Referrer-Policy'),'no-referrer');
  assert.equal(header('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()');
  assert.equal(header('Cross-Origin-Resource-Policy'),'same-origin');

  assert.ok(rootGlobal,'repository config must retain an explicit repo-wide header scope');
  assert.ok(frontendGlobal,'frontend Vercel project must retain an explicit repo-wide header scope');
  for(const [label,scope] of [['repository',rootGlobal],['frontend',frontendGlobal]]){
    const csp=globalCsp(scope);
    assert.match(csp,/default-src 'self'/,`${label} repo-wide CSP must deny unknown origins by default`);
    assert.match(csp,/object-src 'none'/,`${label} repo-wide CSP must disable plugins`);
    assert.match(csp,/frame-ancestors 'none'/,`${label} repo-wide CSP must prevent framing`);
  }

  const rootReportOnly=scopedHeader(rootGlobal,'Content-Security-Policy-Report-Only');
  if(rootReportOnly){
    assert.match(rootReportOnly,/report-uri \/api\/v1\/security\/csp-report/);
    assert.equal(scopedHeader(rootGlobal,'Content-Security-Policy'),'','repository-wide rollout stays report-only when that mode is configured');
  }

  const deployedCsp=scopedHeader(frontendGlobal,'Content-Security-Policy');
  assert.match(deployedCsp,/default-src 'self'/,'the actual frontend Vercel project must enforce its repo-wide CSP');
});
