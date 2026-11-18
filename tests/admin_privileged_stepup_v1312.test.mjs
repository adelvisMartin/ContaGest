import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const backend=read('backend/src/modules/user-security/user-security.routes.ts');
const frontend=read('frontend/src/services/adminUserSecurityEnhancer.js');
const css=read('frontend/src/styles/contagest-visual-system-v12.css');

test('#1312 step-up validates the actor password before any privileged mutation',()=>{
  assert.match(backend,/currentPassword: z\.string\(\)\.min\(1\)\.max\(128\)\.optional\(\)/);
  assert.match(backend,/await bcrypt\.compare\(body\.currentPassword,actor\.passwordHash\)/);
  assert.match(backend,/where:\{ id:currentUserId, tenantId:id, status:'active' \}/);
  const auth=backend.indexOf('const actor = await prisma.userProfile.findFirst');
  const mutation=backend.indexOf('await prisma.$transaction(async (tx)');
  assert.ok(auth>=0&&mutation>auth,'Step-up must occur before side effects');
  assert.match(backend,/code:'ADMIN_REAUTH_REQUIRED'/);
  assert.match(backend,/router\.patch\('\/users\/:userId', authRateLimit,/);
  const transaction=backend.slice(mutation);
  assert.doesNotMatch(transaction,/after:\s*\{[^}]*currentPassword\s*:/s);
  assert.match(transaction,/await tx\.auditLog\.create/);
});

test('#1312 admin UI has an accessible current-password input with theme and focus state',()=>{
  assert.match(frontend,/data-security-confirm-password type="password" autocomplete="current-password"/);
  assert.match(frontend,/aria-describedby="cgSecurityStepupHelp"/);
  assert.match(frontend,/data-security-status aria-live="polite"/);
  assert.match(css,/\.cg-security-reauth input:focus-visible/);
  assert.match(css,/@media \(max-width:720px\)/);
});

function makeUiHarness({password='',requestFails=false}={}){
  const a=frontend.indexOf('async function saveRow(');
  const b=frontend.indexOf('function bindRows(',a);
  assert.ok(a>=0&&b>a,'UI row mutation owner');
  const events=[];
  const passwordField={value:password,focus:()=>events.push('focus-password')};
  const button={disabled:false};
  const section={querySelector:(key)=>key==='[data-security-confirm-password]'?passwordField:null};
  const rowNode={
    dataset:{securityUserRow:'target-1'},
    querySelector:(key)=>({
      '[data-security-active]':{checked:true},
      '[data-security-role]':{value:'role-1'},
      '[data-security-password]':{value:''}
    }[key]),
    querySelectorAll:()=>[button]
  };
  const context={
    BackendApi:{request:async(path,options)=>{
      events.push({path,body:options.body});
      if(requestFails)throw new Error('Synthetic network failure');
    }},
    setStatus:(_section,message,tone)=>events.push({message,tone}),
    load:async()=>events.push('reloaded')
  };
  const saveRow=vm.runInNewContext(frontend.slice(a,b)+'\nsaveRow',context);
  return{run:()=>saveRow(section,rowNode),events,passwordField,button};
}

test('#1312 UI refuses changes without reauth and focuses password control',async()=>{
  const h=makeUiHarness();
  await h.run();
  assert.deepEqual(h.events,['focus-password',{message:'Confirma tu contraseña actual de administrador para autorizar el cambio.',tone:'error'}].reverse());
  assert.equal(h.events.some(x=>typeof x==='object'&&x.path),false);
});

test('#1312 UI sends step-up credential only for PATCH and clears input on success',async()=>{
  const h=makeUiHarness({password:'synthetic-current-password'});
  await h.run();
  const call=h.events.find(x=>x?.path);
  assert.equal(call.path,'/user-security/users/target-1');
  assert.equal(call.body.currentPassword,'synthetic-current-password');
  assert.equal(h.passwordField.value,'');
  assert.equal(h.button.disabled,false);
  assert.ok(h.events.includes('reloaded'));
});

test('#1312 UI clears password after rejected server request',async()=>{
  const h=makeUiHarness({password:'synthetic-current-password',requestFails:true});
  await h.run();
  assert.equal(h.passwordField.value,'');
  assert.equal(h.button.disabled,false);
  assert.ok(h.events.some(x=>x?.tone==='error'));
});
