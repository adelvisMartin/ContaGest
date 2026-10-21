import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../../backend/src/app.ts';
import { prisma } from '../../backend/src/database/prisma.ts';
import { signAccessToken } from '../../backend/src/shared/auth/jwt.ts';

export const QA_TENANT_RIF='00000000';
export const QA_ADMIN_EMAIL='admin@erp.local';

function unwrap(payload:any){return payload?.data ?? payload;}

export async function createRealBackendHarness(){
  const tenant=await prisma.tenant.findUnique({where:{rif:QA_TENANT_RIF}});
  assert.ok(tenant,`QA tenant ${QA_TENANT_RIF} not found`);
  const admin=await prisma.userProfile.findFirst({where:{tenantId:tenant.id,email:QA_ADMIN_EMAIL,status:'active'}});
  assert.ok(admin,`QA admin ${QA_ADMIN_EMAIL} not found`);
  const platformPermission=await prisma.userRole.count({where:{userId:admin.id,role:{tenantId:tenant.id,permissions:{some:{permission:{key:'platform.manage'}}}}}});
  assert.ok(platformPermission>0,'QA admin lacks platform.manage');
  // Never create even temporary QA credentials in a shared or production DB.
  assert.equal(process.env.NODE_ENV,'test','Real-backend QA requires NODE_ENV=test');
  const database=await prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
  assert.match(database[0]?.name||'', /(?:_e2e|_test|_qa)$/, 'Real-backend QA requires a disposable database');
  const sessionIds:string[]=[];
  async function issueQaToken(user:{id:string;email:string;tenantId:string}){
    assert.equal(user.tenantId,tenant.id,'QA session must use the fixture tenant');
    const sessionId=randomUUID();
    const refreshHash=randomBytes(32).toString('hex');
    const csrfHash=randomBytes(32).toString('hex');
    const expiresAt=new Date(Date.now()+60*60*1000);
    await prisma.$executeRaw`
      INSERT INTO public."UserSession"
        ("id","userId","tenantId","refreshHash","csrfHash","status","rotationCounter",
         "expiresAt","lastSeenAt","metadata","createdAt","updatedAt")
      VALUES
        (${sessionId},${user.id},${tenant.id},${refreshHash},${csrfHash},'active',0,
         ${expiresAt},now(),${JSON.stringify({purpose:'disposable-qa'})}::jsonb,now(),now())
    `;
    sessionIds.push(sessionId);
    return signAccessToken({id:user.id,email:user.email},tenant.id,sessionId);
  }
  async function cleanupQaSessions(){
    for(const sessionId of sessionIds.reverse()){
      await prisma.$executeRaw`DELETE FROM public."UserSession" WHERE "id"=${sessionId} AND "tenantId"=${tenant.id}`;
    }
    sessionIds.length=0;
  }
  const token=await issueQaToken(admin);

  const server=createApp().listen(0,'127.0.0.1');
  try { await new Promise<void>((resolve,reject)=>{server.once('listening',()=>resolve());server.once('error',reject);}); }
  catch(error){ await cleanupQaSessions(); throw error; }
  const address=server.address() as AddressInfo;
  const base=`http://127.0.0.1:${address.port}`;
  let ipCounter=1;

  async function request(path:string,options:RequestInit={},authToken=token){
    const headers=new Headers(options.headers||{});
    if(authToken)headers.set('authorization',`Bearer ${authToken}`);
    const third=50+Math.floor(ipCounter/200);const fourth=(ipCounter++%200)+20;
    headers.set('x-forwarded-for',`10.58.${third}.${fourth}`);
    if(options.body&&!headers.has('content-type'))headers.set('content-type','application/json');
    const response=await fetch(`${base}/api/v1${path}`,{...options,headers});
    const text=await response.text();let payload:any={};
    try{payload=text?JSON.parse(text):{};}catch{payload={message:text};}
    return{response,payload,data:unwrap(payload)};
  }

  async function ok(path:string,options:RequestInit={},authToken=token){
    const result=await request(path,options,authToken);
    assert.equal(result.response.ok,true,`${options.method||'GET'} ${path} -> ${result.response.status}: ${JSON.stringify(result.payload)}`);
    assert.notEqual(result.payload?.ok,false,`${path} returned ok=false`);
    return result.data;
  }

  async function status(path:string,expected:number,options:RequestInit={},authToken=token){
    const result=await request(path,options,authToken);
    assert.equal(result.response.status,expected,`${options.method||'GET'} ${path} expected ${expected}, got ${result.response.status}: ${JSON.stringify(result.payload)}`);
    return result;
  }

  async function close(){
    try { await new Promise<void>((resolve)=>server.close(()=>resolve())); }
    finally { await cleanupQaSessions(); }
  }
  return{tenant,admin,token,base,request,ok,status,close,prisma,issueQaToken};
}
