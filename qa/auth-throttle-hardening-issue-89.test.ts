import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../backend/src/app.ts';
import { prisma } from '../backend/src/database/prisma.ts';
import { getLoginThrottleState } from '../backend/src/modules/auth/auth.throttle.ts';

const RUN=`AUTH89-HARDEN-${Date.now().toString(36).toUpperCase()}`;
const RIF=`J-${RUN}`;
const EMAIL=`known.${RUN.toLowerCase()}@qa.local`;
const UNKNOWN_EMAIL=`missing.${RUN.toLowerCase()}@qa.local`;
const SHARED_IP_A=`shared-a.${RUN.toLowerCase()}@qa.local`;
const SHARED_IP_B=`shared-b.${RUN.toLowerCase()}@qa.local`;
const PASSWORD='Qa89-hardening-valid-password!';
const WRONG_PASSWORD='Qa89-hardening-wrong-password!';
const OLD_RIF=`J-${RUN}-OLD`;

function unwrap(payload:any){return payload?.data ?? payload;}
function solve(question:string){
  const match=String(question).match(/^(\d+)\s*([+\-×])\s*(\d+)$/);
  assert.ok(match,`Unexpected CAPTCHA question: ${question}`);
  const left=Number(match[1]),right=Number(match[3]);
  return String(match[2]==='+'?left+right:match[2]==='-'?left-right:left*right);
}
async function captcha(base:string,ip:string){
  const response=await fetch(`${base}/api/v1/auth/captcha`,{headers:{'x-forwarded-for':ip}});
  assert.equal(response.status,200);
  const payload=unwrap(await response.json());
  return{captchaToken:String(payload.token),captchaAnswer:solve(String(payload.question))};
}
async function login(base:string,input:{tenantRif:string;email:string;password:string;ip:string}){
  const challenge=await captcha(base,input.ip);
  const started=performance.now();
  const response=await fetch(`${base}/api/v1/auth/login`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-forwarded-for':input.ip,
      'x-request-id':`req-auth89-hardening-${Math.random().toString(36).slice(2)}`
    },
    body:JSON.stringify({tenantRif:input.tenantRif,email:input.email,password:input.password,...challenge})
  });
  const elapsedMs=performance.now()-started;
  const payload=await response.json().catch(()=>({}));
  return{response,payload,elapsedMs};
}
function fakeReq(tenantRif:string,email:string,ip='10.89.92.1'){
  return{body:{tenantRif,email},ip,requestId:'req-auth89-hardening-state'};
}

test('issue #89 hardening: enumeration parity, retention and account isolation from shared IP',async(t)=>{
  assert.equal(String(process.env.NODE_ENV||'').toLowerCase(),'test');

  // Store the tenant with legacy lowercase casing; login uses canonical uppercase RIF.
  const tenant=await prisma.tenant.create({
    data:{rif:RIF.toLowerCase(),name:`${RUN} Tenant`,legalName:`${RUN} Tenant`,plan:'qa',status:'active',settings:{}}
  });
  const passwordHash=await bcrypt.hash(PASSWORD,12);
  const [user,sharedA,sharedB]=await Promise.all([
    prisma.userProfile.create({data:{tenantId:tenant.id,email:EMAIL,fullName:'QA Auth 89 Hardening',passwordHash,status:'active'}}),
    prisma.userProfile.create({data:{tenantId:tenant.id,email:SHARED_IP_A,fullName:'QA Auth 89 Shared IP A',passwordHash,status:'active'}}),
    prisma.userProfile.create({data:{tenantId:tenant.id,email:SHARED_IP_B,fullName:'QA Auth 89 Shared IP B',passwordHash,status:'active'}})
  ]);
  const oldAttempt=await prisma.authLoginAttempt.create({
    data:{
      tenantRif:OLD_RIF,
      email:`old.${RUN.toLowerCase()}@qa.local`,
      ipAddress:'10.89.90.1',
      success:false,
      createdAt:new Date(Date.now()-8*24*60*60*1000)
    }
  });

  const app=createApp();
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;

  t.after(async()=>{
    await new Promise<void>((resolve)=>server.close(()=>resolve()));
    await prisma.authLoginAttempt.deleteMany({where:{tenantRif:{in:[RIF,OLD_RIF,`${RIF}-MISSING`]}}}).catch(()=>undefined);
    await prisma.userProfile.deleteMany({where:{id:{in:[user.id,sharedA.id,sharedB.id]}}}).catch(()=>undefined);
    await prisma.tenant.deleteMany({where:{id:tenant.id}}).catch(()=>undefined);
  });

  const unknownTenant=await login(base,{
    tenantRif:`${RIF}-MISSING`,email:UNKNOWN_EMAIL,password:WRONG_PASSWORD,ip:'10.89.91.1'
  });
  assert.equal(unknownTenant.response.status,401);
  assert.equal(unknownTenant.payload?.message,'Credenciales incorrectas.');

  const oldAfterFailure=await prisma.authLoginAttempt.findUnique({where:{id:oldAttempt.id}});
  assert.equal(oldAfterFailure,null,'retention cleanup must run even when traffic never authenticates successfully');

  const unknownUser=await login(base,{
    tenantRif:RIF,email:UNKNOWN_EMAIL,password:WRONG_PASSWORD,ip:'10.89.91.2'
  });
  const wrongPassword=await login(base,{
    tenantRif:RIF,email:EMAIL,password:WRONG_PASSWORD,ip:'10.89.91.3'
  });

  for(const result of [unknownUser,wrongPassword]){
    assert.equal(result.response.status,unknownTenant.response.status);
    assert.equal(result.payload?.message,unknownTenant.payload?.message);
    assert.doesNotMatch(JSON.stringify(result.payload),/Quedan|bloquead[oa]|deshabilitad[oa]|existe|usuario/i);
  }

  // Coarse guard only: all non-throttled invalid-credential paths must pay real
  // password-comparison work. This intentionally avoids brittle relative timing assertions.
  for(const result of [unknownTenant,unknownUser,wrongPassword]){
    assert.ok(result.elapsedMs>=10,`invalid credential path completed suspiciously fast: ${result.elapsedMs.toFixed(2)}ms`);
  }

  const sharedIp='10.89.92.20';
  const prepared=await Promise.all(Array.from({length:3},async()=>captcha(base,sharedIp)));
  const attackResponses=await Promise.all(prepared.map((challenge,index)=>fetch(`${base}/api/v1/auth/login`,{
    method:'POST',
    headers:{'content-type':'application/json','x-forwarded-for':sharedIp,'x-request-id':`req-auth89-shared-ip-a-${index}`},
    body:JSON.stringify({tenantRif:RIF,email:SHARED_IP_A,password:WRONG_PASSWORD,...challenge})
  })));
  for(const response of attackResponses)assert.equal(response.status,401);
  const stateA=await getLoginThrottleState(fakeReq(RIF,SHARED_IP_A,sharedIp));
  assert.equal(stateA.state.locked,true,'three failures must throttle the targeted account');

  const firstFailureB=await login(base,{tenantRif:RIF,email:SHARED_IP_B,password:WRONG_PASSWORD,ip:sharedIp});
  assert.equal(firstFailureB.response.status,401);
  const stateB=await getLoginThrottleState(fakeReq(RIF,SHARED_IP_B,sharedIp));
  assert.equal(stateB.state.locked,false,'another account from the same IP must keep an independent throttle');
  assert.equal(stateB.state.failureCount,1);
});
