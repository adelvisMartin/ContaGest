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
  const token=signAccessToken({id:admin.id,email:admin.email},tenant.id);

  const server=createApp().listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',()=>resolve());server.once('error',reject);});
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

  async function close(){await new Promise<void>((resolve)=>server.close(()=>resolve()));}
  return{tenant,admin,token,base,request,ok,status,close,prisma};
}
