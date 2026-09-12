import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const hipico=vercel.headers.find((entry)=>entry.source==='/hipico-control/(.*)');
const globalHeaders=vercel.headers.find((entry)=>entry.source==='/(.*)');

function scopedHeader(scope,name){
  return scope?.headers?.find((item)=>String(item.key).toLowerCase()===name.toLowerCase())?.value||'';
}

function header(name){
  return scopedHeader(hipico,name);
}

test('Control Hípico has an enforced CSP independent from the repo-wide report-only policy',()=>{
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

test('Control Hípico reduces browser permissions while the explicit repo-wide scope retains report-only CSP',()=>{
  assert.equal(header('Referrer-Policy'),'no-referrer');
  assert.equal(header('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()');
  assert.equal(header('Cross-Origin-Resource-Policy'),'same-origin');
  assert.ok(globalHeaders,'ContaGest must retain an explicit repo-wide header scope');
  const globalReportOnly=scopedHeader(globalHeaders,'Content-Security-Policy-Report-Only');
  assert.match(globalReportOnly,/default-src 'self'/);
  assert.match(globalReportOnly,/report-uri \/api\/v1\/security\/csp-report/);
  assert.equal(scopedHeader(globalHeaders,'Content-Security-Policy'),'','repo-wide policy must remain report-only outside the scoped Hípico enforcement');
});
