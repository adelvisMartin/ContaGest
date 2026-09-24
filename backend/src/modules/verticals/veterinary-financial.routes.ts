import { createHash } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { serializeDecimal } from '../../shared/financial/decimal.js';
import { calculateInvoiceTotals } from '../../shared/financial/invoice.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { ctx, one } from './verticals.shared.js';
import {
  veterinaryFinancialCaseSchema,
  veterinaryFinancialAuthorizationSchema,
  veterinaryFinancialCareSchema,
  veterinaryFinancialInvoiceSchema,
  veterinaryFinancialQuerySchema
} from './veterinary.schemas.js';

const router = Router();

const VETERINARY_FINANCIAL_CONSENT_KIND='veterinary-financial-authorization';
const stableJson=(value:unknown):string=>{
  if(Array.isArray(value))return `[${value.map((item)=>stableJson(item)).join(',')}]`;
  if(value&&typeof value==='object'){
    const source=value as Record<string,unknown>;
    return `{${Object.keys(source).sort().map((key)=>`${JSON.stringify(key)}:${stableJson(source[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const sha256=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:stableJson(value)).digest('hex');
const financialCaseSelect=`
  SELECT f.*,
         p."displayName" AS "patientName",
         p."guardianName" AS "guardianName",
         c."status" AS "authorizationStatus",
         c."signerName" AS "authorizationSigner",
         s."number" AS "invoiceNumber",
         s."status"::text AS "invoiceStatus",
         s."total"::text AS "invoiceTotal"
  FROM public."VeterinaryFinancialCase" f
  JOIN public."CarePatient" p
    ON p."tenantId"=f."tenantId" AND p."id"=f."patientId" AND p."kind"='animal'
  LEFT JOIN public."CareConsent" c
    ON c."tenantId"=f."tenantId" AND c."id"=f."authorizationConsentId"
  LEFT JOIN public."SalesInvoice" s
    ON s."tenantId"=f."tenantId" AND s."id"=f."salesInvoiceId"
`;
const normalizeVeterinaryFinancialCase=(row:any)=>({
  id:String(row.id),
  patientId:String(row.patientId),
  patientName:String(row.patientName||'Mascota'),
  guardianName:row.guardianName?String(row.guardianName):null,
  currency:String(row.currency||'VES'),
  status:String(row.status||'proposed'),
  estimateSnapshot:row.estimateSnapshot&&typeof row.estimateSnapshot==='object'?row.estimateSnapshot:{},
  estimateSha256:String(row.estimateSha256||''),
  estimatedSubtotal:String(row.estimatedSubtotal||'0.00'),
  estimatedTax:String(row.estimatedTax||'0.00'),
  estimatedTotal:String(row.estimatedTotal||'0.00'),
  authorizationConsentId:row.authorizationConsentId?String(row.authorizationConsentId):null,
  authorizationStatus:row.authorizationStatus?String(row.authorizationStatus):null,
  authorizationSigner:row.authorizationSigner?String(row.authorizationSigner):null,
  careEncounterId:row.careEncounterId?String(row.careEncounterId):null,
  hospitalizationId:row.hospitalizationId?String(row.hospitalizationId):null,
  salesInvoiceId:row.salesInvoiceId?String(row.salesInvoiceId):null,
  invoiceNumber:row.invoiceNumber?String(row.invoiceNumber):null,
  invoiceStatus:row.invoiceStatus?String(row.invoiceStatus):null,
  invoiceTotal:row.invoiceTotal?String(row.invoiceTotal):null,
  invoiceSnapshot:row.invoiceSnapshot&&typeof row.invoiceSnapshot==='object'?row.invoiceSnapshot:{},
  createdBy:row.createdBy?String(row.createdBy):null,
  authorizedAt:row.authorizedAt||null,
  attendedAt:row.attendedAt||null,
  invoicedAt:row.invoicedAt||null,
  createdAt:row.createdAt,
  updatedAt:row.updatedAt
});

router.get('/financial-cases/catalog', requirePermission('sales.view'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const products=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","sku","name","unit","price"::text AS "price","taxRate"::text AS "taxRate"
    FROM public."Product"
    WHERE "tenantId"=$1 AND "active"=true
    ORDER BY lower("name"),"sku"
    LIMIT 1000
  `,tenantId);
  ok(res,{currency:'VES',products});
}));

router.get('/financial-cases', requirePermission('sales.view'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const query=veterinaryFinancialQuerySchema.parse(req.query||{});
  const patientId=query.patientId||null;
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    ${financialCaseSelect}
    WHERE f."tenantId"=$1
      AND ($2::text IS NULL OR f."patientId"=$2)
    ORDER BY f."createdAt" DESC
    LIMIT 1000
  `,tenantId,patientId);
  ok(res,rows.map(normalizeVeterinaryFinancialCase));
}));

router.post('/financial-cases', requirePermission('sales.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'La estimación veterinaria requiere un actor autenticado.');
  const body=veterinaryFinancialCaseSchema.parse(req.body||{});

  const result=await prisma.$transaction(async (tx)=>{
    const patientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","displayName","guardianName"
      FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      LIMIT 1
      FOR SHARE
    `,tenantId,body.patientId);
    const patient=one(patientRows,'Mascota activa no encontrada.');

    const resolvedLines:any[]=[];
    for(const line of body.lines){
      if(line.kind==='product'){
        const productRows=await tx.$queryRawUnsafe<any[]>(`
          SELECT "id","sku","name","unit","price","taxRate"
          FROM public."Product"
          WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true
          LIMIT 1
          FOR SHARE
        `,tenantId,line.productId);
        const product=one(productRows,'Producto activo no encontrado.');
        resolvedLines.push({
          kind:'product',
          productId:String(product.id),
          sku:String(product.sku),
          description:String(product.name),
          unit:String(product.unit||'UND'),
          quantity:line.quantity,
          unitPrice:product.price,
          taxRate:product.taxRate
        });
      }else{
        resolvedLines.push({
          kind:'service',
          productId:null,
          sku:null,
          description:line.description,
          unit:'SERV',
          quantity:line.quantity,
          unitPrice:line.unitPrice,
          taxRate:line.taxRate
        });
      }
    }

    const calculated=calculateInvoiceTotals(resolvedLines.map((line)=>({
      quantity:line.quantity,
      unitAmount:line.unitPrice,
      taxRate:line.taxRate
    })));
    const snapshot={
      schema:'veterinary-estimate.v1',
      patient:{id:String(patient.id),displayName:String(patient.displayName||'Mascota')},
      currency:'VES',
      pricingAuthority:'server',
      productPricing:'Product.price + Product.taxRate',
      invoicePolicy:'estimate-only-no-posting',
      lines:resolvedLines.map((line,index)=>({
        kind:line.kind,
        productId:line.productId,
        sku:line.sku,
        description:line.description,
        unit:line.unit,
        quantity:serializeDecimal(calculated.lines[index].quantity,3),
        unitPrice:serializeDecimal(calculated.lines[index].unitAmount,2),
        taxRate:serializeDecimal(calculated.lines[index].taxRate,2),
        lineTotal:serializeDecimal(calculated.lines[index].total,2)
      })),
      subtotal:serializeDecimal(calculated.subtotal,2),
      tax:serializeDecimal(calculated.tax,2),
      total:serializeDecimal(calculated.total,2)
    };
    const estimateSha256=sha256(snapshot);

    const inserted=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."VeterinaryFinancialCase"
        ("id","tenantId","patientId","currency","status","estimateSnapshot","estimateSha256","estimatedSubtotal","estimatedTax","estimatedTotal","createdBy","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,'VES','proposed',$3::jsonb,$4,$5::numeric,$6::numeric,$7::numeric,$8,now(),now())
      RETURNING *
    `,tenantId,body.patientId,JSON.stringify(snapshot),estimateSha256,snapshot.subtotal,snapshot.tax,snapshot.total,actorUserId);
    return {record:normalizeVeterinaryFinancialCase({...one(inserted),patientName:patient.displayName,guardianName:patient.guardianName})};
  });

  await writeAudit({
    tenantId,
    userId:actorUserId,
    action:'veterinary.financial.estimate.created',
    entity:'VeterinaryFinancialCase',
    entityId:result.record.id,
    after:{patientId:result.record.patientId,estimateSha256:result.record.estimateSha256,estimatedTotal:result.record.estimatedTotal,currency:'VES',status:'proposed'}
  });
  ok(res,result.record,201);
}));

router.post('/financial-cases/:id/authorize', requirePermission('sales.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  const actorEmail=ctx(req).email||null;
  if(!actorUserId)throw new HttpError(401,'La autorización requiere un actor autenticado.');
  const caseId=String(req.params.id||'');
  const body=veterinaryFinancialAuthorizationSchema.parse(req.body||{});

  const result=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-financial:authorize:${tenantId}:${caseId}`);
    const rows=await tx.$queryRawUnsafe<any[]>(`
      ${financialCaseSelect}
      WHERE f."tenantId"=$1 AND f."id"=$2
      LIMIT 1
      FOR UPDATE OF f
    `,tenantId,caseId);
    const financialCase=one(rows,'Caso financiero veterinario no encontrado.');
    if(String(financialCase.estimateSha256)!==sha256(financialCase.estimateSnapshot||{}))throw new HttpError(409,'La estimación cambió después de ser calculada y no puede autorizarse.');
    if(financialCase.status!=='proposed')throw new HttpError(409,'Sólo una estimación propuesta puede autorizarse.');
    if(financialCase.authorizationConsentId)throw new HttpError(409,'La estimación ya tiene autorización vinculada.');

    const signedAtRows=await tx.$queryRawUnsafe<any[]>(`SELECT now() AS "signedAt"`);
    const signedAt=new Date(one(signedAtRows).signedAt).toISOString();
    const metadata={
      schema:'veterinary-financial-authorization.v1',
      mode:'typed-attestation',
      financialCaseId:caseId,
      estimateSha256:String(financialCase.estimateSha256),
      estimatedTotal:String(financialCase.estimatedTotal),
      currency:String(financialCase.currency),
      authorizationText:body.authorizationText,
      authorizationTextSha256:sha256(body.authorizationText),
      attestation:true,
      actor:{userId:actorUserId,email:actorEmail},
      actorUserId,
      actorEmail,
      signedAt
    };
    const consentRows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareConsent"
        ("id","tenantId","patientId","kind","status","signerName","signedAt","metadata","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,'signed',$4,$5::timestamptz,$6::jsonb,now())
      RETURNING *
    `,tenantId,financialCase.patientId,VETERINARY_FINANCIAL_CONSENT_KIND,body.signerName,signedAt,JSON.stringify(metadata));
    const consent=one(consentRows);

    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."VeterinaryFinancialCase"
      SET "status"='authorized',"authorizationConsentId"=$3,"authorizedAt"=$4::timestamptz,"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='proposed'
      RETURNING *
    `,tenantId,caseId,consent.id,signedAt);
    return {record:normalizeVeterinaryFinancialCase({...one(updated),patientName:financialCase.patientName,guardianName:financialCase.guardianName,authorizationStatus:'signed',authorizationSigner:body.signerName}),consentId:String(consent.id)};
  });

  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.financial.authorized',
    entity:'VeterinaryFinancialCase',entityId:caseId,
    after:{authorizationConsentId:result.consentId,status:'authorized',estimateSha256:result.record.estimateSha256}
  });
  ok(res,result.record);
}));

router.post('/financial-cases/:id/attend', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'El registro de atención requiere un actor autenticado.');
  const caseId=String(req.params.id||'');
  const body=veterinaryFinancialCareSchema.parse(req.body||{});

  const result=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-financial:attend:${tenantId}:${caseId}`);
    const rows=await tx.$queryRawUnsafe<any[]>(`
      ${financialCaseSelect}
      WHERE f."tenantId"=$1 AND f."id"=$2
      LIMIT 1
      FOR UPDATE OF f
    `,tenantId,caseId);
    const financialCase=one(rows,'Caso financiero veterinario no encontrado.');
    if(financialCase.status!=='authorized')throw new HttpError(409,'La atención sólo puede asociarse después de autorizar la estimación.');
    if(financialCase.authorizationStatus!=='signed')throw new HttpError(409,'La autorización vinculada ya no está firmada y no permite registrar atención.');

    if(body.careEncounterId){
      const clinicalRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","status","patientId"
        FROM public."CareEncounter"
        WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3
        LIMIT 1
        FOR SHARE
      `,tenantId,body.careEncounterId,financialCase.patientId);
      const encounter=one(clinicalRows,'La consulta no pertenece a la mascota del caso.');
      if(encounter.status!=='signed')throw new HttpError(409,'La consulta debe estar firmada antes de marcar la atención.');
    }
    if(body.hospitalizationId){
      const hospitalizationRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","status","patientId"
        FROM public."CareHospitalization"
        WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3
        LIMIT 1
        FOR SHARE
      `,tenantId,body.hospitalizationId,financialCase.patientId);
      const hospitalization=one(hospitalizationRows,'La hospitalización no pertenece a la mascota del caso.');
      if(hospitalization.status==='cancelled')throw new HttpError(409,'Una hospitalización cancelada no puede respaldar la atención.');
    }

    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."VeterinaryFinancialCase"
      SET "status"='attended',"careEncounterId"=$3,"hospitalizationId"=$4,"attendedAt"=now(),"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='authorized'
      RETURNING *
    `,tenantId,caseId,body.careEncounterId||null,body.hospitalizationId||null);
    return normalizeVeterinaryFinancialCase({...one(updated),patientName:financialCase.patientName,guardianName:financialCase.guardianName,authorizationStatus:financialCase.authorizationStatus,authorizationSigner:financialCase.authorizationSigner});
  });

  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.financial.attended',
    entity:'VeterinaryFinancialCase',entityId:caseId,
    after:{status:'attended',careEncounterId:result.careEncounterId,hospitalizationId:result.hospitalizationId}
  });
  ok(res,result);
}));

router.get('/financial-cases/:id/consumptions', requirePermission('sales.view'), requirePermission('inventory.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const caseId=String(req.params.id||'');
  const caseRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."VeterinaryFinancialCase"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,caseId);
  const financialCase=one(caseRows,'Caso financiero veterinario no encontrado.');
  if(!['attended','invoiced'].includes(financialCase.status))throw new HttpError(409,'Los consumos se consultan después de registrar la atención.');

  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT m."id",m."productId",m."lotId",m."quantity"::text AS "quantity",m."createdAt",
           p."sku",p."name" AS "productName",p."unit",p."price"::text AS "unitPrice",p."taxRate"::text AS "taxRate",
           lot."lotNumber",
           cp."id" AS "prescriptionId",cp."encounterId",
           link."financialCaseId" AS "linkedCaseId"
    FROM public."InventoryMovement" m
    JOIN public."CarePrescription" cp
      ON cp."tenantId"=m."tenantId" AND cp."id"=split_part(m."sourceId",':',1)
    JOIN public."Product" p
      ON p."tenantId"=m."tenantId" AND p."id"=m."productId"
    LEFT JOIN public."InventoryLot" lot
      ON lot."tenantId"=m."tenantId" AND lot."id"=m."lotId"
    LEFT JOIN public."VeterinaryFinancialConsumptionLink" link
      ON link."tenantId"=m."tenantId" AND link."inventoryMovementId"=m."id"
    WHERE m."tenantId"=$1
      AND m."source"='veterinary-prescription'
      AND cp."patientId"=$2
      AND m."createdAt">=COALESCE($3::timestamptz,$4::timestamptz)
      AND ($5::text IS NULL OR cp."encounterId"=$5)
    ORDER BY m."createdAt" ASC,m."id"
  `,tenantId,financialCase.patientId,financialCase.authorizedAt,financialCase.createdAt,financialCase.careEncounterId);
  ok(res,rows.map((row)=>({...row,billable:!row.linkedCaseId})));
}));

router.post('/financial-cases/:id/invoice', requirePermission('sales.manage'), requirePermission('inventory.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'La factura veterinaria requiere un actor autenticado.');
  const caseId=String(req.params.id||'');
  const body=veterinaryFinancialInvoiceSchema.parse(req.body||{});
  const inventoryMovementIds=[...new Set(body.inventoryMovementIds)];

  const result=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-financial:invoice:${tenantId}:${caseId}`);
    const rows=await tx.$queryRawUnsafe<any[]>(`
      ${financialCaseSelect}
      WHERE f."tenantId"=$1 AND f."id"=$2
      LIMIT 1
      FOR UPDATE OF f
    `,tenantId,caseId);
    const financialCase=one(rows,'Caso financiero veterinario no encontrado.');

    if(financialCase.salesInvoiceId){
      const invoice=await tx.salesInvoice.findFirst({where:{id:financialCase.salesInvoiceId,tenantId},include:{lines:true}});
      if(!invoice)throw new HttpError(409,'El caso conserva un vínculo a una factura que ya no puede reconstruirse.');
      return {record:normalizeVeterinaryFinancialCase(financialCase),invoice,replayed:true};
    }
    if(financialCase.status!=='attended')throw new HttpError(409,'Sólo una atención autorizada y registrada puede generar factura borrador.');
    if(financialCase.authorizationStatus!=='signed')throw new HttpError(409,'La autorización vinculada ya no está firmada y no permite facturar.');

    const estimate=financialCase.estimateSnapshot&&typeof financialCase.estimateSnapshot==='object'?financialCase.estimateSnapshot:{};
    if(String(financialCase.estimateSha256)!==sha256(estimate))throw new HttpError(409,'La estimación almacenada no coincide con su hash de integridad.');
    const serviceLines=Array.isArray(estimate.lines)?estimate.lines.filter((line:any)=>line?.kind==='service'):[];

    let consumptions:any[]=[];
    if(inventoryMovementIds.length){
      consumptions=await tx.$queryRawUnsafe<any[]>(`
        SELECT m."id",m."productId",m."lotId",m."quantity",m."createdAt",
               p."sku",p."name" AS "productName",p."unit",p."price",p."taxRate",
               lot."lotNumber",cp."id" AS "prescriptionId",cp."encounterId"
        FROM public."InventoryMovement" m
        JOIN public."CarePrescription" cp
          ON cp."tenantId"=m."tenantId" AND cp."id"=split_part(m."sourceId",':',1)
        JOIN public."Product" p
          ON p."tenantId"=m."tenantId" AND p."id"=m."productId"
        LEFT JOIN public."InventoryLot" lot
          ON lot."tenantId"=m."tenantId" AND lot."id"=m."lotId"
        WHERE m."tenantId"=$1
          AND m."id"=ANY($2::text[])
          AND m."source"='veterinary-prescription'
          AND cp."patientId"=$3
          AND m."createdAt">=COALESCE($4::timestamptz,$5::timestamptz)
          AND ($6::text IS NULL OR cp."encounterId"=$6)
        FOR SHARE OF m,p,cp
      `,tenantId,inventoryMovementIds,financialCase.patientId,financialCase.authorizedAt,financialCase.createdAt,financialCase.careEncounterId);
      if(consumptions.length!==inventoryMovementIds.length)throw new HttpError(422,'Uno o más consumos no pertenecen a la atención veterinaria autorizada.');

      const linked=await tx.$queryRawUnsafe<any[]>(`
        SELECT "inventoryMovementId","financialCaseId"
        FROM public."VeterinaryFinancialConsumptionLink"
        WHERE "tenantId"=$1 AND "inventoryMovementId"=ANY($2::text[])
        FOR UPDATE
      `,tenantId,inventoryMovementIds);
      if(linked.length)throw new HttpError(409,'Uno o más consumos ya están facturados o already linked a otro caso veterinario.');
    }

    const commercialLines=[
      ...serviceLines.map((line:any)=>({
        kind:'service',
        productId:null,
        description:String(line.description||'Servicio veterinario'),
        quantity:String(line.quantity||'1'),
        unitPrice:String(line.unitPrice||'0'),
        taxRate:String(line.taxRate||'0'),
        sourceId:null
      })),
      ...consumptions.map((movement)=>({
        kind:'consumption',
        productId:String(movement.productId),
        description:`${String(movement.productName||'Producto clínico')}${movement.lotNumber?` · Lote ${movement.lotNumber}`:''}`,
        quantity:movement.quantity,
        unitPrice:movement.price,
        taxRate:movement.taxRate,
        sourceId:String(movement.id)
      }))
    ];
    if(!commercialLines.length)throw new HttpError(409,'No existen servicios autorizados ni consumos reales seleccionados para facturar.');

    const calculated=calculateInvoiceTotals(commercialLines.map((line)=>({
      quantity:line.quantity,
      unitAmount:line.unitPrice,
      taxRate:line.taxRate
    })));
    const now=new Date();
    const invoiceNumber=`VET-${caseId}`;
    const invoice=await tx.salesInvoice.create({
      data:{
        tenantId,
        clientId:null,
        number:invoiceNumber,
        issueDate:now,
        fiscalPeriod:now.toISOString().slice(0,7),
        currency:'VES',
        exchangeRate:'1',
        subtotal:calculated.subtotal,
        iva:calculated.tax,
        igtf:'0',
        islrRetention:'0',
        total:calculated.total,
        status:'draft',
        notes:'Borrador ERP originado desde flujo financiero veterinario autorizado. Validar cliente y tratamiento fiscal antes de emitir.',
        lines:{
          create:commercialLines.map((line,index)=>({
            productId:line.productId,
            description:line.description,
            quantity:calculated.lines[index].quantity,
            unitPrice:calculated.lines[index].unitAmount,
            taxRate:calculated.lines[index].taxRate,
            total:calculated.lines[index].total
          }))
        }
      },
      include:{lines:true}
    });

    for(const movement of consumptions){
      await tx.$queryRawUnsafe(`
        INSERT INTO public."VeterinaryFinancialConsumptionLink"
          ("id","tenantId","financialCaseId","inventoryMovementId","createdAt")
        VALUES
          (gen_random_uuid()::text,$1,$2,$3,now())
      `,tenantId,caseId,movement.id);
    }

    const invoiceSnapshot={
      schema:'veterinary-financial-invoice.v1',
      financialCaseId:caseId,
      patient:{id:String(financialCase.patientId),displayName:String(financialCase.patientName||'Mascota')},
      currency:'VES',
      estimateSha256:String(financialCase.estimateSha256),
      authorizationConsentId:String(financialCase.authorizationConsentId||''),
      serviceEstimateLineCount:serviceLines.length,
      consumptionMovementIds:consumptions.map((movement)=>String(movement.id)),
      totals:{
        estimatedTotal:String(financialCase.estimatedTotal),
        invoicedSubtotal:serializeDecimal(calculated.subtotal,2),
        invoicedTax:serializeDecimal(calculated.tax,2),
        invoicedTotal:serializeDecimal(calculated.total,2)
      },
      invoice:{id:invoice.id,number:invoice.number,status:'draft'},
      accountingPosting:'not-performed'
    };

    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."VeterinaryFinancialCase"
      SET "status"='invoiced',"salesInvoiceId"=$3,"invoiceSnapshot"=$4::jsonb,"invoicedAt"=now(),"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='attended'
      RETURNING *
    `,tenantId,caseId,invoice.id,JSON.stringify(invoiceSnapshot));

    return {
      record:normalizeVeterinaryFinancialCase({...one(updated),patientName:financialCase.patientName,guardianName:financialCase.guardianName,authorizationStatus:financialCase.authorizationStatus,authorizationSigner:financialCase.authorizationSigner,invoiceNumber:invoice.number,invoiceStatus:'draft',invoiceTotal:serializeDecimal(calculated.total,2)}),
      invoice,
      replayed:false
    };
  });

  if(!result.replayed){
    await writeAudit({
      tenantId,userId:actorUserId,
      action:'veterinary.financial.invoice.draft.created',
      entity:'VeterinaryFinancialCase',entityId:caseId,
      after:{
        salesInvoiceId:result.invoice.id,
        invoiceNumber:result.invoice.number,
        status:'invoiced',
        invoiceStatus:'draft',
        estimateSha256:result.record.estimateSha256,
        consumptionMovementIds:result.record.invoiceSnapshot?.consumptionMovementIds||[]
      }
    });
  }
  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  ok(res,{case:result.record,invoice:result.invoice,replayed:result.replayed},result.replayed?200:201);
}));

export default router;
