import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const hipico=vercel.headers.find((entry)=>entry.source==='/hipico-control/(.*)');

function header(name){
  return hipico?.headers?.find((item)=>String(item.key).toLowerCase()===name.toLowerCase())?.value||'';
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

test('Control Hípico reduces browser permissions and cross-origin leakage without changing ContaGest headers',()=>{
  assert.equal(header('Referrer-Policy'),'no-referrer');
  assert.equal(header('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()');
  assert.equal(header('Cross-Origin-Resource-Policy'),'same-origin');
  const global=vercel.headers.find((entry)=>entry.source==='/(.*)');
  assert.ok(global?.headers?.some((item)=>item.key==='Content-Security-Policy-Report-Only'));
});
