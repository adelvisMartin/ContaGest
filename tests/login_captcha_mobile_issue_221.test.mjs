import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const login=fs.readFileSync('frontend/src/pages/LoginPage.js','utf8');
const apiFallback=fs.readFileSync('api/index.js','utf8');
const html=fs.readFileSync('frontend/index.html','utf8');
const css=fs.readFileSync('frontend/public/login-hotfix-v162.css','utf8');

test('login is fail-closed until captcha is ready',()=>{
  assert.match(login,/data-captcha-ready="false"/);
  assert.match(login,/setCaptchaReady\(loginForm,false\)/);
  assert.match(login,/form\.dataset\.captchaReady!==['"]true['"]/);
  assert.match(login,/\[data-captcha-token\]/);
  assert.match(login,/submit\?\.setAttribute\(['"]disabled['"],['"]disabled['"]\)/);
  assert.match(login,/if\(form\.dataset\.captchaReady===['"]true['"]\)submit\?\.removeAttribute\(['"]disabled['"]\)/);
});

test('captcha infrastructure errors are converted to user-safe copy',()=>{
  assert.match(login,/FUNCTION_INVOCATION_FAILED\|BACKEND_NOT_STAGED\|server error/i);
  assert.match(login,/servicio de verificación no está disponible/i);
  assert.doesNotMatch(login,/iad1::/);
});

test('unstaged api placeholder returns structured 503 instead of throwing on import',()=>{
  assert.doesNotMatch(apiFallback,/throw new Error/);
  assert.match(apiFallback,/statusCode=503/);
  assert.match(apiFallback,/BACKEND_NOT_STAGED/);
  assert.match(apiFallback,/Cache-Control/);
});

test('responsive hotfix is loaded and covers critical mobile widths',()=>{
  assert.match(html,/\/login-hotfix-v162\.css/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/@media\(max-width:380px\)/);
  assert.match(css,/font-size:16px!important/);
  assert.match(css,/min-height:48px/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
