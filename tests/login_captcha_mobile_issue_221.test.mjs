import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

const login=fs.readFileSync('frontend/src/pages/LoginPage.js','utf8');
const html=fs.readFileSync('frontend/index.html','utf8');
const css=fs.readFileSync('frontend/public/login-hotfix-v162.css','utf8');
const stageBackend=fs.readFileSync('frontend/scripts/stage-backend.mjs','utf8');

function readPackage(path){
  return JSON.parse(fs.readFileSync(path,'utf8'));
}

function responseRecorder(){
  const headers=new Map();
  return{
    statusCode:200,
    body:'',
    headers,
    setHeader(name,value){headers.set(String(name).toLowerCase(),String(value));},
    end(body=''){this.body=String(body);}
  };
}

async function executeFallback(path){
  const url=pathToFileURL(resolve(path));
  url.searchParams.set('issue221',`${Date.now()}-${Math.random()}`);
  const module=await import(url.href);
  assert.equal(typeof module.default,'function',`${path} must export a handler`);
  const res=responseRecorder();
  await module.default({},res);
  return res;
}

test('login is fail-closed until captcha is ready',()=>{
  assert.match(login,/data-captcha-ready="false"/);
  assert.match(login,/setCaptchaReady\(loginForm,false\)/);
  assert.match(login,/form\.dataset\.captchaReady!==['"]true['"]/);
  assert.match(login,/\[data-captcha-token\]/);
  assert.match(login,/submit\?\.setAttribute\(['"]disabled['"],['"]disabled['"]\)/);
  assert.match(login,/if\(form\.dataset\.captchaReady===['"]true['"]\)submit\?\.removeAttribute\(['"]disabled['"]\)/);
  assert.match(login,/Captcha no disponible/i);
});

test('captcha infrastructure errors are converted to user-safe copy',()=>{
  assert.match(login,/FUNCTION_INVOCATION_FAILED\|BACKEND_NOT_STAGED\|server error/i);
  assert.match(login,/servicio de verificación no está disponible/i);
  assert.doesNotMatch(login,/iad1::/);
});

for(const path of ['api/index.js','frontend/api/index.js']){
  test(`${path} is importable and returns a controlled 503 when backend staging is missing`,async()=>{
    const source=fs.readFileSync(path,'utf8');
    assert.doesNotMatch(source,/throw new Error/);

    const res=await executeFallback(path);
    assert.equal(res.statusCode,503);
    assert.equal(res.headers.get('content-type'),'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
    assert.equal(res.headers.get('retry-after'),'60');

    const payload=JSON.parse(res.body);
    assert.deepEqual(payload,{
      ok:false,
      error:'BACKEND_NOT_STAGED',
      message:'El backend de ContaGest no está disponible en este despliegue. Intenta nuevamente en unos minutos.'
    });
    assert.doesNotMatch(res.body,/FUNCTION_INVOCATION_FAILED|Error:|\/home\/|[A-Z]:\\/i);
  });
}

test('root and frontend serverless placeholders stay byte-identical',()=>{
  assert.equal(
    fs.readFileSync('api/index.js','utf8'),
    fs.readFileSync('frontend/api/index.js','utf8'),
    'The two unstaged deployment entrypoints must fail closed identically.'
  );
});

test('workspace and serverless bundle preserve the canonical ContaGest Node 22 runtime',()=>{
  for(const path of ['package.json','frontend/package.json','backend/package.json']){
    assert.equal(readPackage(path).engines?.node,'22.x',`${path} must preserve the project Node 22 runtime`);
  }
  assert.match(stageBackend,/target:\s*['"]node22['"]/);
  assert.doesNotMatch(stageBackend,/target:\s*['"]node24['"]/);
});

test('responsive hotfix is loaded and covers critical mobile widths',()=>{
  assert.match(html,/\/login-hotfix-v162\.css/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/@media\(max-width:380px\)/);
  assert.match(css,/font-size:16px!important/);
  assert.match(css,/min-height:48px/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
