import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { compare, serializeDecimal, ZERO } from '../../shared/financial/decimal.js';
import { calculateInvoiceTotals } from '../../shared/financial/invoice.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  applyInventoryStandardEffect,
  inventoryLotBalance,
  lockInventoryLot,
  lockInventoryProduct
} from '../../shared/services/inventory-movement.service.js';

const router = Router();
router.use(requireTenant, requirePermission('health.manage'));

const ctx = (req: any) => req.context as { tenantId: string; userId?: string; email?: string };
const optionalText = z.string().trim().max(4000).optional().nullable();
const optionalDate = z.string().trim().min(8).max(50).optional().nullable();
const one = <T>(rows: T[], message = 'Registro no encontrado.') => {
  if (!rows.length) throw new HttpError(404, message);
  return rows[0];
};
const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

const veterinaryMedicationPrescriptionSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().min(10).optional().nullable(),
  professionalId: z.string().min(10).optional().nullable(),
  medication: z.string().trim().min(2).max(240),
  dose: z.string().trim().min(1).max(240),
  frequency: z.string().trim().min(1).max(240),
  duration: z.string().trim().min(1).max(240),
  instructions: optionalText,
  productId: z.string().uuid().optional().nullable()
}).strict();

const clinicalInventoryLotSchema = z.object({
  productId: z.string().uuid(),
  lotNumber: z.string().trim().min(1).max(120),
  expiresAt: z.string().date().optional().nullable(),
  receivedQuantity: decimalSchema('quantity',{nonnegative:true,defaultValue:0}),
  unitCost: decimalSchema('money',{nonnegative:true}).optional(),
  notes: optionalText
}).strict();

const clinicalInventoryConsumptionSchema = z.object({
  prescriptionId: z.string().min(10),
  lotId: z.string().uuid(),
  quantity: decimalSchema('quantity',{positive:true}),
  clinicalActId: z.string().uuid(),
  note: optionalText
}).strict();

const veterinaryEstimateServiceLineSchema=z.object({
  kind:z.literal('service'),
  description:z.string().trim().min(2).max(240),
  quantity:decimalSchema('quantity',{positive:true}),
  unitPrice:decimalSchema('money',{nonnegative:true}),
  taxRate:decimalSchema('percentage',{nonnegative:true,defaultValue:16})
}).strict();
const veterinaryEstimateProductLineSchema=z.object({
  kind:z.literal('product'),
  productId:z.string().uuid(),
  quantity:decimalSchema('quantity',{positive:true})
}).strict();
const veterinaryEstimateLineSchema=z.discriminatedUnion('kind',[
  veterinaryEstimateServiceLineSchema,
  veterinaryEstimateProductLineSchema
]);
const veterinaryFinancialCaseSchema=z.object({
  patientId:z.string().min(10),
  currency:z.literal('VES').default('VES'),
  lines:z.array(veterinaryEstimateLineSchema).min(1).max(100)
}).strict();
const veterinaryFinancialAuthorizationSchema=z.object({
  signerName:z.string().trim().min(2).max(180),
  attestation:z.literal(true),
  authorizationText:z.string().trim().min(20).max(10000)
}).strict();
const veterinaryFinancialCareSchema=z.object({
  careEncounterId:z.string().min(10).optional().nullable(),
  hospitalizationId:z.string().min(10).optional().nullable()
}).strict().superRefine((value,refinement)=>{
  const sources=[value.careEncounterId,value.hospitalizationId].filter(Boolean);
  if(sources.length!==1)refinement.addIssue({code:'custom',path:['careEncounterId'],message:'Selecciona exactamente una fuente clínica: consulta o hospitalización.'});
});
const veterinaryFinancialInvoiceSchema=z.object({
  inventoryMovementIds:z.array(z.string().uuid()).max(500).default([])
}).strict();
const veterinaryFinancialQuerySchema=z.object({
  patientId:z.string().min(10).optional()
});

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

const labOrderSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  laboratory: optionalText,
  specimenType: optionalText,
  fasting: z.boolean().default(false),
  notes: optionalText,
  tests: z.array(z.object({
    testCode: z.string().trim().max(80).optional().nullable(),
    testName: z.string().trim().min(2).max(180),
    category: z.string().trim().max(100).optional().nullable(),
    unit: z.string().trim().max(60).optional().nullable(),
    referenceMin: z.coerce.number().optional().nullable(),
    referenceMax: z.coerce.number().optional().nullable(),
    referenceText: z.string().trim().max(240).optional().nullable()
  })).min(1).max(100)
});

const labResultSchema = z.object({
  labOrderId: z.string().min(10),
  resultId: z.string().min(10).optional().nullable(),
  testCode: z.string().trim().max(80).optional().nullable(),
  testName: z.string().trim().min(2).max(180),
  category: z.string().trim().max(100).optional().nullable(),
  valueText: optionalText,
  valueNumeric: z.coerce.number().optional().nullable(),
  unit: z.string().trim().max(60).optional().nullable(),
  referenceMin: z.coerce.number().optional().nullable(),
  referenceMax: z.coerce.number().optional().nullable(),
  referenceText: z.string().trim().max(240).optional().nullable(),
  observedAt: optionalDate,
  notes: optionalText,
  attachmentPath: optionalText
}).superRefine((value, refinement) => {
  const hasText=Boolean(String(value.valueText||'').trim());
  const hasNumeric=value.valueNumeric!==null&&value.valueNumeric!==undefined;
  if(!hasText&&!hasNumeric) refinement.addIssue({code:'custom',path:['valueNumeric'],message:'El resultado requiere un valor numérico o textual.'});
  if(value.referenceMin!==null&&value.referenceMin!==undefined&&value.referenceMax!==null&&value.referenceMax!==undefined&&value.referenceMin>value.referenceMax){
    refinement.addIssue({code:'custom',path:['referenceMax'],message:'El máximo de referencia debe ser mayor o igual al mínimo.'});
  }
});

const studySchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  kind: z.enum(['xray', 'ultrasound', 'ct', 'mri', 'ecg', 'endoscopy', 'pathology', 'dental', 'other']).default('other'),
  title: z.string().trim().min(2).max(240),
  bodySite: optionalText,
  status: z.enum(['ordered', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('ordered'),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  findings: optionalText,
  impression: optionalText,
  attachmentPath: optionalText,
  externalUrl: z.string().url().optional().nullable().or(z.literal(''))
});

const hospitalizationSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  admittedAt: optionalDate,
  ward: optionalText,
  cage: optionalText,
  reason: z.string().trim().min(2).max(1000),
  diagnosis: optionalText,
  status: z.enum(['admitted', 'observed', 'discharged', 'transferred', 'cancelled']).default('admitted'),
  carePlan: z.record(z.string(), z.unknown()).default({})
});

const hospitalizationStatusSchema = z.object({
  status: z.enum(['admitted', 'observed', 'discharged', 'transferred', 'cancelled']),
  dischargedAt: optionalDate,
  diagnosis: optionalText
});

const observationSchema = z.object({
  hospitalizationId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  observedAt: optionalDate,
  type: z.enum(['vitals', 'medication', 'feeding', 'fluid', 'procedure', 'note', 'task']).default('note'),
  values: z.record(z.string(), z.unknown()).default({}),
  note: optionalText
});

const treatmentSheetEntrySchema = z.object({
  responsibleProfessionalId: z.string().min(10).optional().nullable(),
  category: z.enum(['medication','feeding','fluid','task','observation','vitals']),
  status: z.enum(['scheduled','completed','skipped','cancelled']).default('completed'),
  title: z.string().trim().min(2).max(240),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  note: optionalText,
  details: z.object({
    medication: optionalText,
    dose: optionalText,
    route: optionalText,
    food: optionalText,
    fluid: optionalText,
    amount: optionalText,
    unit: optionalText,
    rate: optionalText,
    temperature: optionalText,
    heartRate: optionalText,
    respiratoryRate: optionalText,
    weight: optionalText
  }).default({})
}).superRefine((value, refinement) => {
  const requireDetail=(field, message)=>{
    if(!String(value.details?.[field]||'').trim()) refinement.addIssue({code:'custom',path:['details',field],message});
  };
  if (value.status === 'scheduled' && !value.scheduledAt) {
    refinement.addIssue({ code:'custom', path:['scheduledAt'], message:'Una tarea programada requiere fecha/hora.' });
  }
  if(value.category==='medication'){
    requireDetail('medication','Indica el medicamento.');
    requireDetail('dose','Indica la dosis registrada manualmente.');
  }
  if(value.category==='feeding')requireDetail('food','Indica la alimentación.');
  if(value.category==='fluid')requireDetail('fluid','Indica el fluido.');
  if(value.category==='observation'&&!String(value.note||'').trim()){
    refinement.addIssue({code:'custom',path:['note'],message:'La observación no puede estar vacía.'});
  }
  if(value.category==='vitals'&&!['temperature','heartRate','respiratoryRate','weight'].some((key)=>String(value.details?.[key]||'').trim())){
    refinement.addIssue({code:'custom',path:['details'],message:'Registra al menos un signo vital.'});
  }
});

const procedureSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(240),
  kind: z.string().trim().min(2).max(120).default('procedure'),
  status: z.enum(['planned', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('planned'),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  anesthesia: optionalText,
  notes: optionalText,
  outcome: optionalText
});

const communicationSchema = z.object({
  patientId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  channel: z.enum(['whatsapp', 'email', 'sms', 'push']),
  event: z.string().trim().min(2).max(100),
  recipient: z.string().trim().min(3).max(240),
  templateId: z.string().optional().nullable(),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'skipped']).default('queued'),
  scheduledAt: optionalDate,
  sentAt: optionalDate,
  providerMessageId: optionalText,
  payload: z.record(z.string(), z.unknown()).default({}),
  error: optionalText
});

const appointmentStatusSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
  reminderStatus: z.enum(['pending', 'queued', 'sent', 'failed', 'skipped']).optional(),
  notes: optionalText
});

function inferFlag(body: Pick<z.infer<typeof labResultSchema>, 'valueNumeric'|'valueText'|'referenceMin'|'referenceMax'>) {
  if (body.valueNumeric !== null && body.valueNumeric !== undefined) {
    if (body.referenceMin !== null && body.referenceMin !== undefined && body.valueNumeric < body.referenceMin) return 'low';
    if (body.referenceMax !== null && body.referenceMax !== undefined && body.valueNumeric > body.referenceMax) return 'high';
    return 'normal';
  }
  // Text alone does not prove an abnormal result. Without an explicit typed
  // reference rule, keep the deterministic neutral flag instead of guessing.
  return 'normal';
}

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

router.get('/dashboard', asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const [patients, appointments, labOrders, criticalResults, hospitalizations, vaccines] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CarePatient" WHERE "tenantId"=$1 AND "kind"='animal' AND "active"=true`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" IN ('scheduled','confirmed','checked_in'))::int AS pending FROM public."CareAppointment" a JOIN public."CarePatient" p ON p."id"=a."patientId" WHERE a."tenantId"=$1 AND p."kind"='animal' AND a."startsAt">=date_trunc('day',now()) AND a."startsAt"<date_trunc('day',now())+interval '1 day'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareLabOrder" WHERE "tenantId"=$1 AND "status" NOT IN ('completed','cancelled')`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareLabResult" WHERE "tenantId"=$1 AND "flag" IN ('critical','high','low','abnormal') AND "observedAt">=now()-interval '30 days'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "status" IN ('admitted','observed')`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareImmunization" i JOIN public."CarePatient" p ON p."id"=i."patientId" WHERE i."tenantId"=$1 AND p."kind"='animal' AND i."nextDueAt" IS NOT NULL AND i."nextDueAt"<=now()+interval '30 days'`, tenantId)
  ]);
  ok(res, {
    patients: Number(patients[0]?.total || 0),
    appointmentsToday: appointments[0] || { total: 0, pending: 0 },
    pendingLabOrders: Number(labOrders[0]?.total || 0),
    abnormalResults: Number(criticalResults[0]?.total || 0),
    hospitalized: Number(hospitalizations[0]?.total || 0),
    vaccinesDue: Number(vaccines[0]?.total || 0)
  });
}));

router.get('/lab-orders', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const status = String(req.query.status || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*, p."displayName" AS "patientName", p."species", p."breed", pr."fullName" AS "professionalName",
      count(r."id")::int AS "resultCount",
      count(r."id") FILTER (WHERE r."flag" IN ('critical','high','low','abnormal'))::int AS "abnormalCount"
    FROM public."CareLabOrder" o
    JOIN public."CarePatient" p ON p."id"=o."patientId" AND p."tenantId"=o."tenantId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId" AND pr."tenantId"=o."tenantId"
    LEFT JOIN public."CareLabResult" r ON r."labOrderId"=o."id" AND r."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1 AND ($2='' OR o."patientId"=$2) AND ($3='' OR o."status"=$3)
    GROUP BY o."id", p."displayName", p."species", p."breed", pr."fullName"
    ORDER BY o."orderedAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, status);
  ok(res, rows);
}));

router.post('/lab-orders', asyncHandler(async (req, res) => {
  const body = labOrderSchema.parse(req.body || {});
  const tenantId = ctx(req).tenantId;
  const patientRows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' LIMIT 1`, tenantId, body.patientId);
  if (!patientRows.length) throw new HttpError(404, 'Mascota no encontrada.');
  if(body.professionalId){
    const professionalRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,body.professionalId);
    if(!professionalRows.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  if(body.encounterId){
    const encounterRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3 LIMIT 1`,tenantId,body.encounterId,body.patientId);
    if(!encounterRows.length)throw new HttpError(422,'El encuentro no pertenece a la mascota activa.');
  }
  const orderNumber = referenceNumber('VET-LAB');
  const order = await prisma.$transaction(async (tx) => {
    const orderRows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareLabOrder" ("id","tenantId","patientId","encounterId","professionalId","orderNumber","status","priority","laboratory","specimenType","fasting","notes","orderedAt","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'ordered',$6,$7,$8,$9,$10,now(),now(),now()) RETURNING *
    `, tenantId, body.patientId, body.encounterId || null, body.professionalId || null, orderNumber, body.priority, body.laboratory || null, body.specimenType || null, body.fasting, body.notes || null);
    const createdOrder = one(orderRows);
    for (const test of body.tests) {
      await tx.$executeRawUnsafe(`
        INSERT INTO public."CareLabResult" ("id","tenantId","labOrderId","testCode","testName","category","unit","referenceMin","referenceMax","referenceText","flag","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,'normal',now())
      `, tenantId, createdOrder.id, test.testCode || null, test.testName, test.category || null, test.unit || null, test.referenceMin ?? null, test.referenceMax ?? null, test.referenceText || null);
    }
    return createdOrder;
  });
  ok(res, order, 201);
}));

router.get('/lab-results', asyncHandler(async (req, res) => {
  const labOrderId = String(req.query.labOrderId || '');
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.*, o."orderNumber", o."patientId", o."status" AS "orderStatus", p."displayName" AS "patientName"
    FROM public."CareLabResult" r
    JOIN public."CareLabOrder" o ON o."id"=r."labOrderId" AND o."tenantId"=r."tenantId"
    JOIN public."CarePatient" p ON p."id"=o."patientId" AND p."tenantId"=o."tenantId" AND p."kind"='animal'
    WHERE r."tenantId"=$1 AND ($2='' OR r."labOrderId"=$2) AND ($3='' OR o."patientId"=$3)
    ORDER BY r."observedAt" DESC, r."testName" ASC LIMIT 2000
  `, ctx(req).tenantId, labOrderId, patientId);
  ok(res, rows);
}));

router.post('/lab-results', asyncHandler(async (req, res) => {
  const body = labResultSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  const verifier=ctx(req).email||ctx(req).userId||null;

  const result=await prisma.$transaction(async (tx)=>{
    const orderRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","status" FROM public."CareLabOrder"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `,tenantId,body.labOrderId);
    const order=one(orderRows,'Orden de laboratorio no encontrada.');
    if(order.status==='cancelled')throw new HttpError(409,'La orden de laboratorio está cancelada.');
    if(order.status==='completed')throw new HttpError(409,'La orden de laboratorio ya está completada.');

    let rows:any[]=[];
    if(body.resultId){
      const targetRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","testCode","testName","category","unit","referenceMin","referenceMax","referenceText"
        FROM public."CareLabResult"
        WHERE "tenantId"=$1 AND "id"=$2 AND "labOrderId"=$3
          AND "valueNumeric" IS NULL
          AND COALESCE("valueText",'')=''
        FOR UPDATE
      `,tenantId,body.resultId,body.labOrderId);
      const target=one(targetRows,'Prueba ordenada no encontrada o ya fue informada.');
      const referenceMin=target.referenceMin===null||target.referenceMin===undefined?null:Number(target.referenceMin);
      const referenceMax=target.referenceMax===null||target.referenceMax===undefined?null:Number(target.referenceMax);
      const flag=inferFlag({
        valueNumeric:body.valueNumeric,
        valueText:body.valueText,
        referenceMin,
        referenceMax
      });

      rows=await tx.$queryRawUnsafe<any[]>(`
        UPDATE public."CareLabResult"
        SET "valueText"=$4,
            "valueNumeric"=$5,
            "flag"=$6,
            "observedAt"=COALESCE($7::timestamptz,now()),
            "verifiedBy"=$8,
            "notes"=$9,
            "attachmentPath"=$10
        WHERE "tenantId"=$1 AND "id"=$2 AND "labOrderId"=$3
          AND "valueNumeric" IS NULL
          AND COALESCE("valueText",'')=''
        RETURNING *
      `,tenantId,body.resultId,body.labOrderId,body.valueText||null,body.valueNumeric??null,flag,body.observedAt||null,verifier,body.notes||null,body.attachmentPath||null);
      if(!rows.length)throw new HttpError(409,'La prueba ya fue informada por otra operación.');
    }else{
      const flag=inferFlag(body);
      rows=await tx.$queryRawUnsafe<any[]>(`
        INSERT INTO public."CareLabResult" ("id","tenantId","labOrderId","testCode","testName","category","valueText","valueNumeric","unit","referenceMin","referenceMax","referenceText","flag","observedAt","verifiedBy","notes","attachmentPath","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz,now()),$14,$15,$16,now())
        RETURNING *
      `,tenantId,body.labOrderId,body.testCode||null,body.testName,body.category||null,body.valueText||null,body.valueNumeric??null,body.unit||null,body.referenceMin??null,body.referenceMax??null,body.referenceText||null,flag,body.observedAt||null,verifier,body.notes||null,body.attachmentPath||null);
    }

    const pendingRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT count(*)::int AS "pendingCount"
      FROM public."CareLabResult"
      WHERE "tenantId"=$1 AND "labOrderId"=$2
        AND "valueNumeric" IS NULL
        AND COALESCE("valueText",'')=''
    `,tenantId,body.labOrderId);
    const pendingCount=Number(pendingRows[0]?.pendingCount||0);
    await tx.$executeRawUnsafe(`
      UPDATE public."CareLabOrder"
      SET "status"=$3,"updatedAt"=now()
      WHERE "id"=$1 AND "tenantId"=$2
    `,body.labOrderId,tenantId,pendingCount===0?'completed':'processing');

    return one(rows);
  });

  ok(res,result,201);
}));
router.get('/studies', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT s.*, p."displayName" AS "patientName", pr."fullName" AS "professionalName"
    FROM public."CareDiagnosticStudy" s JOIN public."CarePatient" p ON p."id"=s."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=s."professionalId"
    WHERE s."tenantId"=$1 AND ($2='' OR s."patientId"=$2)
    ORDER BY COALESCE(s."performedAt",s."scheduledAt",s."createdAt") DESC LIMIT 1000
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/studies', asyncHandler(async (req, res) => {
  const b = studySchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareDiagnosticStudy" ("id","tenantId","patientId","encounterId","professionalId","kind","title","bodySite","status","scheduledAt","performedAt","findings","impression","attachmentPath","externalUrl","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, b.kind, b.title, b.bodySite || null, b.status, b.scheduledAt || null, b.performedAt || null, b.findings || null, b.impression || null, b.attachmentPath || null, b.externalUrl || null);
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

router.get('/hospitalizations', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const status = String(req.query.status || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT h.*, p."displayName" AS "patientName", p."species", p."breed", pr."fullName" AS "professionalName",
      count(o."id")::int AS "observationCount"
    FROM public."CareHospitalization" h JOIN public."CarePatient" p ON p."id"=h."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=h."professionalId" AND pr."tenantId"=h."tenantId"
    LEFT JOIN public."CareHospitalObservation" o ON o."hospitalizationId"=h."id"
    WHERE h."tenantId"=$1 AND ($2='' OR h."patientId"=$2) AND ($3='' OR h."status"=$3)
    GROUP BY h."id",p."displayName",p."species",p."breed",pr."fullName"
    ORDER BY h."admittedAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, status);
  ok(res, rows);
}));

router.post('/hospitalizations', asyncHandler(async (req, res) => {
  const b = hospitalizationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.professionalId){
    const professionals=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  if(b.encounterId){
    const encounters=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3 LIMIT 1`,tenantId,b.encounterId,b.patientId);
    if(!encounters.length)throw new HttpError(422,'El encuentro no pertenece a la mascota hospitalizada.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareHospitalization" ("id","tenantId","patientId","encounterId","professionalId","admissionNumber","admittedAt","ward","cage","reason","diagnosis","status","carePlan","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,COALESCE($6::timestamptz,now()),$7,$8,$9,$10,$11,$12::jsonb,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, referenceNumber('VET-HOSP'), b.admittedAt || null, b.ward || null, b.cage || null, b.reason, b.diagnosis || null, b.status, JSON.stringify(b.carePlan));
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

router.patch('/hospitalizations/:id/status', asyncHandler(async (req, res) => {
  const b = hospitalizationStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareHospitalization" SET "status"=$3,"dischargedAt"=CASE WHEN $3='discharged' THEN COALESCE($4::timestamptz,now()) ELSE "dischargedAt" END,"diagnosis"=COALESCE($5,"diagnosis"),"updatedAt"=now()
    WHERE "id"=$1 AND "tenantId"=$2 RETURNING *
  `, req.params.id, ctx(req).tenantId, b.status, b.dischargedAt || null, b.diagnosis || null);
  ok(res, one(rows, 'Hospitalización no encontrada.'));
}));

router.get('/hospitalizations/:id/treatment-sheet', asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const hospitalizationRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."CareHospitalization"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,req.params.id);
  one(hospitalizationRows,'Hospitalización no encontrada.');

  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*,pr."fullName" AS "responsibleProfessionalName"
    FROM public."CareHospitalObservation" o
    LEFT JOIN public."CareProfessional" pr
      ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1
      AND o."hospitalizationId"=$2
      AND o."values"->>'treatmentSheetVersion'='1'
    ORDER BY o."observedAt" DESC,o."createdAt" DESC
    LIMIT 3000
  `,tenantId,req.params.id);

  ok(res,rows.map((row)=>({
    id:row.id,
    hospitalizationId:row.hospitalizationId,
    responsibleProfessionalId:row.professionalId,
    responsibleProfessionalName:row.responsibleProfessionalName||null,
    observedAt:row.observedAt,
    createdAt:row.createdAt,
    type:row.type,
    note:row.note,
    ...(row.values&&typeof row.values==='object'?row.values:{})
  })));
}));

router.post('/hospitalizations/:id/treatment-sheet', asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const body=treatmentSheetEntrySchema.parse(req.body||{});
  const now=new Date().toISOString();
  const result=await prisma.$transaction(async (tx)=>{
    const hospitalizationRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT h."id",h."patientId",h."status"
      FROM public."CareHospitalization" h
      JOIN public."CarePatient" p
        ON p."id"=h."patientId" AND p."tenantId"=h."tenantId" AND p."kind"='animal'
      WHERE h."tenantId"=$1 AND h."id"=$2
      FOR UPDATE OF h
    `,tenantId,req.params.id);
    const hospitalization=one(hospitalizationRows,'Hospitalización no encontrada.');
    if(!['admitted','observed'].includes(String(hospitalization.status))){
      throw new HttpError(409,'La hospitalización ya no admite nuevas tareas o cuidados.');
    }

    if(body.responsibleProfessionalId){
      const professionals=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."CareProfessional"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
      `,tenantId,body.responsibleProfessionalId);
      if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
    }

    const scheduledAt=body.scheduledAt||null;
    const performedAt=body.status==='completed'?(body.performedAt||now):(body.performedAt||null);
    const observedAt=performedAt||scheduledAt||now;
    const type=body.category==='observation'?'note':body.category;
    const values={
      treatmentSheetVersion:'1',
      category:body.category,
      status:body.status,
      title:body.title,
      scheduledAt,
      performedAt,
      responsibleProfessionalId:body.responsibleProfessionalId||null,
      actorUserId:ctx(req).userId||null,
      actorEmail:ctx(req).email||null,
      details:body.details
    };

    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareHospitalObservation"
        ("id","tenantId","hospitalizationId","professionalId","observedAt","type","values","note","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5,$6::jsonb,$7,now())
      RETURNING *
    `,tenantId,hospitalization.id,body.responsibleProfessionalId||null,observedAt,type,JSON.stringify(values),body.note||null);

    const row=one(rows);
    return {
      ...row,
      ...values,
      responsibleProfessionalId:row.professionalId
    };
  });

  ok(res,result,201);
}));
router.get('/observations', asyncHandler(async (req, res) => {
  const hospitalizationId = String(req.query.hospitalizationId || '');
  if (!hospitalizationId) throw new HttpError(422, 'hospitalizationId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*,pr."fullName" AS "professionalName" FROM public."CareHospitalObservation" o
    JOIN public."CareHospitalization" h ON h."id"=o."hospitalizationId" AND h."tenantId"=o."tenantId"
    LEFT JOIN public."CareProfessional" pr ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1 AND o."hospitalizationId"=$2 ORDER BY o."observedAt" DESC LIMIT 2000
  `, ctx(req).tenantId, hospitalizationId);
  ok(res, rows);
}));

router.post('/observations', asyncHandler(async (req, res) => {
  const b = observationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.professionalId){
    const professionals=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareHospitalObservation" ("id","tenantId","hospitalizationId","professionalId","observedAt","type","values","note","createdAt")
    SELECT gen_random_uuid()::text,$1,h."id",$3,COALESCE($4::timestamptz,now()),$5,$6::jsonb,$7,now()
    FROM public."CareHospitalization" h WHERE h."id"=$2 AND h."tenantId"=$1 AND h."status" IN ('admitted','observed') RETURNING *
  `, ctx(req).tenantId, b.hospitalizationId, b.professionalId || null, b.observedAt || null, b.type, JSON.stringify(b.values), b.note || null);
  ok(res, one(rows, 'Hospitalización activa no encontrada.'), 201);
}));

router.get('/procedures', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*,p."displayName" AS "patientName",pr."fullName" AS "professionalName"
    FROM public."CareProcedure" c JOIN public."CarePatient" p ON p."id"=c."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=c."professionalId"
    WHERE c."tenantId"=$1 AND ($2='' OR c."patientId"=$2) ORDER BY COALESCE(c."performedAt",c."scheduledAt",c."createdAt") DESC LIMIT 1000
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/procedures', asyncHandler(async (req, res) => {
  const b = procedureSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareProcedure" ("id","tenantId","patientId","encounterId","professionalId","name","kind","status","scheduledAt","performedAt","anesthesia","notes","outcome","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, b.name, b.kind, b.status, b.scheduledAt || null, b.performedAt || null, b.anesthesia || null, b.notes || null, b.outcome || null);
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

router.get('/communications', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const appointmentId = String(req.query.appointmentId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.*,p."displayName" AS "patientName" FROM public."CareCommunicationLog" l
    LEFT JOIN public."CarePatient" p ON p."id"=l."patientId"
    WHERE l."tenantId"=$1 AND ($2='' OR l."patientId"=$2) AND ($3='' OR l."appointmentId"=$3)
    ORDER BY l."createdAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, appointmentId);
  ok(res, rows);
}));

router.post('/communications', asyncHandler(async (req, res) => {
  const b = communicationSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareCommunicationLog" ("id","tenantId","patientId","appointmentId","channel","event","recipient","templateId","status","scheduledAt","sentAt","providerMessageId","payload","error","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::jsonb,$13,now()) RETURNING *
  `, ctx(req).tenantId, b.patientId || null, b.appointmentId || null, b.channel, b.event, b.recipient, b.templateId || null, b.status, b.scheduledAt || null, b.sentAt || null, b.providerMessageId || null, JSON.stringify(b.payload), b.error || null);
  ok(res, one(rows), 201);
}));

router.patch('/appointments/:id/status', asyncHandler(async (req, res) => {
  const b = appointmentStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareAppointment" a SET "status"=$3,"reminderStatus"=COALESCE($4,"reminderStatus"),"notes"=COALESCE($5,"notes"),"updatedAt"=now()
    FROM public."CarePatient" p
    WHERE a."id"=$1 AND a."tenantId"=$2 AND p."id"=a."patientId" AND p."kind"='animal' RETURNING a.*
  `, req.params.id, ctx(req).tenantId, b.status, b.reminderStatus || null, b.notes || null);
  ok(res, one(rows, 'Cita veterinaria no encontrada.'));
}));


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
