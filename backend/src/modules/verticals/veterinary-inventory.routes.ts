import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { compare, serializeDecimal, ZERO } from '../../shared/financial/decimal.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  applyInventoryStandardEffect,
  inventoryLotBalance,
  lockInventoryLot,
  lockInventoryProduct
} from '../../shared/services/inventory-movement.service.js';
import { ctx, one } from './verticals.shared.js';
import {
  veterinaryMedicationPrescriptionSchema,
  clinicalInventoryLotSchema,
  clinicalInventoryConsumptionSchema
} from './veterinary.schemas.js';

const router = Router();

const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

router.get('/medication-products', requirePermission('inventory.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","sku","name","unit","stock"::text AS "stock","reserved"::text AS "reserved","active"
    FROM public."Product"
    WHERE "tenantId"=$1 AND "active"=true
    ORDER BY lower("name"),"sku"
    LIMIT 1000
  `,tenantId);
  ok(res,rows);
}));

router.post('/medications/prescriptions', asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const body=veterinaryMedicationPrescriptionSchema.parse(req.body||{});
  const actorUserId=ctx(req).userId||null;
  const actorEmail=ctx(req).email||null;

  const created=await prisma.$transaction(async (tx)=>{
    const patientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","displayName","species","guardianName"
      FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      LIMIT 1
      FOR SHARE
    `,tenantId,body.patientId);
    const patient=one(patientRows,'Mascota no encontrada.');

    let professional:any=null;
    if(body.professionalId){
      const professionalRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","fullName","licenseNumber"
        FROM public."CareProfessional"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
        FOR SHARE
      `,tenantId,body.professionalId);
      professional=one(professionalRows,'El profesional no pertenece al tenant activo.');
    }

    if(body.encounterId){
      const encounterRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id"
        FROM public."CareEncounter"
        WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3
        LIMIT 1
        FOR SHARE
      `,tenantId,body.encounterId,body.patientId);
      if(!encounterRows.length)throw new HttpError(422,'El encuentro no pertenece a la mascota activa.');
    }

    let product:any=null;
    if(body.productId){
      const productRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","sku","name","unit"
        FROM public."Product"
        WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true
        LIMIT 1
        FOR SHARE
      `,tenantId,body.productId);
      product=one(productRows,'El producto no pertenece al inventario activo del tenant.');
    }

    const prescribedAt=new Date().toISOString();
    const labelSnapshot={
      schema:'veterinary-medication-label.v1',
      prescribedAt,
      patient:{id:patient.id,name:patient.displayName,species:patient.species||null,guardianName:patient.guardianName||null},
      professional:professional?{id:professional.id,name:professional.fullName,licenseNumber:professional.licenseNumber||null}:null,
      medication:body.medication,
      dose:body.dose,
      frequency:body.frequency,
      duration:body.duration,
      instructions:body.instructions||null,
      inventoryProduct:product?{id:product.id,sku:product.sku,name:product.name,unit:product.unit}:null
    };
    const veterinaryMeta={
      schemaVersion:1,
      prescribedAt,
      actorUserId,
      actorEmail,
      inventoryProductId:product?.id||null,
      inventoryConsumption:'not-performed'
    };

    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CarePrescription"
        ("id","tenantId","patientId","encounterId","professionalId","medication","dose","frequency","duration","instructions","status","productId","labelSnapshot","veterinaryMeta","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11::jsonb,$12::jsonb,now())
      RETURNING *
    `,
      tenantId,body.patientId,body.encounterId||null,body.professionalId||null,
      body.medication,body.dose,body.frequency,body.duration,body.instructions||null,
      product?.id||null,JSON.stringify(labelSnapshot),JSON.stringify(veterinaryMeta)
    );
    return {...one(rows),productName:product?.name||null,productSku:product?.sku||null};
  });

  ok(res,created,201);
}));

router.get('/clinical-inventory', requirePermission('inventory.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const [products,lots]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      SELECT "id","sku","name","unit",
             "stock"::text AS "stock",
             "reserved"::text AS "reserved",
             "minStock"::text AS "minStock",
             ("stock"-"reserved")::text AS "available",
             (("stock"-"reserved") <= "minStock") AS "reorder"
      FROM public."Product"
      WHERE "tenantId"=$1 AND "active"=true
      ORDER BY lower("name"),"sku"
      LIMIT 1000
    `,tenantId),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT l."id",l."productId",l."lotNumber",l."expiresAt",l."receivedAt",l."notes",l."active",
             COALESCE(SUM(
               CASE
                 WHEN m."type"='in' THEN m."quantity"
                 WHEN m."type"='out' THEN -m."quantity"
                 WHEN m."type"='adjustment' THEN m."quantity"
                 ELSE 0
               END
             ),0)::text AS "onHand"
      FROM public."InventoryLot" l
      LEFT JOIN public."InventoryMovement" m
        ON m."tenantId"=l."tenantId" AND m."lotId"=l."id"
      WHERE l."tenantId"=$1 AND l."active"=true
      GROUP BY l."id"
      ORDER BY l."expiresAt" ASC NULLS LAST,l."lotNumber"
      LIMIT 5000
    `,tenantId)
  ]);
  ok(res,{products,lots});
}));

router.post('/clinical-inventory/lots', requirePermission('inventory.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const body=clinicalInventoryLotSchema.parse(req.body||{});

  const result=await prisma.$transaction(async (tx)=>{
    const product=await lockInventoryProduct(tx,tenantId,body.productId);
    const existing=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","productId","lotNumber","expiresAt","receivedAt","notes","active"
      FROM public."InventoryLot"
      WHERE "tenantId"=$1 AND "productId"=$2 AND "lotNumber"=$3
      LIMIT 1
      FOR UPDATE
    `,tenantId,body.productId,body.lotNumber);
    if(existing.length){
      return {lot:existing[0],product,onHand:null,replayed:true};
    }

    const lot=await tx.inventoryLot.create({
      data:{
        tenantId,
        productId:body.productId,
        lotNumber:body.lotNumber,
        expiresAt:body.expiresAt?new Date(`${body.expiresAt}T00:00:00.000Z`):null,
        notes:body.notes||null,
        active:true
      }
    });
    let updated=product;
    if(compare(body.receivedQuantity,ZERO)>0){
      updated=await applyInventoryStandardEffect(tx,product,'in',body.receivedQuantity);
      await tx.inventoryMovement.create({
        data:{
          tenantId,
          productId:product.id,
          lotId:lot.id,
          type:'in',
          quantity:body.receivedQuantity,
          unitCost:body.unitCost??null,
          source:'veterinary-lot-receipt',
          sourceId:lot.id,
          note:body.notes||'Recepción inicial de lote clínico veterinario.'
        }
      });
    }
    return {
      lot,
      product:updated,
      onHand:serializeDecimal(body.receivedQuantity,3),
      replayed:false
    };
  });

  if(!result.replayed){
    await writeAudit({
      tenantId,
      userId:ctx(req).userId,
      action:'veterinary.inventory.lot.created',
      entity:'InventoryLot',
      entityId:result.lot.id,
      after:{productId:body.productId,lotNumber:body.lotNumber,expiresAt:body.expiresAt||null,receivedQuantity:serializeDecimal(body.receivedQuantity,3)}
    });
  }
  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  ok(res,result,result.replayed?200:201);
}));

router.get('/clinical-inventory/consumptions', requirePermission('inventory.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const patientId=String(req.query.patientId||'');
  if(!patientId)throw new HttpError(422,'patientId es obligatorio.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT m."id",m."productId",m."lotId",m."quantity"::text AS "quantity",m."sourceId",m."note",m."createdAt",
           prod."name" AS "productName",prod."sku" AS "productSku",
           lot."lotNumber",lot."expiresAt",
           cp."id" AS "prescriptionId",cp."medication",cp."dose",cp."frequency",cp."duration"
    FROM public."InventoryMovement" m
    JOIN public."CarePrescription" cp
      ON cp."tenantId"=m."tenantId"
     AND cp."id"=split_part(m."sourceId",':',1)
    JOIN public."CarePatient" patient
      ON patient."tenantId"=cp."tenantId" AND patient."id"=cp."patientId" AND patient."kind"='animal'
    JOIN public."Product" prod
      ON prod."tenantId"=m."tenantId" AND prod."id"=m."productId"
    LEFT JOIN public."InventoryLot" lot
      ON lot."tenantId"=m."tenantId" AND lot."id"=m."lotId"
    WHERE m."tenantId"=$1
      AND m."source"='veterinary-prescription'
      AND cp."patientId"=$2
    ORDER BY m."createdAt" DESC
    LIMIT 1000
  `,tenantId,patientId);
  ok(res,rows);
}));

router.post('/clinical-inventory/consume', requirePermission('inventory.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const body=clinicalInventoryConsumptionSchema.parse(req.body||{});
  const sourceId=`${body.prescriptionId}:${body.clinicalActId}`;

  const result=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe<any[]>(`
      SELECT pg_advisory_xact_lock(hashtextextended($1,0))
    `,`${tenantId}:veterinary-prescription:${sourceId}`);

    const existing=await tx.inventoryMovement.findFirst({
      where:{tenantId,source:'veterinary-prescription',sourceId}
    });
    if(existing)return {movement:existing,replayed:true};

    const prescriptionRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT cp."id",cp."patientId",cp."productId",cp."medication",cp."status"
      FROM public."CarePrescription" cp
      JOIN public."CarePatient" patient
        ON patient."tenantId"=cp."tenantId" AND patient."id"=cp."patientId" AND patient."kind"='animal'
      WHERE cp."tenantId"=$1 AND cp."id"=$2
      LIMIT 1
      FOR SHARE OF cp
    `,tenantId,body.prescriptionId);
    const prescription=one(prescriptionRows,'Prescripción veterinaria no encontrada.');
    if(prescription.status!=='active')throw new HttpError(409,'Sólo una prescripción activa puede originar consumo clínico.');
    if(!prescription.productId)throw new HttpError(409,'La prescripción no tiene producto de inventario vinculado.');

    const product=await lockInventoryProduct(tx,tenantId,prescription.productId);
    const lot=await lockInventoryLot(tx,tenantId,product.id,body.lotId);
    if(lot.expiresAt){
      const expiry=new Date(lot.expiresAt);
      const today=new Date();
      today.setUTCHours(0,0,0,0);
      if(expiry.getTime()<today.getTime())throw new HttpError(409,'No se puede consumir un lote vencido.',{code:'INVENTORY_LOT_EXPIRED'});
    }

    const lotOnHand=await inventoryLotBalance(tx,tenantId,lot.id);
    if(compare(lotOnHand,body.quantity)<0){
      throw new HttpError(409,'Existencia insuficiente en el lote seleccionado.',{code:'INVENTORY_LOT_INSUFFICIENT_STOCK'});
    }

    const updated=await applyInventoryStandardEffect(tx,product,'out',body.quantity);
    const movement=await tx.inventoryMovement.create({
      data:{
        tenantId,
        productId:product.id,
        lotId:lot.id,
        type:'out',
        quantity:body.quantity,
        source:'veterinary-prescription',
        sourceId,
        note:body.note||`Consumo clínico derivado de prescripción ${prescription.id}.`
      }
    });
    return {movement,product:updated,lot,replayed:false};
  });

  if(!result.replayed){
    await writeAudit({
      tenantId,
      userId:ctx(req).userId,
      action:'veterinary.inventory.consume',
      entity:'InventoryMovement',
      entityId:result.movement.id,
      after:{
        prescriptionId:body.prescriptionId,
        lotId:body.lotId,
        quantity:serializeDecimal(body.quantity,3),
        clinicalActId:body.clinicalActId
      }
    });
  }
  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  ok(res,{
    movement:{...result.movement,quantityExact:serializeDecimal(result.movement.quantity,3)},
    replayed:result.replayed
  },result.replayed?200:201);
}));

export default router;
