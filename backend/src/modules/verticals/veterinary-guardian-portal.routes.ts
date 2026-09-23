import { createHash } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';

const router=Router();
const sessionSchema=z.object({accessToken:z.string().trim().min(40).max(200)}).strict();
const PORTAL_SCOPES=new Set(['appointments','reminders','discharge','documents','payments','communications']);

const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
const safeScopes=(value:unknown)=>{
  const items=Array.isArray(value)?value:[];
  return [...new Set(items.map(String).filter((scope)=>PORTAL_SCOPES.has(scope)))];
};
const externalDocumentUrl=(value:unknown)=>{
  const raw=String(value||'').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    return url.protocol==='https:'?url.toString():null;
  }catch{return null;}
};
const noStore=(res:any)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Referrer-Policy','no-referrer');
};

router.post('/session', asyncHandler(async (req,res)=>{
  noStore(res);
  const {accessToken}=sessionSchema.parse(req.body||{});
  const tokenSha256=sha256(accessToken);
  const grantRows=await prisma.$queryRawUnsafe<any[]>(\`
    SELECT g.*,p."displayName",p."species",p."breed",p."photoUrl"
    FROM public."VeterinaryGuardianPortalGrant" g
    JOIN public."CarePatient" p
      ON p."tenantId"=g."tenantId" AND p."id"=g."patientId" AND p."kind"='animal' AND p."active"=true
    WHERE g."tokenSha256"=$1
      AND g."revokedAt" IS NULL
      AND g."expiresAt">now()
    LIMIT 1
  \`,tokenSha256);
  if(!grantRows.length)throw new HttpError(401,'Acceso vencido, revocado o inválido.');
  const grant=grantRows[0];
  const scopes=safeScopes(grant.scopes);
  const tenantId=String(grant.tenantId);
  const patientId=String(grant.patientId);

  const [appointments,communications,hospitalizations,studies,payments]=await Promise.all([
    scopes.includes('appointments')||scopes.includes('reminders')
      ? prisma.$queryRawUnsafe<any[]>(\`
          SELECT "id","startsAt","endsAt","status","reason","channel","room","reminderStatus"
          FROM public."CareAppointment"
          WHERE "tenantId"=$1 AND "patientId"=$2
            AND "startsAt">=now()-interval '30 days'
          ORDER BY "startsAt" ASC
          LIMIT 100
        \`,tenantId,patientId)
      : Promise.resolve([]),
    scopes.includes('communications')||scopes.includes('reminders')
      ? prisma.$queryRawUnsafe<any[]>(\`
          SELECT "id","channel","event","status","scheduledAt","sentAt","createdAt"
          FROM public."CareCommunicationLog"
          WHERE "tenantId"=$1 AND "patientId"=$2
          ORDER BY "createdAt" DESC
          LIMIT 100
        \`,tenantId,patientId)
      : Promise.resolve([]),
    scopes.includes('discharge')
      ? prisma.$queryRawUnsafe<any[]>(\`
          SELECT "id","admissionNumber","status","admittedAt","dischargedAt","ward"
          FROM public."CareHospitalization"
          WHERE "tenantId"=$1 AND "patientId"=$2
          ORDER BY "admittedAt" DESC
          LIMIT 20
        \`,tenantId,patientId)
      : Promise.resolve([]),
    scopes.includes('documents')
      ? prisma.$queryRawUnsafe<any[]>(\`
          SELECT "id","kind","title","bodySite","status","scheduledAt","performedAt","externalUrl"
          FROM public."CareDiagnosticStudy"
          WHERE "tenantId"=$1 AND "patientId"=$2
          ORDER BY COALESCE("performedAt","scheduledAt","createdAt") DESC
          LIMIT 50
        \`,tenantId,patientId)
      : Promise.resolve([]),
    scopes.includes('payments')
      ? prisma.$queryRawUnsafe<any[]>(\`
          SELECT f."id",f."status",f."currency",f."estimatedTotal"::text AS "estimatedTotal",
                 s."number" AS "invoiceNumber",s."status"::text AS "invoiceStatus",s."total"::text AS "invoiceTotal"
          FROM public."VeterinaryFinancialCase" f
          LEFT JOIN public."SalesInvoice" s
            ON s."tenantId"=f."tenantId" AND s."id"=f."salesInvoiceId"
          WHERE f."tenantId"=$1 AND f."patientId"=$2
          ORDER BY f."createdAt" DESC
          LIMIT 50
        \`,tenantId,patientId)
      : Promise.resolve([])
  ]);

  await prisma.$executeRawUnsafe(\`
    UPDATE public."VeterinaryGuardianPortalGrant"
    SET "lastUsedAt"=now()
    WHERE "id"=$1 AND "tokenSha256"=$2
  \`,grant.id,tokenSha256);

  ok(res,{
    access:{expiresAt:grant.expiresAt,scopes},
    patient:{displayName:grant.displayName,species:grant.species,breed:grant.breed,photoUrl:grant.photoUrl||null},
    appointments,
    reminders:appointments.map((item)=>({appointmentId:item.id,startsAt:item.startsAt,status:item.reminderStatus})),
    discharge:hospitalizations,
    documents:studies.map((item)=>({...item,externalUrl:externalDocumentUrl(item.externalUrl)})),
    payments,
    communications
  });
}));

export default router;
