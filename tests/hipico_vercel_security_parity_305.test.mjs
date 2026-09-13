import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const rootConfig=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const frontendConfig=JSON.parse(readFileSync(new URL('../frontend/vercel.json',import.meta.url),'utf8'));

function scoped(config){
  return config.headers?.find((entry)=>entry.source==='/hipico-control/(.*)')||null;
}
function scopedPath(config,source){
  return config.headers?.find((entry)=>entry.source===source)||null;
}
function header(entry,name){
  return entry?.headers?.find((item)=>String(item.key).toLowerCase()===name.toLowerCase())?.value||'';
}
function redirect(config,src){
  return config.routes?.find((entry)=>entry.src===src)||null;
}

test('the Vercel frontend project enforces the same Control Hipico security boundary as the repository deployment config',()=>{
  const expected=scoped(rootConfig);
  const deployed=scoped(frontendConfig);
  assert.ok(expected,'repository config must define scoped Control Hipico headers');
  assert.ok(deployed,'frontend Vercel project must define scoped Control Hipico headers');
  for(const name of ['Content-Security-Policy','Referrer-Policy','Permissions-Policy','Cross-Origin-Resource-Policy']){
    assert.equal(header(deployed,name),header(expected,name),`${name} must not drift between Vercel project configs`);
  }
  const csp=header(deployed,'Content-Security-Policy');
  assert.match(csp,/script-src 'self'/);
  assert.match(csp,/script-src-attr 'none'/);
  assert.match(csp,/frame-src 'none'/);
  assert.doesNotMatch(csp,/script-src[^;]*'unsafe-inline'/);
  assert.equal(header(deployed,'Referrer-Policy'),'no-referrer');
});

test('exact-SHA runtime metadata is explicitly no-store in both Vercel entry configs',()=>{
  for(const config of [rootConfig,frontendConfig]){
    for(const source of ['/hipico-control/build-info.json','/hipico-control/runtime-config.js']){
      const entry=scopedPath(config,source);
      assert.ok(entry,`missing runtime metadata cache policy for ${source}`);
      assert.match(header(entry,'Cache-Control'),/(?:^|,)\s*no-store(?:,|$)/i);
    }
  }
});

test('legacy Control Hipico URLs redirect consistently in the frontend Vercel project before SPA fallback',()=>{
  for(const src of ['/control-hipico','/control-hipico/(.*)']){
    const expected=redirect(rootConfig,src);
    const deployed=redirect(frontendConfig,src);
    assert.ok(expected,`repository config missing ${src}`);
    assert.ok(deployed,`frontend project missing ${src}`);
    assert.equal(deployed.status,308);
    assert.deepEqual(deployed.headers,expected.headers);
    const redirectIndex=frontendConfig.routes.indexOf(deployed);
    const filesystemIndex=frontendConfig.routes.findIndex((entry)=>entry.handle==='filesystem');
    assert.ok(redirectIndex>=0&&filesystemIndex>redirectIndex,'redirect must run before filesystem/SPA fallback');
  }
});
