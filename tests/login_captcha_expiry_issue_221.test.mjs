import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const auth=fs.readFileSync(new URL('../frontend/src/services/authService.js',import.meta.url),'utf8');
const enhancer=fs.readFileSync(new URL('../frontend/src/services/loginEnhancer.js',import.meta.url),'utf8');
const browser=fs.readFileSync(new URL('../qa/login-captcha-v221.spec.mjs',import.meta.url),'utf8');

test('#221 rejects stale CAPTCHA metadata before the login page can enable it',()=>{
  assert.match(auth,/captchaExpiryMillis/);
  assert.match(auth,/expiresAt<=Date\.now\(\)/);
  assert.match(auth,/cg:captcha-challenge/);
  assert.match(auth,/detail:\{expiresAt\}/);
  assert.doesNotMatch(auth,/detail:\{token:/,'global CAPTCHA event must not broadcast the signed token');
});

test('#221 login enhancer invalidates expired tokens and guards submit in capture phase',()=>{
  assert.match(enhancer,/captchaExpiryTimer/);
  assert.match(enhancer,/invalidateCaptcha/);
  assert.match(enhancer,/delete form\.dataset\.captchaExpiresAt/);
  assert.match(enhancer,/event\.stopImmediatePropagation\(\)/);
  assert.match(enhancer,/addEventListener\('submit',[\s\S]*true\)/);
  assert.match(enhancer,/if\(!captchaUsable\(form\)\)setCaptchaReady\(form,false\)/);
});

test('#221 challenge listener exists before deferred DOMContentLoaded startup',()=>{
  const install=enhancer.slice(enhancer.indexOf('export function installLoginEnhancer'));
  const listenerIndex=install.indexOf("window.addEventListener('cg:captcha-challenge'");
  const startIndex=install.indexOf('const start');
  assert.ok(listenerIndex>=0&&listenerIndex<startIndex,'CAPTCHA metadata listener must be installed before deferred DOM setup');
  assert.match(install,/captchaListenerInstalled=true/);
});

test('#221 browser regression covers expiry, stale server challenge and refresh recovery',()=>{
  assert.match(browser,/loaded challenge expires fail-closed/);
  assert.match(browser,/already expired challenge from the server never becomes usable/);
  assert.match(browser,/Reto expirado/);
  assert.match(browser,/manual refresh recovers without page reload/);
});
