import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
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
  // QA uses real server-bound sessions, exactly as production bearer tokens do.
  // Never bypass the sid/UserSession check in requestContext just for tests.
  const fixtureSessionIds=new Set<string>();
  async function issueSessionTokenFor(user:{id:string;email:string}){
    const active=await prisma.userProfile.findFirst({
      where:{id:user.id,tenantId:tenant.id,status:'active'},
      select:{email:true}
    });
    assert.equal(active?.email,user.email,'QA session requires an active user of the fixture tenant');
    const id=randomUUID();
    const refreshHash=randomBytes(32).toString('hex');
    const csrfHash=randomBytes(32).toString('hex');
    const expiresAt=new Date(Date.now()+30*60*1000);
    await prisma.$executeRaw`
      INSERT INTO public."UserSession"
        ("id","userId","tenantId","refreshHash","csrfHash","status","rotationCounter","expiresAt","metadata","createdAt","updatedAt")
      VALUES
        (${id},${user.id},${tenant.id},${refreshHash},${csrfHash},'active',0,${expiresAt},'{"qaFixture":true}'::jsonb,now(),now())
    `;
    fixtureSessionIds.add(id);
    return signAccessToken({id:user.id,email:user.email},tenant.id,id);
  }
  async function cleanupFixtureSessions(){
    for(const id of fixtureSessionIds){
      await prisma.$executeRaw`DELETE FROM public."UserSession" WHERE "id"=${id} AND "tenantId"=${tenant.id}`;
      fixtureSessionIds.delete(id);
    }
  }
  const token=await issueSessionTokenFor(admin);

  let server:ReturnType<ReturnType<typeof createApp>['listen']>;
  try{
    server=createApp().listen(0,'127.0.0.1');
    await new Promise<void>((resolve,reject)=>{server.once('listening',()=>resolve());server.once('error',reject);});
  }catch(error){
    await cleanupFixtureSessions();
    throw error;
  }
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

  let closed=false;
  async function close(){
    if(closed)return;
    closed=true;
    try{await new Promise<void>((resolve)=>server.close(()=>resolve()));}
    finally{await cleanupFixtureSessions();}
  }
  return{tenant,admin,token,base,request,ok,status,close,prisma,issueSessionTokenFor};
}
