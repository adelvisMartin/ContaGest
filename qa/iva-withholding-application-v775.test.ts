import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';
import { prepareQaSemanticPosting } from './support/semantic-posting-fixture.ts';

const RUN=`QA775-${randomUUID().slice(0,8)}`;
const post=(body:unknown,key?:string)=>({
  method:'POST',headers:key?{'Idempotency-Key':key}:{},
  body:JSON.stringify(body)
});

/** PostgreSQL 17 only. No production, staging or shared tenant data. */
test('#775 invoice -> reviewed rule -> AP tax posting -> idempotent reversal with immutable provenance',async t=>{
  const h=await createRealBackendHarness();
  t.after(async()=>h.close());
  const db=await h.prisma.$queryRaw<Array<{name:string}>>`SELECT current_database() AS name`;
  assert.match(db[0]?.name||'',/fiscal_v561_e2e$/,
    'VAT posting QA must run only on the disposable *_fiscal_v561_e2e PG17 database');

  const now=new Date(),since=new Date(now.getTime()-86400000);
  const period=now.toISOString().slice(0,7);
  const issueDate=new Date(now.getTime()-1000);
  assert.equal(issueDate.toISOString().slice(0,7),period,'test requires single calendar month');
  const roles=await h.prisma.userRole.findMany({
    where:{userId:h.admin.id},select:{roleId:true}
  });
  const users=await Promise.all(['review','activate'].map(async role=>
    h.prisma.userProfile.create({data:{
      tenantId:h.tenant.id,email:`${role}-${RUN}@example.invalid`,
      fullName:`QA ${role} actor`
    }})
  ));
  for(const user of users){
    await h.prisma.userRole.createMany({data:roles.map(r=>({userId:user.id,roleId:r.roleId}))});
  }
  const reviewer=await h.issueSessionTokenFor(users[0]);
  const activator=await h.issueSessionTokenFor(users[1]);
  // The fixture is disposable; users/audits are intentionally preserved until
  // the entire test database is destroyed. Never delete audit-linked actors.
  const digest=createHash('sha256').update(`synthetic-no-legal-effect-${RUN}`).digest('hex');
  const legalSource=`QA-RET-IVA-SYNTHETIC-${RUN}`;
  const source=await h.ok('/fiscal/legal-sources',post({
    sourceType:'official_gazette',reference:legalSource,
    title:'Synthetic QA provenance ONLY',sourceUrl:'https://example.invalid/qa',
    contentSha256:digest
  }));
  await h.ok(`/fiscal/legal-sources/${source.id}/review`,post({
    approved:true,reason:'Independent review of synthetic source, not law.'
  }),reviewer);

  async function activeRule(ruleKey:string,numerator:number,basis:string){
    const created=await h.ok('/fiscal/rules',post({
      ruleKey,effectiveFrom:since.toISOString(),source:legalSource,
      documentation:'Synthetic QA ratio, not a legally adopted tax rate.',
      legalSourceId:source.id,
      definition:{formula:'RATIO_MINOR_UNITS',numerator,denominator:100,basis}
    }));
    await h.ok(`/fiscal/rules/${created.id}/review`,
      post({reason:'Independent QA check of synthetic formula and source.'}),reviewer);
    return h.ok(`/fiscal/rules/${created.id}/activate`,
      post({reason:'Third actor approves a synthetic tax-rate fixture only.'}),activator);
  }
  const ivaRule=await activeRule(`iva.${RUN.toLowerCase()}`,16,'taxable_minor');
  const retRule=await activeRule(`ret_iva.${RUN.toLowerCase()}`,75,'tax_minor');

  const draft=await h.ok('/fiscal/taxpayer-profiles',post({
    effectiveFrom:since.toISOString(),jurisdiction:'Synthetic QA state',
    taxpayerCategory:'special_notified',activityCodes:['QA-SPECIAL'],
    sourceReference:legalSource,sourceContentSha256:digest
  }));
  await h.ok(`/fiscal/taxpayer-profiles/${draft.id}/review`,
    post({reason:'Second actor reviewed special-notified synthetic fixture.'}),reviewer);
  const profile=await h.ok(`/fiscal/taxpayer-profiles/${draft.id}/activate`,
    post({reason:'Third actor activates special-notified synthetic fixture.'}),activator);
  assert.equal(profile.status,'ACTIVE');

  await prepareQaSemanticPosting(h);
  const existing=await h.ok('/chart-accounts/role-mappings') as Array<{role:string}>;
  if(!existing.some(role=>role.role==='withholding_payable')){
    await h.ok('/chart-accounts/role-mappings',post({
      role:'withholding_payable',accountCode:'2.1.02.005'
    }));
  }
  const supplier=await h.prisma.supplier.create({data:{
    tenantId:h.tenant.id,rif:`J-${RUN}`,name:'QA ordinary supplier',
    retentionProfile:'ordinary',active:true
  }});

  const purchaseInput=(taxRate:string)=>({
    supplierId:supplier.id,issueDate:issueDate.toISOString(),fiscalPeriod:period,
    currency:'VES',exchangeRate:'1.0000',status:'issued',
    lines:[{description:'Synthetic standard taxable good',
      quantity:'1.000',unitCost:'100.00',taxRate}]
  });
  const purchase=await h.ok('/purchases',post(purchaseInput('16.00'),
    `${RUN}-purchase`));
  assert.equal(purchase.iva,'16.00');
  const request={purchaseInvoiceId:purchase.id,ivaRuleKey:ivaRule.ruleKey,
    retentionRuleKey:retRule.ruleKey};
  const key=`${RUN}-application`;
  const first=await h.ok('/fiscal/withholding-applications',
    post(request,key));
  assert.equal(first.mode,'INTERNAL_AP_APPLICATION_NOT_CERTIFICATE');
  assert.equal(first.withheldMinor,1200);
  const replay=await h.ok('/fiscal/withholding-applications',post(request,key));
  assert.equal(replay.id,first.id);
  await h.status('/fiscal/withholding-applications',409,
    post(request,`${RUN}-duplicate`));
  const historical=await h.ok(`/fiscal/withholding-applications/${first.id}`);
  assert.equal(historical.evidence.purchaseInvoiceId,purchase.id);
  assert.equal(historical.evidenceSha256,first.evidenceSha256);
  const posted=await h.prisma.ledgerEntry.findFirst({
    where:{id:first.ledgerEntryId,tenantId:h.tenant.id,source:'tax',posted:true},
    include:{lines:true}
  });
  assert.ok(posted,'original withholding journal must be posted');
  assert.equal(posted.lines.length,2);
  assert.equal(posted.lines.reduce((v,l)=>v.plus(l.debit),posted.lines[0].debit.mul(0)).toFixed(2),'12.00');
  assert.equal(posted.lines.reduce((v,l)=>v.plus(l.credit),posted.lines[0].credit.mul(0)).toFixed(2),'12.00');
  const issuedAudit=await h.prisma.auditLog.findMany({where:{
    tenantId:h.tenant.id,entity:'FiscalWithholdingApplication',
    entityId:first.id,action:'fiscal.retiva.applied'
  }});
  assert.equal(issuedAudit.length,1);

  // The original purchase may not be cancelled while a posted withholding
  // liability remains. Purchase and withholding routes share an invoice row lock.
  await h.status(`/purchases/${purchase.id}/cancel`,409,{
    method:'PATCH',headers:{'Idempotency-Key':`${RUN}-cancel-too-early`},
    body:JSON.stringify({reason:'Must reverse the tax withholding application first.'})
  });
  const cancellation={fiscalPeriod:period,reason:'QA synthetic correction of withholding.'};
  const reversed=await h.ok(`/fiscal/withholding-applications/${first.id}/reverse`,
    post(cancellation,`${RUN}-reverse`));
  assert.equal(reversed.status,'REVERSED');
  const reversedReplay=await h.ok(`/fiscal/withholding-applications/${first.id}/reverse`,
    post(cancellation,`${RUN}-reverse`));
  assert.equal(reversedReplay.reversalLedgerEntryId,reversed.reversalLedgerEntryId);
  await h.status(`/fiscal/withholding-applications/${first.id}/reverse`,409,
    post(cancellation,`${RUN}-reverse-duplicate`));
  const originalReversed=await h.prisma.ledgerEntry.findFirst({
    where:{id:first.ledgerEntryId,tenantId:h.tenant.id},include:{reversedBy:true}
  });
  assert.equal(originalReversed?.reversedBy?.id,reversed.reversalLedgerEntryId);
  const historicalAfter=await h.ok(`/fiscal/withholding-applications/${first.id}`);
  assert.equal(historicalAfter.evidenceSha256,first.evidenceSha256);
  assert.equal(historicalAfter.status,'REVERSED');
  const cancelledPurchase=await h.ok(`/purchases/${purchase.id}/cancel`,{
    method:'PATCH',headers:{'Idempotency-Key':`${RUN}-cancel-after-ret-reversal`},
    body:JSON.stringify({reason:'Fixture original purchase cancellation after fiscal reversal.'})
  });
  assert.equal(cancelledPurchase.purchase.status,'cancelled');
  const historicalCancelled=await h.ok(`/fiscal/withholding-applications/${first.id}`);
  assert.equal(historicalCancelled.evidenceSha256,first.evidenceSha256,
    'historical provenance must survive reversal of original purchase');

  await assert.rejects(
    h.prisma.$executeRaw`UPDATE public."FiscalWithholdingApplication"
      SET "withheldMinor"=1 WHERE "id"=${first.id}::uuid AND "tenantId"=${h.tenant.id}`,
    /FISCAL_WITHHOLDING_IMMUTABLE/i
  );
  await assert.rejects(
    h.prisma.$executeRaw`DELETE FROM public."FiscalWithholdingApplication"
      WHERE "id"=${first.id}::uuid AND "tenantId"=${h.tenant.id}`,
    /FISCAL_WITHHOLDING_IMMUTABLE/i
  );

  // The historical client taxRate is not legal authority: the application
  // must reject mismatched IVA even when the purchase's journal is posted.
  const inconsistent=await h.ok('/purchases',post(purchaseInput('17.00'),
    `${RUN}-mismatched-purchase`));
  await h.status('/fiscal/withholding-applications',422,post({
    ...request,purchaseInvoiceId:inconsistent.id
  },`${RUN}-mismatch-iva`));
});
