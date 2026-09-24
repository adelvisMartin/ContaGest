import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../backend/src/app.ts';
import { prisma } from '../backend/src/database/prisma.ts';
import { logger } from '../backend/src/shared/observability/logger.ts';
import {
  getLoginThrottleState,
  loadLoginThrottlePolicy,
  normalizeLoginIdentity
} from '../backend/src/modules/auth/auth.throttle.ts';

const RUN=`AUTH89-${Date.now().toString(36).toUpperCase()}`;
const PASSWORD='Qa89-valid-password!';
const WRONG_PASSWORD='Qa89-wrong-password!';
const SAME_EMAIL=`same.${RUN.toLowerCase()}@qa.local`;
const RIF_A=`J-${RUN}-A`;
const RIF_B=`J-${RUN}-B`;
const RIF_CASE=`J-${RUN}-CASE`;
const RIF_CONCURRENT=`J-${RUN}-CONCURRENT`;
const RIF_DISABLED=`J-${RUN}-DISABLED`;

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
async function login(base:string,input:{tenantRif:string;email:string;password:string;ip:string;requestId?:string}){
  const challenge=await captcha(base,input.ip);
  const response=await fetch(`${base}/api/v1/auth/login`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-forwarded-for':input.ip,
      'x-request-id':input.requestId||`req-${Math.random().toString(36).slice(2)}-auth89`
    },
    body:JSON.stringify({tenantRif:input.tenantRif,email:input.email,password:input.password,...challenge})
  });
  const payload=await response.json().catch(()=>({}));
  return{response,payload,challenge};
}
async function makeTenantWithUser(rif:string,email:string,status:'active'|'disabled'='active'){
  const tenant=await prisma.tenant.create({data:{rif,name:`${RUN} ${rif}`,legalName:`${RUN} ${rif}`,plan:'qa',status:'active',settings:{}}});
  const user=await prisma.userProfile.create({data:{tenantId:tenant.id,email:email.toLowerCase(),fullName:`QA ${rif}`,passwordHash:await bcrypt.hash(PASSWORD,12),status}});
  return{tenant,user};
}
function fakeReq(tenantRif:string,email:string){return{body:{tenantRif,email},ip:'10.89.0.250',requestId:'req-auth89-state'};}

test('issue #89 real DB/API: temporary account throttle never becomes administrative disabled',async(t)=>{
  assert.equal(String(process.env.NODE_ENV||'').toLowerCase(),'test','Issue #89 integration suite requires NODE_ENV=test');
  const policy=loadLoginThrottlePolicy();
  assert.equal(policy.failureLimit,3,'CI policy must use a small deterministic threshold');
  assert.equal(policy.observationWindowMs,2_000,'CI observation window must be 2 seconds');
  assert.equal(policy.lockDurationMs,2_000,'CI lock must be 2 seconds');

  const identities=[RIF_A,RIF_B,RIF_CASE,RIF_CONCURRENT,RIF_DISABLED];
  const createdTenantIds:string[]=[];
  const app=createApp();
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;

  t.after(async()=>{
    await new Promise<void>((resolve)=>server.close(()=>resolve()));
    await prisma.authLoginAttempt.deleteMany({where:{tenantRif:{in:identities.map((rif)=>rif.toUpperCase())}}}).catch(()=>undefined);
    if(createdTenantIds.length)await prisma.tenant.deleteMany({where:{id:{in:createdTenantIds}}}).catch(()=>undefined);
  });

  const a=await makeTenantWithUser(RIF_A,SAME_EMAIL);createdTenantIds.push(a.tenant.id);
  const b=await makeTenantWithUser(RIF_B,SAME_EMAIL);createdTenantIds.push(b.tenant.id);
  const caseUser=await makeTenantWithUser(RIF_CASE,`case.${RUN.toLowerCase()}@qa.local`);createdTenantIds.push(caseUser.tenant.id);
  const concurrent=await makeTenantWithUser(RIF_CONCURRENT,`concurrent.${RUN.toLowerCase()}@qa.local`);createdTenantIds.push(concurrent.tenant.id);
  const disabled=await makeTenantWithUser(RIF_DISABLED,`disabled.${RUN.toLowerCase()}@qa.local`,'disabled');createdTenantIds.push(disabled.tenant.id);

  await t.test('CAPTCHA remains an independent gate and invalid CAPTCHA does not create an auth attempt',async()=>{
    const before=await prisma.authLoginAttempt.count({where:{tenantRif:RIF_A,email:SAME_EMAIL}});
    const response=await fetch(`${base}/api/v1/auth/login`,{
      method:'POST',headers:{'content-type':'application/json','x-forwarded-for':'10.89.0.1'},
      body:JSON.stringify({tenantRif:RIF_A,email:SAME_EMAIL,password:WRONG_PASSWORD,captchaToken:'invalid-token-0000000000',captchaAnswer:'1'})
    });
    assert.equal(response.status,422);
    const after=await prisma.authLoginAttempt.count({where:{tenantRif:RIF_A,email:SAME_EMAIL}});
    assert.equal(after,before);
  });

  await t.test('five malicious password requests never mutate UserProfile.status and public errors reveal no remaining-attempt counter',async()=>{
    for(let index=0;index<5;index+=1){
      const result=await login(base,{tenantRif:RIF_A,email:SAME_EMAIL,password:WRONG_PASSWORD,ip:`10.89.1.${index+1}`});
      assert.equal(result.response.status,401);
      assert.equal(result.payload?.message,'Credenciales incorrectas.');
      assert.doesNotMatch(JSON.stringify(result.payload),/Quedan|intento\(s\)|bloquead[oa]/i);
    }
    const current=await prisma.userProfile.findUnique({where:{id:a.user.id},select:{status:true}});
    assert.equal(current?.status,'active');
    const state=await getLoginThrottleState(fakeReq(RIF_A,SAME_EMAIL));
    assert.equal(state.state.locked,true);
  });

  await t.test('temporary throttle expires automatically and the next failure starts a fresh defensive window',async()=>{
    await new Promise((resolve)=>setTimeout(resolve,2_150));
    const before=await getLoginThrottleState(fakeReq(RIF_A,SAME_EMAIL));
    assert.equal(before.state.locked,false);
    const result=await login(base,{tenantRif:RIF_A,email:SAME_EMAIL,password:WRONG_PASSWORD,ip:'10.89.2.1'});
    assert.equal(result.response.status,401);
    const after=await getLoginThrottleState(fakeReq(RIF_A,SAME_EMAIL));
    assert.equal(after.state.locked,false);
    assert.equal(after.state.failureCount,1);
    const current=await prisma.userProfile.findUnique({where:{id:a.user.id},select:{status:true}});
    assert.equal(current?.status,'active');
  });

  await t.test('a valid password records success and logically resets previous failures without deleting audit history',async()=>{
    const failuresBefore=await prisma.authLoginAttempt.count({where:{tenantRif:RIF_A,email:SAME_EMAIL,success:false}});
    assert.ok(failuresBefore>=4);
    const result=await login(base,{tenantRif:RIF_A,email:SAME_EMAIL,password:PASSWORD,ip:'10.89.3.1'});
    assert.notEqual(result.response.status,401,'correct password must pass the credential gate even if a later license gate rejects the request');
    const success=await prisma.authLoginAttempt.findFirst({where:{tenantRif:RIF_A,email:SAME_EMAIL,success:true},orderBy:{createdAt:'desc'}});
    assert.ok(success,'successful credential validation must be persisted');
    const failuresAfter=await prisma.authLoginAttempt.count({where:{tenantRif:RIF_A,email:SAME_EMAIL,success:false}});
    assert.equal(failuresAfter,failuresBefore,'successful login must not erase failure audit history');
    const reset=await getLoginThrottleState(fakeReq(RIF_A,SAME_EMAIL));
    assert.equal(reset.state.locked,false);
    assert.equal(reset.state.failureCount,0);
  });

  await t.test('same email in another tenant has an independent counter',async()=>{
    for(let index=0;index<3;index+=1){
      const result=await login(base,{tenantRif:RIF_A,email:SAME_EMAIL,password:WRONG_PASSWORD,ip:`10.89.4.${index+1}`});
      assert.equal(result.response.status,401);
    }
    const lockedA=await getLoginThrottleState(fakeReq(RIF_A,SAME_EMAIL));
    assert.equal(lockedA.state.locked,true);

    const firstB=await login(base,{tenantRif:RIF_B,email:SAME_EMAIL,password:WRONG_PASSWORD,ip:'10.89.4.20'});
    assert.equal(firstB.response.status,401);
    const stateB=await getLoginThrottleState(fakeReq(RIF_B,SAME_EMAIL));
    assert.equal(stateB.state.locked,false);
    assert.equal(stateB.state.failureCount,1);
    const bStatus=await prisma.userProfile.findUnique({where:{id:b.user.id},select:{status:true}});
    assert.equal(bStatus?.status,'active');
  });

  await t.test('RIF/email casing cannot reset or split the identity throttle',async()=>{
    const email=caseUser.user.email;
    const lowerRif=RIF_CASE.toLowerCase();
    const upperEmail=email.toUpperCase();
    for(let index=0;index<2;index+=1){
      const result=await login(base,{tenantRif:lowerRif,email:upperEmail,password:WRONG_PASSWORD,ip:`10.89.5.${index+1}`});
      assert.equal(result.response.status,401);
    }
    const third=await login(base,{tenantRif:RIF_CASE,email,password:WRONG_PASSWORD,ip:'10.89.5.3'});
    assert.equal(third.response.status,401);
    const normalized=normalizeLoginIdentity({tenantRif:lowerRif,email:upperEmail,ipAddress:'x'});
    const failures=await prisma.authLoginAttempt.count({where:{tenantRif:normalized.tenantRif,email:normalized.email,success:false}});
    assert.equal(failures,3);
    const state=await getLoginThrottleState(fakeReq(RIF_CASE,email));
    assert.equal(state.state.locked,true);
  });

  await t.test('administratively disabled user remains disabled and receives the same public credential error',async()=>{
    const result=await login(base,{tenantRif:RIF_DISABLED,email:disabled.user.email,password:PASSWORD,ip:'10.89.6.1'});
    assert.equal(result.response.status,401);
    assert.equal(result.payload?.message,'Credenciales incorrectas.');
    const current=await prisma.userProfile.findUnique({where:{id:disabled.user.id},select:{status:true}});
    assert.equal(current?.status,'disabled');
  });

  await t.test('concurrent distributed failures are all persisted, activate one bounded lock and never disable the account',async()=>{
    const prepared=await Promise.all(Array.from({length:8},async(_,index)=>({
      ip:`10.89.7.${index+1}`,
      challenge:await captcha(base,`10.89.7.${index+1}`)
    })));
    const responses=await Promise.all(prepared.map(({ip,challenge},index)=>fetch(`${base}/api/v1/auth/login`,{
      method:'POST',
      headers:{'content-type':'application/json','x-forwarded-for':ip,'x-request-id':`req-auth89-concurrent-${index}`},
      body:JSON.stringify({tenantRif:RIF_CONCURRENT,email:concurrent.user.email,password:WRONG_PASSWORD,...challenge})
    })));
    for(const response of responses)assert.equal(response.status,401);
    const failures=await prisma.authLoginAttempt.count({where:{tenantRif:RIF_CONCURRENT,email:concurrent.user.email,success:false}});
    assert.ok(failures>=3,'threshold failures must not be lost under concurrency');
    const state=await getLoginThrottleState(fakeReq(RIF_CONCURRENT,concurrent.user.email));
    assert.equal(state.state.locked,true);
    assert.ok(state.state.lockedUntil);
    const current=await prisma.userProfile.findUnique({where:{id:concurrent.user.id},select:{status:true}});
    assert.equal(current?.status,'active');
  });

  await t.test('security telemetry pseudonymizes identity and never logs password/CAPTCHA token',async()=>{
    const telemetry:string[]=[];
    const originalInfo=logger.info;
    (logger as any).info=(payload:unknown,message?:unknown)=>{
      telemetry.push(`${JSON.stringify(payload)} ${String(message||'')}`);
    };
    try{
      const isolatedEmail=`logs.${RUN.toLowerCase()}@qa.local`;
      const isolated=await prisma.userProfile.create({data:{tenantId:b.tenant.id,email:isolatedEmail,fullName:'QA telemetry',passwordHash:await bcrypt.hash(PASSWORD,12),status:'active'}});
      try{
        const result=await login(base,{tenantRif:RIF_B,email:isolatedEmail,password:'NeverLogThisPassword89!',ip:'10.89.8.1',requestId:'req-auth89-redaction'});
        assert.equal(result.response.status,401);
        const joined=telemetry.join('\n');
        assert.match(joined,/auth\.login\.failed/);
        assert.match(joined,/req-auth89-redaction/);
        assert.doesNotMatch(joined,/NeverLogThisPassword89!/);
        assert.doesNotMatch(joined,new RegExp(isolatedEmail.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
        assert.doesNotMatch(joined,new RegExp(RIF_B.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'));
        assert.doesNotMatch(joined,/captchaToken|captchaAnswer|authorization|licenseKey/i);
      }finally{
        await prisma.userProfile.deleteMany({where:{id:isolated.id}});
      }
    }finally{
      (logger as any).info=originalInfo;
    }
  });
});
