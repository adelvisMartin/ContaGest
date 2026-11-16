import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRealBackendHarness, acceptCurrentLegalForSyntheticQaActor } from './support/real-backend-harness.ts';

const RUN=`QA96-${Date.now().toString(36).toUpperCase()}`;
const PERIOD_A='2095-01';const PERIOD_DOC='2095-02';const PERIOD_CROSS='2095-03';const PERIOD_LINK='2095-04';
let mutationSequence=0;
const fiscalMutation=(body:unknown)=>({
  method:'POST',
  headers:{'Idempotency-Key':`${RUN}-mutation-${++mutationSequence}`},
  body:JSON.stringify(body)
});

async function userWithPermissions(h:any,name:string,permissions:string[]){
  const email=`${RUN}-${name}@example.test`.toLowerCase();
  const user=await h.prisma.userProfile.create({data:{tenantId:h.tenant.id,email,fullName:`${RUN} ${name}`,status:'active'}});
  const role=await h.prisma.role.create({data:{tenantId:h.tenant.id,name:`${RUN}-${name}`,system:false}});
  for(const key of permissions){const perm=await h.prisma.permission.findUniqueOrThrow({where:{key}});await h.prisma.rolePermission.create({data:{roleId:role.id,permissionId:perm.id}});}
  await h.prisma.userRole.create({data:{userId:user.id,roleId:role.id}});
  await h.prisma.licenseKey.create({data:{tenantId:h.tenant.id,userId:user.id,userEmail:email,plan:'enterprise',keyHash:createHash('sha256').update(`${RUN}-${name}`).digest('hex'),keyPreview:`${RUN}-${name}`.slice(0,32),modules:['tributos'],expiresAt:new Date(Date.now()+86400000),status:'active'}});
  const token=await h.issueSessionTokenFor({id:user.id,email:user.email});
  await acceptCurrentLegalForSyntheticQaActor(h,token);
  return {user,role,token};
}

test('issue #96 fiscal RBAC and audited state machine on real PostgreSQL',async(t)=>{
  const h=await createRealBackendHarness({
    approvedDatabaseNames:['contagest_fiscal_v96_e2e']
  });
  const database=await h.prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
  assert.equal(database[0]?.name,'contagest_fiscal_v96_e2e',
    'Legal acceptance cleanup is allowed only on the dedicated disposable #96 database');
  const readOnly=await userWithPermissions(h,'reader',['fiscal.read']);
  const closer=await userWithPermissions(h,'closer',['fiscal.read','fiscal.close']);
  const tenantB=await h.prisma.tenant.create({data:{rif:`${RUN}-B`,name:`${RUN} Tenant B`,legalName:`${RUN} Tenant B`}});

  t.after(async()=>{
    // Remove signed test sessions before deleting their user profiles.
    await h.close();
    // FiscalDocument and AuditLog are immutable protected evidence. Never
    // suppress failed DELETEs against them just to make fixture cleanup green.
    // The isolated PostgreSQL service is destroyed after this test job.
    for(const actor of [readOnly,closer]){
      await h.prisma.licenseKey.deleteMany({where:{userId:actor.user.id}});
      await h.prisma.userRole.deleteMany({where:{userId:actor.user.id}});
      await h.prisma.rolePermission.deleteMany({where:{roleId:actor.role.id}});
      await h.prisma.role.delete({where:{id:actor.role.id}});
      // Both legal tables have FK UserProfile(id) ON DELETE CASCADE
      // (20260809224500_v11_15_legal_acceptance_rif_lock). Do not issue
      // separate raw SQL that alters the tested production lifecycle.
      await h.prisma.userProfile.delete({where:{id:actor.user.id}});
      const survivingLegal=await h.prisma.$queryRaw<Array<{count:bigint}>>`
        SELECT COUNT(*)::bigint AS count
        FROM public."LegalAcceptance" WHERE "tenantId"=${h.tenant.id}
          AND "userId"=${actor.user.id}
      `;
      const survivingCookie=await h.prisma.$queryRaw<Array<{count:bigint}>>`
        SELECT COUNT(*)::bigint AS count
        FROM public."CookiePreference" WHERE "tenantId"=${h.tenant.id}
          AND "userId"=${actor.user.id}
      `;
      assert.equal(survivingLegal[0]?.count,0n,'Legal acceptance FK cascade left synthetic evidence');
      assert.equal(survivingCookie[0]?.count,0n,'Cookie preference FK cascade left synthetic evidence');
    }
    // Tenant B deliberately remains only until the disposable DB is dropped:
    // deleting it could cascade into protected fiscal evidence.

  });

  await t.test('read-only user sees periods/capabilities but cannot mutate',async()=>{
    const result=await h.ok('/fiscal/periods',{},readOnly.token);assert.equal(result.capabilities.read,true);assert.equal(result.capabilities.close,false);assert.equal(result.capabilities.reopen,false);
    await h.status('/fiscal/periods',403,fiscalMutation({period:PERIOD_A,module:'fiscal'}),readOnly.token);
    await h.status('/fiscal/documents',403,{method:'POST',body:JSON.stringify({kind:'invoice',number:`${RUN}-NO`,period:PERIOD_A,module:'fiscal',payload:{}})},readOnly.token);
  });

  await t.test('close permission cannot be used as reopen permission',async()=>{
    await h.ok('/fiscal/periods',{method:'POST',body:JSON.stringify({period:PERIOD_A,module:'fiscal',note:'QA open'})},closer.token);
    const closed=await h.ok('/fiscal/close-period',fiscalMutation({period:PERIOD_A,module:'fiscal',note:'QA close'}),closer.token);assert.equal(closed.status,'closed');
    await h.status('/fiscal/reopen-period',403,fiscalMutation({period:PERIOD_A,module:'fiscal',reason:'Necesidad QA autorizada'}),closer.token);
    const reopened=await h.ok('/fiscal/reopen-period',fiscalMutation({period:PERIOD_A,module:'fiscal',reason:'Corrección QA autorizada y documentada'}));assert.equal(reopened.status,'open');assert.equal(reopened.reopenReason,'Corrección QA autorizada y documentada');
  });

  await t.test('state machine rejects repeated or malformed transitions',async()=>{
    await h.status('/fiscal/reopen-period',409,fiscalMutation({period:PERIOD_A,module:'fiscal',reason:'Segundo intento inválido'}));
    await h.ok('/fiscal/close-period',fiscalMutation({period:PERIOD_A,module:'fiscal'}));
    const again=await h.status('/fiscal/close-period',409,fiscalMutation({period:PERIOD_A,module:'fiscal'}));assert.equal(again.payload?.details?.code,'FISCAL_INVALID_TRANSITION');
    await h.status('/fiscal/reopen-period',422,fiscalMutation({period:PERIOD_A,module:'fiscal',reason:''}));
    await h.status('/fiscal/periods',422,{method:'POST',body:JSON.stringify({period:'2095-13',module:'fiscal'})});
    await h.status('/fiscal/periods',422,{method:'POST',body:JSON.stringify({period:'2095-05',module:'anything'})});
  });

  await t.test('regulated invoice cannot enter generic fiscal issuance, even after period close',async()=>{
    await h.ok('/fiscal/periods',{method:'POST',body:JSON.stringify({period:PERIOD_DOC,module:'iva'})});
    const payload={kind:'invoice',number:`${RUN}-DOC-1`,period:PERIOD_DOC,module:'iva',payload:{customer:'Synthetic QA'}};
    const denied=await h.status('/fiscal/documents',422,{method:'POST',body:JSON.stringify(payload)});
    assert.equal(denied.payload?.details?.code,'FISCAL_EXTERNAL_DOCUMENT_DENIED',
      'Only the reviewed fiscal document workflow may issue regulated invoices');
    const closed=await h.ok('/fiscal/close-period',fiscalMutation({period:PERIOD_DOC,module:'iva'}));
    assert.equal(closed.status,'closed');
    const stillDenied=await h.status('/fiscal/documents',422,{method:'POST',body:JSON.stringify(payload)});
    assert.equal(stillDenied.payload?.details?.code,'FISCAL_EXTERNAL_DOCUMENT_DENIED');
    const stored=await h.prisma.closingPeriod.findFirstOrThrow({
      where:{tenantId:h.tenant.id,period:PERIOD_DOC,module:'iva'}
    });
    assert.equal(stored.status,'closed');
  });

  await t.test('tenant B periods and documents are invisible to tenant A',async()=>{
    await h.prisma.closingPeriod.create({data:{tenantId:tenantB.id,period:PERIOD_CROSS,module:'fiscal',status:'open'}});
    await h.prisma.fiscalDocument.create({data:{tenantId:tenantB.id,kind:'invoice',number:`${RUN}-FOREIGN`,period:PERIOD_CROSS,status:'issued',hash:'f'.repeat(64),payload:{_fiscalModule:'fiscal'}}});
    await h.status('/fiscal/close-period',404,fiscalMutation({period:PERIOD_CROSS,module:'fiscal'}));
    const docs=await h.ok(`/fiscal/documents?period=${PERIOD_CROSS}`);assert.equal(docs.length,0);
  });

  await t.test('fiscal reopen never reopens accounting period',async()=>{
    await h.prisma.closingPeriod.create({data:{tenantId:h.tenant.id,period:PERIOD_LINK,module:'accounting',status:'closed',closedAt:new Date(),closedBy:h.admin.id}});
    await h.prisma.closingPeriod.create({data:{tenantId:h.tenant.id,period:PERIOD_LINK,module:'fiscal',status:'closed',closedAt:new Date(),closedBy:h.admin.id}});
    await h.ok('/fiscal/reopen-period',fiscalMutation({period:PERIOD_LINK,module:'fiscal',reason:'Reapertura fiscal aislada QA'}));
    const accounting=await h.prisma.closingPeriod.findUniqueOrThrow({where:{tenantId_period_module:{tenantId:h.tenant.id,period:PERIOD_LINK,module:'accounting'}}});assert.equal(accounting.status,'closed');
  });

  await t.test('audit trail contains actor and before/after transition evidence',async()=>{
    const audits=await h.prisma.auditLog.findMany({where:{tenantId:h.tenant.id,action:{in:['fiscal.period.created','fiscal.period.closed','fiscal.period.reopened']}}});
    assert.ok(audits.length>=3,'Period transitions must leave immutable audit evidence');
    assert.ok(audits.some(row=>row.action==='fiscal.period.reopened'&&row.before&&row.after));
    assert.ok(audits.some(row=>row.action==='fiscal.period.created'&&row.userId===h.admin.id));
  });
});