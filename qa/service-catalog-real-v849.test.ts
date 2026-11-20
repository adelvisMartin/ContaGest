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
  assert.ok(/_v849$/.test(db[0]?.name||'') || db[0]?.name==='contagest_catalog_v849_e2e',
    'BLOCKED: only disposable catalog-specific PostgreSQL 17 QA database permitted');
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

  // Category lifecycle is admin-only, audited, and preserves product/price/history.
  const categoryPath=`/service-catalog/categories/${category.id}/status`;
  await h.status(categoryPath,422,{
    method:'PATCH',body:JSON.stringify({status:'archived',tenantId:randomUUID()})
  });
  await h.status('/service-catalog/categories/not-a-uuid/status',422,{
    method:'PATCH',body:JSON.stringify({status:'archived'})
  });
  const archivedCategory=await h.ok(categoryPath,{
    method:'PATCH',body:JSON.stringify({status:'archived'})
  });
  assert.equal(archivedCategory.status,'archived');
  const repeatedArchive=await h.ok(categoryPath,{
    method:'PATCH',body:JSON.stringify({status:'archived'})
  });
  assert.equal(repeatedArchive.status,'archived');
  await h.status('/service-catalog/services',422,{
    method:'POST',body:JSON.stringify({
      name:'Servicio en categoría archivada',categoryId:category.id,productId:ownProduct.id,
      modality:'onsite',durationMinutes:30
    })
  });
  const reactivated=await h.ok(categoryPath,{
    method:'PATCH',body:JSON.stringify({status:'active'})
  });
  assert.equal(reactivated.status,'active');
  const categoryAudits=await h.prisma.auditLog.findMany({
    where:{tenantId:h.tenant.id,entity:'ServiceCatalogCategory',
      entityId:category.id,action:'service-category.status'}
  });
  assert.equal(categoryAudits.length,2,'Idempotent retry must not create an extra audit row');

  const created=await h.ok('/service-catalog/services',{
    method:'POST',body:JSON.stringify({
      name:'Consulta QA '+suffix,categoryId:category.id,productId:ownProduct.id,
      modality:'onsite',durationMinutes:30
    })
  });
  assert.equal(created.status,'draft');
  assert.equal(created.version,1);
  await h.status(categoryPath,409,{
    method:'PATCH',body:JSON.stringify({status:'archived'})
  });
  assert.equal((await h.prisma.serviceCatalogCategory.findFirst({
    where:{tenantId:h.tenant.id,id:category.id},select:{status:true}
  }))?.status,'active','Category must stay active while draft service references it');
  // Unpublished fixture also makes pagination observable without disturbing
  // the normal catalog's publication and version lifecycle.
  const extraCategory=await h.ok('/service-catalog/categories',{
    method:'POST',body:JSON.stringify({
      slug:'other-'+suffix,name:'Servicios secundarios QA'
    })
  });
  const extraService=await h.ok('/service-catalog/services',{
    method:'POST',body:JSON.stringify({
      name:'Servicio secundario QA '+suffix,categoryId:extraCategory.id,
      productId:ownProduct.id,modality:'remote',durationMinutes:20
    })
  });
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
  // A later location assignment must not invalidate a live service.
  const locationPath=`/service-catalog/services/${created.id}/locations/${location.id}`;
  await h.status(locationPath,409,{method:'DELETE'});
  const preserved=await h.prisma.serviceDefinition.findFirst({
    where:{tenantId:h.tenant.id,id:created.id},
    include:{locations:true}
  });
  assert.equal(preserved?.status,'active');
  assert.equal(preserved?.version,5,'a rejected mutation must not increment the version');
  assert.deepEqual(preserved?.locations.map(row=>row.locationId),[location.id]);
  const unchanged=await h.ok(locationPath,{method:'PUT'});
  assert.equal(unchanged.changed,false,'idempotent assignment must remain a no-op');

  // Admin filters stay tenant-bound, bounded, and deterministic without
  // changing the existing unfiltered list contract.
  const matched=await h.ok(
    `/service-catalog/services?status=active&categoryId=${category.id}&search=consulta`
  );
  assert.equal(matched.length,1);
  assert.equal(matched[0].id,created.id);
  const nonmatchingStatus=await h.ok(
    `/service-catalog/services?status=draft&categoryId=${category.id}&search=consulta`
  );
  assert.equal(nonmatchingStatus.some((s:any)=>s.id===created.id),false);
  assert.deepEqual(await h.ok(
    `/service-catalog/services?categoryId=${randomUUID()}`
  ),[]);
  const matchedCategories=await h.ok(
    '/service-catalog/categories?status=active&search=Atenci%C3%B3n&take=1'
  );
  assert.equal(matchedCategories.length,1);
  assert.equal(matchedCategories[0].id,category.id);
  // The Query parser must not coerce array pollution, noncanonical numbers
  // or scientific notation into a valid page limit.
  for(const endpoint of ['/service-catalog/categories','/service-catalog/services','/service-catalog/public']){
    for(const query of ['take=01','take=1e0','take=1&take=2','skip=','skip=+1','skip=1.5']){
      await h.status(endpoint+'?'+query,422);
    }
  }
  const categoryResponse=await h.request('/service-catalog/categories?take=1');
  const serviceResponse=await h.request('/service-catalog/services?take=1');
  assert.equal(categoryResponse.response.headers.get('cache-control'),'private, no-store');
  assert.equal(serviceResponse.response.headers.get('cache-control'),'private, no-store');
  assert.ok(categoryResponse.data.length<=1);
  assert.ok(serviceResponse.data.length<=1);
  assert.equal(categoryResponse.response.headers.get('X-Pagination-Has-More'),'true');
  assert.equal(serviceResponse.response.headers.get('X-Pagination-Has-More'),'true');
  assert.equal(categoryResponse.response.headers.get('X-Pagination-Next-Skip'),'1');
  assert.equal(serviceResponse.response.headers.get('X-Pagination-Next-Skip'),'1');
  const nextCategory=await h.request('/service-catalog/categories?take=1&skip=1');
  const nextService=await h.request('/service-catalog/services?take=1&skip=1');
  assert.equal(nextCategory.response.headers.get('X-Pagination-Has-More'),'false');
  assert.equal(nextService.response.headers.get('X-Pagination-Has-More'),'false');
  assert.deepEqual(new Set([categoryResponse.data[0].id,nextCategory.data[0].id]),
    new Set([category.id,extraCategory.id]));
  assert.deepEqual(new Set([serviceResponse.data[0].id,nextService.data[0].id]),
    new Set([created.id,extraService.id]));
  const publicPage=await h.request('/service-catalog/public?take=1');
  assert.equal(publicPage.response.headers.get('X-Pagination-Has-More'),'false');
  assert.equal(publicPage.response.headers.get('Cache-Control'),'private, no-store');
  assert.equal(publicPage.data.services.length,1);
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
  await h.status(`/service-catalog/categories/${foreignCategory.id}/status`,404,{
    method:'PATCH',body:JSON.stringify({status:'archived'})
  });
  assert.equal((await h.prisma.serviceCatalogCategory.findFirst({
    where:{tenantId:otherTenant.id,id:foreignCategory.id},select:{status:true}
  }))?.status,'active','Cross-tenant category status must remain unchanged');
  await h.status('/service-catalog/services',422,{
    method:'POST',body:JSON.stringify({
      name:'Intento categoría cruzada',categoryId:foreignCategory.id,
      modality:'onsite',durationMinutes:20
    })
  });

  // Whichever side wins the row lock, a category must never be archived
  // while a new non-archived service is successfully created.
  const raceCategory=await h.ok('/service-catalog/categories',{
    method:'POST',body:JSON.stringify({slug:'race-'+suffix,name:'Categoría concurrente QA'})
  });
  const [raceArchive,raceCreate]=await Promise.all([
    h.request(`/service-catalog/categories/${raceCategory.id}/status`,{
      method:'PATCH',body:JSON.stringify({status:'archived'})
    }),
    h.request('/service-catalog/services',{
      method:'POST',body:JSON.stringify({
        name:'Servicio concurrente QA '+suffix,categoryId:raceCategory.id,
        productId:ownProduct.id,modality:'onsite',durationMinutes:20
      })
    })
  ]);
  assert.ok((raceArchive.response.status===200&&raceCreate.response.status===422)||
    (raceArchive.response.status===409&&raceCreate.response.status===201),
    'Concurrent archive/create must serialize: no archived category with live service');
  const raceState=await h.prisma.serviceCatalogCategory.findFirst({
    where:{tenantId:h.tenant.id,id:raceCategory.id},select:{status:true}
  });
  const raceAttached=await h.prisma.serviceDefinition.count({
    where:{tenantId:h.tenant.id,categoryId:raceCategory.id,status:{not:'archived'}}
  });
  assert.ok(raceState?.status==='active'||raceAttached===0,
    'Category archived concurrently while live service was created');

  const noToken=await h.request('/service-catalog/services',{},'');
  assert.equal(noToken.response.status,401);
  // Intentionally retain synthetic records on the disposable database for
  // audit and upgrade tests. The DB is destroyed as a whole after QA.
});
