import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRealBackendHarness } from './support/real-backend-harness.ts';

/**
 * RUN ONLY on a disposable PostgreSQL 17 DB ending _v849 and with the RLS
 * sidecar installed. Never run against staging or live commercial data.
 * CG_SERVICE_CATALOG_QA_ISOLATED=true npm run test:backend:service-catalog:real
 */
test('#849 catalog end-to-end: tenant binding, versioned steps and bilateral assignments', async (t) => {
  assert.equal(process.env.CG_SERVICE_CATALOG_QA_ISOLATED, 'true',
    'BLOCKED: disposable test database authorization required');
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.ok(!process.env.VERCEL && !process.env.VERCEL_ENV, 'BLOCKED: no deployment environment');
  const { prisma } = await import('../backend/src/database/prisma.ts');
  const db = await prisma.$queryRaw<Array<{ name: string; version: number }>>`
    SELECT current_database() AS name, current_setting('server_version_num')::int/10000 AS version
  `;
  assert.match(db[0]?.name || '', /_v849$/, 'BLOCKED: database must end in _v849');
  assert.equal(db[0]?.version, 17, 'BLOCKED: PostgreSQL 17 required');

  const h=await createRealBackendHarness();
  t.after(async()=>h.close());
  const suffix=randomUUID().slice(0,8);
  const ownProduct=await h.prisma.product.create({
    data:{tenantId:h.tenant.id,sku:'svc-'+suffix,name:'Servicio QA '+suffix,price:'10.00',taxRate:'0.00'}
  });
  const employee=await h.prisma.employee.create({
    data:{tenantId:h.tenant.id,idNumber:'SVC-'+suffix,fullName:'Profesional QA '+suffix,position:'Operador'}
  });
  const location=await h.prisma.businessLocation.create({
    data:{tenantId:h.tenant.id,code:'SC-'+suffix,name:'Sede QA '+suffix,timezone:'America/Caracas'}
  });

  const category=await h.ok('/service-catalog/categories',{
    method:'POST',body:JSON.stringify({slug:'sc-'+suffix,name:'Atención QA'})
  });
  assert.equal(category.tenantId,h.tenant.id);

  const created=await h.ok('/service-catalog/services',{
    method:'POST',body:JSON.stringify({
      name:'Consulta QA '+suffix,categoryId:category.id,productId:ownProduct.id,
      modality:'onsite',durationMinutes:30
    })
  });
  assert.equal(created.status,'draft');
  assert.equal(created.version,1);
  let projected=await h.ok('/service-catalog/public');
  assert.equal(projected.services.some((s:any)=>s.id===created.id),false);

  const unknownProduct=await h.status('/service-catalog/services',422,{
    method:'POST',body:JSON.stringify({
      name:'No autorizada',productId:randomUUID(),modality:'onsite',durationMinutes:20
    })
  });
  assert.equal(unknownProduct.response.status,422);
  await h.status('/service-catalog/services',422,{
    method:'POST',body:JSON.stringify({
      name:'Mass assignment',tenantId:randomUUID(),productId:ownProduct.id,
      modality:'onsite',durationMinutes:20
    })
  });

  const steps=await h.ok(`/service-catalog/services/${created.id}/steps`,{
    method:'PUT',body:JSON.stringify({expectedVersion:1,steps:[
      {position:1,label:'Evaluación',durationMinutes:20,gapAfterMinutes:5},
      {position:2,label:'Revisión',durationMinutes:10,gapAfterMinutes:0}
    ]})
  });
  assert.equal(steps.totalMinutes,35);
  assert.equal(steps.version,2);
  await h.status(`/service-catalog/services/${created.id}/steps`,409,{
    method:'PUT',body:JSON.stringify({expectedVersion:1,steps:[
      {position:1,label:'Replay',durationMinutes:20,gapAfterMinutes:0}
    ]})
  });
  await h.status(`/service-catalog/services/${created.id}/status`,422,{
    method:'PATCH',body:JSON.stringify({expectedVersion:2,status:'active',visibility:'public'})
  });

  const staff=await h.ok(`/service-catalog/services/${created.id}/staff/${employee.id}`,{method:'PUT'});
  assert.equal(staff.changed,true);
  const replay=await h.ok(`/service-catalog/services/${created.id}/staff/${employee.id}`,{method:'PUT'});
  assert.equal(replay.changed,false);
  const loc=await h.ok(`/service-catalog/services/${created.id}/locations/${location.id}`,{method:'PUT'});
  assert.equal(loc.changed,true);
  await h.status(`/service-catalog/services/${created.id}/staff/${randomUUID()}`,422,{method:'PUT'});
  await h.status(`/service-catalog/services/${created.id}/locations/${randomUUID()}`,422,{method:'PUT'});

  const memberSide=await h.ok(`/service-catalog/staff/${employee.id}/services`);
  assert.ok(memberSide.some((s:any)=>s.serviceId===created.id));

  const detail=await h.ok(`/service-catalog/services/${created.id}`);
  assert.equal(detail.version,4);
  assert.equal(detail.staff.length,1);
  assert.equal(detail.locations.length,1);
  assert.equal(detail.steps.length,2);

  const published=await h.ok(`/service-catalog/services/${created.id}/status`,{
    method:'PATCH',body:JSON.stringify({expectedVersion:4,status:'active',visibility:'public'})
  });
  assert.equal(published.version,5);
  projected=await h.ok('/service-catalog/public');
  const publicRow=projected.services.find((s:any)=>s.id===created.id);
  assert.ok(publicRow);
  const publicJson=JSON.stringify(publicRow);
  for(const forbidden of ['price','taxRate','cost','employeeId','createdBy','tenantId']) {
    assert.equal(Object.hasOwn(publicRow,forbidden),false,'public leak: '+forbidden);
  }
  assert.equal(publicRow.durationMinutes,35);

  const audit=await h.prisma.auditLog.findMany({
    where:{tenantId:h.tenant.id,entityId:created.id}
  });
  assert.ok(audit.some(row=>row.action==='service.status'));
  const revisions=await h.prisma.serviceDefinitionRevision.findMany({
    where:{tenantId:h.tenant.id,serviceId:created.id},orderBy:{version:'asc'}
  });
  assert.deepEqual(revisions.map(r=>r.version),[1,2,3,4,5],
    'every effective capability/step/publication change must snapshot a new version');
  assert.equal((revisions[3].snapshot as any).staff[0],employee.id);
  assert.equal((revisions[3].snapshot as any).locations[0],location.id);
  await h.status(`/service-catalog/services/${created.id}/status`,409,{
    method:'PATCH',body:JSON.stringify({expectedVersion:4,status:'archived'})
  });

  const otherTenant=await h.prisma.tenant.create({
    data:{rif:'QA849-'+suffix,name:'Otra empresa aislada '+suffix}
  });
  const otherProduct=await h.prisma.product.create({
    data:{tenantId:otherTenant.id,sku:'other-'+suffix,name:'Producto ajeno '+suffix}
  });
  await h.status('/service-catalog/services',422,{
    method:'POST',body:JSON.stringify({
      name:'Intento entre tenants',productId:otherProduct.id,
      modality:'onsite',durationMinutes:20
    })
  });
  const foreignCategory=await h.prisma.serviceCatalogCategory.create({
    data:{tenantId:otherTenant.id,slug:'foreign-'+suffix,name:'Categoría ajena'}
  });
  await h.status('/service-catalog/services',422,{
    method:'POST',body:JSON.stringify({
      name:'Intento categoría cruzada',categoryId:foreignCategory.id,
      modality:'onsite',durationMinutes:20
    })
  });

  const noToken=await h.request('/service-catalog/services',{},'');
  assert.equal(noToken.response.status,401);
  // Intentionally retain synthetic records on the disposable database for
  // audit and upgrade tests. The DB is destroyed as a whole after QA.
});
