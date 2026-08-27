import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { signAccessToken } from '../backend/src/shared/auth/jwt.ts';

const RUN=`QA96-${Date.now().toString(36).toUpperCase()}`;
const PERIOD_A='2095-01';const PERIOD_DOC='2095-02';const PERIOD_CROSS='2095-03';const PERIOD_LINK='2095-04';

async function userWithPermissions(h:any,name:string,permissions:string[]){
  const email=`${RUN}-${name}@example.test`.toLowerCase();
  const user=await h.prisma.userProfile.create({data:{tenantId:h.tenant.id,email,fullName:`${RUN} ${name}`,status:'active'}});
  const role=await h.prisma.role.create({data:{tenantId:h.tenant.id,name:`${RUN}-${name}`,system:false}});
  for(const key of permissions){const perm=await h.prisma.permission.findUniqueOrThrow({where:{key}});await h.prisma.rolePermission.create({data:{roleId:role.id,permissionId:perm.id}});}
  await h.prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
  await h.prisma.licenseKey.create({data:{tenantId:h.tenant.id,userId:user.id,userEmail:email,plan:'enterprise',keyHash:createHash('sha256').update(`${RUN}-${name}`).digest('hex'),keyPreview:`${RUN}-${name}`.slice(0,32),modules:['tributos'],expiresAt:new Date(Date.now()+86400000),status:'active'}});
  return {user,role,token:signAccessToken({id:user.id,email:user.email},h.tenant.id)};
}

test('issue #96 fiscal RBAC and audited state machine on real PostgreSQL',async(t)=>{
  const h=await createRealBackendHarness();
  const readOnly=await userWithPermissions(h,'reader',['fiscal.read']);
  const closer=await userWithPermissions(h,'closer',['fiscal.read','fiscal.close']);
  const tenantB=await h.prisma.tenant.create({data:{rif:`${RUN}-B`,name:`${RUN} Tenant B`,legalName:`${RUN} Tenant B`}});

  t.after(async()=>{
    await h.prisma.fiscalDocument.deleteMany({where:{tenantId:{in:[h.tenant.id,tenantB.id]},period:{in:[PERIOD_A,PERIOD_DOC,PERIOD_CROSS,PERIOD_LINK]}}}).catch(()=>undefined);
    await h.prisma.closingPeriod.deleteMany({where:{tenantId:{in:[h.tenant.id,tenantB.id]},period:{in:[PERIOD_A,PERIOD_DOC,PERIOD_CROSS,PERIOD_LINK]}}}).catch(()=>undefined);
    await h.prisma.auditLog.deleteMany({where:{tenantId:h.tenant.id,action:{startsWith:'fiscal.'}}}).catch(()=>undefined);
    for(const actor of [readOnly,closer]){await h.prisma.licenseKey.deleteMany({where:{userId:actor.user.id}}).catch(()=>undefined);await h.prisma.userRole.deleteMany({where:{userId:actor.user.id}}).catch(()=>undefined);await h.prisma.rolePermission.deleteMany({where:{roleId:actor.role.id}}).catch(()=>undefined);await h.prisma.role.delete({where:{id:actor.role.id}}).catch(()=>undefined);await h.prisma.userProfile.delete({where:{id:actor.user.id}}).catch(()=>undefined);}
    await h.prisma.tenant.delete({where:{id:tenantB.id}}).catch(()=>undefined);
    await h.close();
  });

  await t.test('read-only user sees periods/capabilities but cannot mutate',async()=>{
    const result=await h.ok('/fiscal/periods',{},readOnly.token);assert.equal(result.capabilities.read,true);assert.equal(result.capabilities.close,false);assert.equal(result.capabilities.reopen,false);
    await h.status('/fiscal/periods',403,{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal'})},readOnly.token);
    await h.status('/fiscal/documents',403,{method:'POST',body:JSON.stringify({kind:'invoice',number:`${RUN}-NO`,period:PERIOD_A,module:'fiscal',payload:{}})},readOnly.token);
  });

  await t.test('close permission cannot be used as reopen permission',async()=>{
    await h.ok('/fiscal/periods',{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',note:'QA open'})},closer.token);
    const closed=await h.ok('/fiscal/close-period',{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',note:'QA close'})},closer.token);assert.equal(closed.status,'closed');
    await h.status('/fiscal/reopen-period',403,{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',reason:'Necesidad QA autorizada'})},closer.token);
    const reopened=await h.ok('/fiscal/reopen-period',{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',reason:'Corrección QA autorizada y documentada'})});assert.equal(reopened.status,'open');assert.equal(reopened.reopenReason,'Corrección QA autorizada y documentada');
  });

  await t.test('state machine rejects repeated or malformed transitions',async()=>{
    await h.status('/fiscal/reopen-period',409,{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',reason:'Segundo intento inválido'})});
    await h.ok('/fiscal/close-period',{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal'})});
    const again=await h.status('/fiscal/close-period',409,{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal'})});assert.equal(again.payload?.details?.code,'FISCAL_INVALID_TRANSITION');
    await h.status('/fiscal/reopen-period',422,{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',reason:''})});
    await h.status('/fiscal/periods',422,{method:'POST',body:JSON.stringify({period:'2095-13',module:'fiscal'})});
    await h.status('/fiscal/periods',422,{method:'POST',body:JSON.stringify({period:'2095-05',module:'anything'})});
  });

  await t.test('documents are tenant-scoped, unique and blocked by closed fiscal period',async()=>{
    await h.ok('/fiscal/periods',{method:'POST',body:JSON.stringify({period:PERIOD_DOC,module:'iva'})});
    const created=await h.ok('/fiscal/documents',{method:'POST',body:JSON.stringify({kind:'invoice',number:`${RUN}-DOC-1`,period:PERIOD_DOC,module:'iva',payload:{customer:'Dato tratado como texto'}})});assert.equal(created.module,'iva');assert.match(created.hash,/^[a-f0-9]{64}$/);
    await h.status('/fiscal/documents',409,{method:'POST',body:JSON.stringify({kind:'invoice',number:`${RUN}-DOC-1`,period:PERIOD_DOC,module:'iva',payload:{}})});
    await h.ok('/fiscal/close-period',{method:'POST',body:JSON.stringify({period:PERIOD_DOC,module:'iva'})});
    const denied=await h.status('/fiscal/documents',409,{method:'POST',body:JSON.stringify({kind:'invoice',number:`${RUN}-DOC-2`,period:PERIOD_DOC,module:'iva',payload:{}})});assert.equal(denied.payload?.details?.code,'FISCAL_PERIOD_CLOSED');
  });

  await t.test('tenant B periods and documents are invisible to tenant A',async()=>{
    await h.prisma.closingPeriod.create({data:{tenantId:tenantB.id,period:PERIOD_CROSS,module:'fiscal',status:'open'}});
    await h.prisma.fiscalDocument.create({data:{tenantId:tenantB.id,kind:'invoice',number:`${RUN}-FOREIGN`,period:PERIOD_CROSS,status:'issued',hash:'f'.repeat(64),payload:{_fiscalModule:'fiscal'}}});
    await h.status('/fiscal/close-period',404,{method:'POST',body:JSON.stringify({period:PERIOD_CROSS,module:'fiscal'})});
    const docs=await h.ok(`/fiscal/documents?period=${PERIOD_CROSS}`);assert.equal(docs.length,0);
  });

  await t.test('fiscal reopen never reopens accounting period',async()=>{
    await h.prisma.closingPeriod.create({data:{tenantId:h.tenant.id,period:PERIOD_LINK,module:'accounting',status:'closed',closedAt:new Date(),closedBy:h.admin.id}});
    await h.prisma.closingPeriod.create({data:{tenantId:h.tenant.id,period:PERIOD_LINK,module:'fiscal',status:'closed',closedAt:new Date(),closedBy:h.admin.id}});
    await h.ok('/fiscal/reopen-period',{method:'POST',body:JSON.stringify({period:PERIOD_LINK,module:'fiscal',reason:'Reapertura fiscal aislada QA'})});
    const accounting=await h.prisma.closingPeriod.findUniqueOrThrow({where:{tenantId_period_module:{tenantId:h.tenant.id,period:PERIOD_LINK,module:'accounting'}}});assert.equal(accounting.status,'closed');
  });

  await t.test('audit trail contains actor and before/after transition evidence',async()=>{
    const audits=await h.prisma.auditLog.findMany({where:{tenantId:h.tenant.id,action:{in:['fiscal.period.closed','fiscal.period.reopened','fiscal.document.created']}}});assert.ok(audits.length>=3);assert.ok(audits.some((row)=>row.action==='fiscal.period.reopened'&&row.before&&row.after));assert.ok(audits.some((row)=>row.action==='fiscal.document.created'&&row.userId===h.admin.id));
  });
});