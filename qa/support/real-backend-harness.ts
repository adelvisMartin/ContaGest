import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../backend/src/app.ts';
import { prisma } from '../../backend/src/database/prisma.ts';
import { signAccessToken } from '../../backend/src/shared/auth/jwt.ts';
import { assertQaDisposableDatabaseConfig } from './disposable-database-guard-v1288.mjs';

export const QA_TENANT_RIF='00000000';
export const QA_ADMIN_EMAIL='admin@erp.local';

function unwrap(payload:any){return payload?.data ?? payload;}

/** Explicit opt-in for high-risk QA suites. Check the actual connected database
 * BEFORE issuing any session, creating app state or provisioning synthetic rows.
 * The runner may use its own disposable clone instead of the seed database.
 */
export async function createRealBackendHarness(options: {
  approvedDatabaseNames?: readonly string[];
} = {}){
  if(options.approvedDatabaseNames){
    assert.ok(options.approvedDatabaseNames.length>0,
      'The QA isolation allowlist must not be empty');
    for(const name of options.approvedDatabaseNames){
      assert.match(name,/^contagest_[a-z0-9_]+_v[0-9]+(?:_e2e)?$/,
        'Only explicit versioned ContaGest QA databases are eligible');
    }
    assert.equal(process.env.NODE_ENV,'test',
      'High-risk real backend QA must never run in a production environment');
    const db=await prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
    assert.ok(options.approvedDatabaseNames.includes(db[0]?.name),
      `Refusing synthetic QA mutations outside explicitly approved database(s): ${db[0]?.name || '(unknown)'}`);
  }
  if(!options.approvedDatabaseNames){
    // Standard CRUD fixtures must run on an isolated loopback _e2e/_drill/_restore
    // database. Explicit versioned allowlists above remain authoritative for
    // specialist disposable suites (for example notification preferences QA).
    const expectedDatabase=assertQaDisposableDatabaseConfig(process.env);
    const databases=await prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
    if(databases[0]?.name!==expectedDatabase){
      throw new Error('QA_EPHEMERAL_DATABASE_REQUIRED');
    }
  }
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
  let token:string;
  try {
    token=await issueSessionTokenFor(admin);
  } catch (error) {
    // A failed signing step must not leave an unowned synthetic session.
    await cleanupFixtureSessions();
    throw error;
  }

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

/** Complete explicit legal acceptance through the real API for synthetic
 * licensed actors. Never mock or disable the customer adhesion middleware.
 */
export async function acceptCurrentLegalForSyntheticQaActor(
  h: Pick<Awaited<ReturnType<typeof createRealBackendHarness>>, 'ok'>,
  token: string,
) {
  const legal=await h.ok('/legal/status',{},token) as {documents:Array<{
    code:string;version:string;hash:string;required:boolean
  }>};
  const documents=legal.documents.filter(doc=>doc.required)
    .map(({code,version,hash})=>({code,version,hash}));
  assert.ok(documents.length>0,'QA must explicitly accept the current legal catalog');
  await h.ok('/legal/accept',{
    method:'POST',
    body:JSON.stringify({documents,necessaryCookiesAcknowledged:true,
      analyticsCookies:false,marketingCookies:false,locale:'es-VE'})
  },token);
  const after=await h.ok('/legal/status',{},token) as {pending:boolean;pendingCodes:string[]};
  assert.equal(after.pending,false,'QA synthetic account acceptance must be current');
  assert.deepEqual(after.pendingCodes,[]);
}
