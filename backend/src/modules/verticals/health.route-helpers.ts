import type { Prisma } from '@prisma/client';
import { HttpError } from '../../shared/http.js';
import { dentalClinicalDataSchema, dentalTreatmentPlanClinicalDataSchema } from './health.schemas.js';

export const ACTIVE_APPOINTMENT_STATUSES=['scheduled','confirmed','checked_in','in_progress'] as const;
export const lockAppointmentSchedule = async (tx:Prisma.TransactionClient, tenantId:string) => {
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',`care-appointment:${tenantId}`);
};
export const assertAppointmentSlotAvailable = async (tx:Prisma.TransactionClient, input:{
  tenantId:string; appointmentId?:string; patientId:string; professionalId?:string|null;
  startsAt:string; endsAt:string; room?:string|null;
}) => {
  const room=String(input.room||'').trim()||null;
  const rows=await tx.$queryRawUnsafe<any[]>(`
    SELECT "id","patientId","professionalId","room","startsAt","endsAt"
    FROM public."CareAppointment"
    WHERE "tenantId"=$1
      AND "id"<>$2
      AND "status" = ANY($3::text[])
      AND "startsAt" < $5::timestamptz
      AND "endsAt" > $4::timestamptz
      AND (
        "patientId"=$6
        OR ($7::text IS NOT NULL AND "professionalId"=$7)
        OR ($8::text IS NOT NULL AND "room" IS NOT NULL AND lower(btrim("room"))=lower(btrim($8)))
      )
    ORDER BY "startsAt" ASC
    LIMIT 10
  `,input.tenantId,input.appointmentId||'',ACTIVE_APPOINTMENT_STATUSES,input.startsAt,input.endsAt,input.patientId,input.professionalId||null,room);
  if(!rows.length)return;
  const patientConflict=rows.some((row)=>row.patientId===input.patientId);
  const professionalConflict=Boolean(input.professionalId)&&rows.some((row)=>row.professionalId===input.professionalId);
  const resourceConflict=Boolean(room)&&rows.some((row)=>String(row.room||'').trim().toLowerCase()===room.toLowerCase());
  const conflicts=[
    patientConflict?'paciente':null,
    professionalConflict?'profesional':null,
    resourceConflict?'sillón/recurso':null
  ].filter(Boolean).join(', ');
  throw new HttpError(409,`Conflicto de agenda: ${conflicts||'franja ocupada'}.`);
};

export const dentalMoneyCents = (value: unknown) => {
  const raw=String(value??'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new HttpError(422,'Monto estimado inválido.');
  const [whole,fraction='']=raw.split('.');
  return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
};
export const dentalCentsMoney = (value: bigint) => `${value/100n}.${(value%100n).toString().padStart(2,'0')}`;
export const normalizeDentalTreatmentPlan = (clinicalData: unknown) => {
  const parsed=dentalTreatmentPlanClinicalDataSchema.parse(clinicalData);
  const total=parsed.treatmentPlan.phases.reduce((phaseTotal,phase)=>phaseTotal+phase.procedures.reduce((procedureTotal,procedure)=>procedureTotal+(dentalMoneyCents(procedure.unitPrice)*BigInt(procedure.quantity)),0n),0n);
  return {
    ...parsed,
    treatmentPlan:{
      ...parsed.treatmentPlan,
      budget:{...parsed.treatmentPlan.budget,estimatedTotal:dentalCentsMoney(total)},
      status:'proposed',
      acceptance:{status:'pending'}
    }
  };
};

export type DentalFinancialBucket = {
  currency:string;
  quotedCents:bigint;
  draftCents:bigint;
  receivableCents:bigint;
  paidCents:bigint;
};

export const financialBucket=(currency:string):DentalFinancialBucket=>({
  currency,
  quotedCents:0n,
  draftCents:0n,
  receivableCents:0n,
  paidCents:0n
});

export const addFinancialAmount=(bucket:DentalFinancialBucket,status:string,quotedAmount:bigint,invoiceAmount:bigint=quotedAmount)=>{
  bucket.quotedCents+=quotedAmount;
  if(status==='draft')bucket.draftCents+=invoiceAmount;
  if(status==='issued'||status==='overdue')bucket.receivableCents+=invoiceAmount;
  if(status==='paid')bucket.paidCents+=invoiceAmount;
};

export const serializeFinancialBucket=(bucket:DentalFinancialBucket)=>({
  currency:bucket.currency,
  quotedTotal:dentalCentsMoney(bucket.quotedCents),
  draftTotal:dentalCentsMoney(bucket.draftCents),
  receivableTotal:dentalCentsMoney(bucket.receivableCents),
  paidTotal:dentalCentsMoney(bucket.paidCents)
});

export const normalizeFinancialLink=(row:any)=>({
  id:String(row.id),
  treatmentPlanId:String(row.treatmentPlanId),
  patientId:String(row.patientId),
  patientName:String(row.patientName||'Paciente'),
  professionalId:row.professionalId?String(row.professionalId):null,
  professionalName:row.professionalName?String(row.professionalName):'Sin profesional',
  salesInvoiceId:String(row.salesInvoiceId),
  invoiceNumber:String(row.invoiceNumber||''),
  invoiceStatus:String(row.invoiceStatus||'draft'),
  currency:String(row.currency||'VES'),
  quotedTotal:String(row.quotedTotal||'0.00'),
  invoiceTotal:String(row.invoiceTotal||row.quotedTotal||'0.00'),
  budgetSnapshot:row.budgetSnapshot&&typeof row.budgetSnapshot==='object'?row.budgetSnapshot:{},
  createdBy:row.createdBy?String(row.createdBy):null,
  createdAt:row.createdAt
});

export const buildDentalFinancialAnalytics=(rows:any[])=>{
  const totals=new Map<string,DentalFinancialBucket>();
  const professionals=new Map<string,{key:string;professionalId:string|null;professionalName:string;bucket:DentalFinancialBucket}>();
  const procedures=new Map<string,{key:string;procedure:string;currency:string;quantity:number;bucket:DentalFinancialBucket}>();

  for(const raw of rows){
    const row=normalizeFinancialLink(raw);
    const quotedAmount=dentalMoneyCents(row.quotedTotal);
    const invoiceAmount=dentalMoneyCents(row.invoiceTotal);
    if(!totals.has(row.currency))totals.set(row.currency,financialBucket(row.currency));
    addFinancialAmount(totals.get(row.currency)!,row.invoiceStatus,quotedAmount,invoiceAmount);

    const professionalKey=`${row.professionalId||'unassigned'}:${row.currency}`;
    if(!professionals.has(professionalKey))professionals.set(professionalKey,{
      key:professionalKey,
      professionalId:row.professionalId,
      professionalName:row.professionalName,
      bucket:financialBucket(row.currency)
    });
    addFinancialAmount(professionals.get(professionalKey)!.bucket,row.invoiceStatus,quotedAmount,invoiceAmount);

    const lines=Array.isArray((row.budgetSnapshot as any)?.lines)?(row.budgetSnapshot as any).lines:[];
    for(const line of lines){
      const procedure=String(line?.procedure||'Procedimiento').trim()||'Procedimiento';
      const currency=String(row.currency||'VES');
      const procedureKey=`${procedure}:${currency}`;
      if(!procedures.has(procedureKey))procedures.set(procedureKey,{
        key:procedureKey,
        procedure,
        currency,
        quantity:0,
        bucket:financialBucket(currency)
      });
      const target=procedures.get(procedureKey)!;
      target.quantity+=Number.isFinite(Number(line?.quantity))?Number(line.quantity):0;
      addFinancialAmount(target.bucket,row.invoiceStatus,dentalMoneyCents(String(line?.lineTotal||'0.00')));
    }
  }

  const byQuoted=(left:{bucket:DentalFinancialBucket},right:{bucket:DentalFinancialBucket})=>
    left.bucket.quotedCents===right.bucket.quotedCents?0:left.bucket.quotedCents>right.bucket.quotedCents?-1:1;

  return {
    totalsByCurrency:[...totals.values()].sort((a,b)=>a.currency.localeCompare(b.currency)).map(serializeFinancialBucket),
    professionals:[...professionals.values()].sort(byQuoted).map((item)=>({
      key:item.key,
      professionalId:item.professionalId,
      professionalName:item.professionalName,
      ...serializeFinancialBucket(item.bucket)
    })),
    procedures:[...procedures.values()].sort(byQuoted).map((item)=>({
      key:item.key,
      procedure:item.procedure,
      currency:item.currency,
      quantity:item.quantity,
      ...serializeFinancialBucket(item.bucket)
    }))
  };
};

export const dentalFinancialLinkSelect = `
  SELECT l.*,
         s."number" AS "invoiceNumber",
         s."status"::text AS "invoiceStatus",
         s."total" AS "invoiceTotal",
         p."displayName" AS "patientName",
         e."professionalId" AS "professionalId",
         pr."fullName" AS "professionalName"
  FROM public."DentalFinancialLink" l
  JOIN public."SalesInvoice" s
    ON s."tenantId"=l."tenantId" AND s."id"=l."salesInvoiceId"
  JOIN public."CarePatient" p
    ON p."tenantId"=l."tenantId" AND p."id"=l."patientId"
  JOIN public."CareEncounter" e
    ON e."tenantId"=l."tenantId" AND e."id"=l."treatmentPlanId"
  LEFT JOIN public."CareProfessional" pr
    ON pr."tenantId"=e."tenantId" AND pr."id"=e."professionalId"
`;

export const normalizeDentalTreatmentDraft = (clinicalData: unknown, actor: { userId:string|null; email:string|null }) => {
  const parsed=dentalClinicalDataSchema.parse(clinicalData);
  const createdAt=new Date().toISOString();
  return {
    ...parsed,
    lifecycle:{
      state:'draft',
      purpose:'treatment',
      createdBy:actor,
      createdAt
    }
  };
};

export const dentalSnapshot = (clinicalData: any) => {
  const source = clinicalData && typeof clinicalData === 'object' ? clinicalData : {};
  const odontogram = source.odontogram && typeof source.odontogram === 'object' ? source.odontogram : {};
  return {
    dentition:String(odontogram.dentition || ''),
    tooth:String(odontogram.tooth || source.tooth || ''),
    surfaces:Array.isArray(odontogram.surfaces) ? [...odontogram.surfaces].map(String).sort() : [],
    condition:String(odontogram.condition || ''),
    procedure:String(source.procedure || '')
  };
};

export const dentalChangedFields = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

