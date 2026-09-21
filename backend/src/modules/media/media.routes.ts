import express, { Router } from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const BUCKET = 'contagest-media';
const DENTAL_BUCKET = 'contagest-clinical-media';
const MAX_BYTES = 3 * 1024 * 1024;
const allowedMime = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const CLINICAL_MAX_BYTES = 15 * 1024 * 1024;
const clinicalMime = new Map([
  ['image/jpeg','jpg'],
  ['image/png','png'],
  ['image/webp','webp'],
  ['application/pdf','pdf']
]);
const DENTAL_TEETH = new Set(['11','12','13','14','15','16','17','18','21','22','23','24','25','26','27','28','31','32','33','34','35','36','37','38','41','42','43','44','45','46','47','48','51','52','53','54','55','61','62','63','64','65','71','72','73','74','75','81','82','83','84','85']);
const clinicalAttachmentSchema = z.object({
  patientId:z.string().min(10).max(180),
  kind:z.enum(['radiograph','clinical-photo','study','document']),
  title:z.string().trim().min(2).max(180),
  tooth:z.string().trim().max(2).optional().nullable(),
  linkedEncounterId:z.string().min(10).max(180).optional().nullable(),
  treatmentPlanEncounterId:z.string().min(10).max(180).optional().nullable(),
  notes:z.string().trim().max(2000).optional().nullable()
}).superRefine((value,refinement)=>{
  if(value.tooth&&!DENTAL_TEETH.has(value.tooth)) refinement.addIssue({code:'custom',path:['tooth'],message:'La pieza dental no es válida.'});
});

const uploadSchema = z.object({
  entityType: z.enum(['care-patient', 'gym-member', 'profile', 'company']),
  entityId: z.string().min(5).max(180),
  dataUrl: z.string().min(30).max(5_000_000),
  alt: z.string().trim().max(240).optional()
});

const signSchema = z.object({
  paths: z.array(z.string().min(5).max(500)).min(1).max(100),
  expiresIn: z.coerce.number().int().min(60).max(86400).default(3600)
});

const deleteSchema = z.object({ path: z.string().min(5).max(500) });

function client() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'El almacenamiento privado no está configurado en el backend.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function hasPermission(userId: string, tenantId: string, permission: string) {
  return Boolean(await prisma.userRole.count({
    where: {
      userId,
      role: {
        tenantId,
        permissions: { some: { permission: { key: permission } } }
      }
    }
  }));
}

async function authorize(req: any, entityType: string, entityId: string) {
  const context = req.context as { tenantId: string; userId?: string };
  if (!context.userId) throw new HttpError(401, 'Usuario autenticado requerido.');

  if (entityType === 'profile') {
    if (entityId === context.userId) return;
    if (!await hasPermission(context.userId, context.tenantId, 'admin.manage')) {
      throw new HttpError(403, 'Solo puedes actualizar tu propia fotografía.');
    }
    const count = await prisma.userProfile.count({ where: { id: entityId, tenantId: context.tenantId } });
    if (!count) throw new HttpError(404, 'Perfil no encontrado.');
    return;
  }

  if (entityType === 'company') {
    if (!await hasPermission(context.userId, context.tenantId, 'admin.manage')) throw new HttpError(403, 'Permiso administrativo requerido.');
    if (entityId !== context.tenantId) throw new HttpError(403, 'La empresa no pertenece a la sesión activa.');
    return;
  }

  const permission = entityType === 'care-patient' ? 'health.manage' : 'gym.manage';
  if (!await hasPermission(context.userId, context.tenantId, permission)) throw new HttpError(403, `Permiso requerido: ${permission}`);
  const table = entityType === 'care-patient' ? 'CarePatient' : 'GymMember';
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."${table}" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`, entityId, context.tenantId);
  if (!rows.length) throw new HttpError(404, 'El registro no existe en la empresa activa.');
}

function parseDataUrl(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new HttpError(422, 'La imagen debe ser JPEG, PNG o WebP en formato válido.');
  const mime = match[1];
  const extension = allowedMime.get(mime);
  if (!extension) throw new HttpError(422, 'Tipo de imagen no permitido.');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(413, 'La imagen debe pesar entre 1 byte y 3 MB.');
  return { mime, extension, bytes };
}

function tenantPath(tenantId: string, entityType: string, entityId: string, extension: string) {
  const safeEntityId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}/${entityType}/${safeEntityId}/${crypto.randomUUID()}.${extension}`;
}

function validateClinicalMagic(bytes: Buffer, mime: string) {
  const extension=clinicalMime.get(mime);
  if(!extension) throw new HttpError(415,'Tipo de adjunto clínico no permitido.');
  const valid = mime==='image/jpeg'
    ? bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff
    : mime==='image/png'
      ? bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
      : mime==='image/webp'
        ? bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP'
        : bytes.length>=5&&bytes.subarray(0,5).toString('ascii')==='%PDF-';
  if(!valid) throw new HttpError(422,'La firma binaria del archivo no coincide con su tipo declarado.');
  return extension;
}

function safeFileName(value: unknown) {
  let decoded='';
  try{decoded=decodeURIComponent(String(value||''));}catch{decoded=String(value||'');}
  return decoded.replace(/[\\/\0\r\n]/g,'_').trim().slice(0,240)||'archivo';
}

function clinicalStoragePath(tenantId:string, patientId:string, extension:string) {
  const safePatientId=patientId.replace(/[^a-zA-Z0-9_-]/g,'_');
  return `${tenantId}/dental-attachments/${safePatientId}/${crypto.randomUUID()}.${extension}`;
}

async function requireHealthManage(req:any) {
  const context=req.context as {tenantId:string;userId?:string};
  if(!context.userId) throw new HttpError(401,'Usuario autenticado requerido.');
  if(!await hasPermission(context.userId,context.tenantId,'health.manage')) throw new HttpError(403,'Permiso requerido: health.manage');
  return context as {tenantId:string;userId:string};
}

async function validateClinicalPatient(tenantId:string, patientId:string) {
  const rows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='human' AND "active"=true LIMIT 1`,tenantId,patientId);
  if(!rows.length) throw new HttpError(404,'Paciente clínico no encontrado en la empresa activa.');
}

async function validateClinicalLink(tenantId:string,patientId:string,encounterId:string|undefined|null,{treatmentPlan=false}={}) {
  if(!encounterId)return null;
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","type","status" FROM public."CareEncounter"
    WHERE "tenantId"=$1 AND "patientId"=$2 AND "id"=$3
    LIMIT 1
  `,tenantId,patientId,encounterId);
  const row=rows[0]||null;
  if(!row) throw new HttpError(422,'El encuentro relacionado no pertenece al paciente y tenant activos.');
  if(treatmentPlan&&row.type!=='dental-treatment-plan') throw new HttpError(422,'El plan relacionado no es un plan de tratamiento odontológico.');
  return row;
}

async function updateEntityPhoto(tenantId: string, entityType: string, entityId: string, path: string) {
  if (entityType === 'care-patient') {
    await prisma.$executeRawUnsafe(`UPDATE public."CarePatient" SET "photoUrl" = $3, "updatedAt" = now() WHERE "id" = $1 AND "tenantId" = $2`, entityId, tenantId, path);
  } else if (entityType === 'gym-member') {
    await prisma.$executeRawUnsafe(`UPDATE public."GymMember" SET "photoUrl" = $3, "updatedAt" = now() WHERE "id" = $1 AND "tenantId" = $2`, entityId, tenantId, path);
  } else if (entityType === 'profile') {
    await prisma.$executeRawUnsafe(`UPDATE public."UserProfile" SET "updatedAt" = now() WHERE "id" = $1 AND "tenantId" = $2`, entityId, tenantId);
  } else if (entityType === 'company') {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = tenant?.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings) ? tenant.settings as Record<string, unknown> : {};
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...settings, companyLogoPath: path } } });
  }
}

router.post('/upload', asyncHandler(async (req, res) => {
  const body = uploadSchema.parse(req.body || {});
  const context = (req as any).context as { tenantId: string; userId?: string };
  await authorize(req, body.entityType, body.entityId);
  const image = parseDataUrl(body.dataUrl);
  const path = tenantPath(context.tenantId, body.entityType, body.entityId, image.extension);
  const storage = client();
  const { error } = await storage.storage.from(BUCKET).upload(path, image.bytes, {
    contentType: image.mime,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw new HttpError(502, `No se pudo almacenar la imagen: ${error.message}`);
  await updateEntityPhoto(context.tenantId, body.entityType, body.entityId, path);
  const { data: signed, error: signError } = await storage.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (signError) throw new HttpError(502, `Imagen guardada, pero no se pudo firmar la URL: ${signError.message}`);
  ok(res, { path, signedUrl: signed.signedUrl, expiresIn: 3600, alt: body.alt || '' }, 201);
}));

router.get('/dental-attachments', asyncHandler(async (req,res)=>{
  const context=await requireHealthManage(req);
  const patientId=String(req.query.patientId||'');
  if(!patientId) throw new HttpError(422,'patientId es obligatorio.');
  await validateClinicalPatient(context.tenantId,patientId);
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CareEncounter"
    WHERE "tenantId"=$1 AND "patientId"=$2 AND "type"='dental-attachment'
    ORDER BY "createdAt" DESC
    LIMIT 500
  `,context.tenantId,patientId);
  const storage=client();
  const records=await Promise.all(rows.map(async (row)=>{
    const attachment=row.clinicalData?.dentalAttachment||{};
    const storagePath=String(attachment.storagePath||'');
    if(!storagePath.startsWith(`${context.tenantId}/dental-attachments/`)) return {...row,signedUrl:null};
    const {data,error}=await storage.storage.from(DENTAL_BUCKET).createSignedUrl(storagePath,3600);
    return {...row,signedUrl:error?null:data.signedUrl,signError:error?.message||null};
  }));
  ok(res,records);
}));

router.post(
  '/dental-attachments',
  express.raw({type:['image/jpeg','image/png','image/webp','application/pdf'],limit:CLINICAL_MAX_BYTES}),
  asyncHandler(async (req,res)=>{
    const context=await requireHealthManage(req);
    const metadata=clinicalAttachmentSchema.parse(req.query||{});
    await validateClinicalPatient(context.tenantId,metadata.patientId);
    await validateClinicalLink(context.tenantId,metadata.patientId,metadata.linkedEncounterId);
    await validateClinicalLink(context.tenantId,metadata.patientId,metadata.treatmentPlanEncounterId,{treatmentPlan:true});

    const bytes=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
    if(!bytes.length) throw new HttpError(422,'El adjunto clínico está vacío.');
    if(bytes.length>CLINICAL_MAX_BYTES) throw new HttpError(413,'El adjunto clínico no debe superar 15 MB.');
    const mime=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();
    const extension=validateClinicalMagic(bytes,mime);
    const originalName=safeFileName(req.headers['x-file-name']);
    const storagePath=clinicalStoragePath(context.tenantId,metadata.patientId,extension);
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const uploadedAt=new Date().toISOString();
    const attachment={
      kind:metadata.kind,
      title:metadata.title,
      tooth:metadata.tooth||null,
      linkedEncounterId:metadata.linkedEncounterId||null,
      treatmentPlanEncounterId:metadata.treatmentPlanEncounterId||null,
      notes:metadata.notes||null,
      originalName,
      mimeType:mime,
      bytes:bytes.length,
      sha256,
      storagePath,
      uploadedBy:context.userId,
      uploadedAt
    };
    const authority={type:'dental-attachment',confidential:true,status:'signed'} as const;
    const storage=client();
    const {error:uploadError}=await storage.storage.from(DENTAL_BUCKET).upload(storagePath,bytes,{
      contentType:mime,
      cacheControl:'3600',
      upsert:false
    });
    if(uploadError) throw new HttpError(502,`No se pudo almacenar el adjunto clínico: ${uploadError.message}`);

    let encounter:any;
    try{
      const rows=await prisma.$queryRawUnsafe<any[]>(`
        INSERT INTO public."CareEncounter"
          ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
        VALUES
          (gen_random_uuid()::text,$1,$2,NULL,NULL,'dentistry',$3,$4,$5,NULL,NULL,'[]'::jsonb,$6::jsonb,$7,$8,now(),now(),now())
        RETURNING *
      `,context.tenantId,metadata.patientId,authority.type,metadata.notes||null,metadata.title,JSON.stringify({dentalAttachment:attachment}),authority.confidential,authority.status);
      encounter=rows[0];
      if(!encounter) throw new Error('No se creó la autoridad clínica del adjunto.');
    }catch(error){
      await storage.storage.from(DENTAL_BUCKET).remove([storagePath]).catch(()=>undefined);
      throw error;
    }

    const {data:signed,error:signError}=await storage.storage.from(DENTAL_BUCKET).createSignedUrl(storagePath,3600);
    ok(res,{...encounter,signedUrl:signError?null:signed.signedUrl,signError:signError?.message||null},201);
  })
);

router.post('/sign', asyncHandler(async (req, res) => {
  const body = signSchema.parse(req.body || {});
  const context = (req as any).context as { tenantId: string };
  const prefix = `${context.tenantId}/`;
  if (body.paths.some((path) => !path.startsWith(prefix))) throw new HttpError(403, 'Una o más imágenes no pertenecen a la empresa activa.');
  if (body.paths.some((path) => path.startsWith(`${context.tenantId}/dental-attachments/`))) throw new HttpError(403, 'Los adjuntos clínicos deben firmarse mediante el flujo dental autorizado con health.manage.');
  const storage = client();
  const results = await Promise.all(body.paths.map(async (path) => {
    const { data, error } = await storage.storage.from(BUCKET).createSignedUrl(path, body.expiresIn);
    return { path, signedUrl: error ? null : data.signedUrl, error: error?.message || null };
  }));
  ok(res, results);
}));

router.delete('/', asyncHandler(async (req, res) => {
  const body = deleteSchema.parse(req.body || {});
  const context = (req as any).context as { tenantId: string; userId?: string };
  if (!body.path.startsWith(`${context.tenantId}/`)) throw new HttpError(403, 'La imagen no pertenece a la empresa activa.');
  if (body.path.startsWith(`${context.tenantId}/dental-attachments/`)) throw new HttpError(403, 'Un adjunto clínico firmado es inmutable y no puede eliminarse mediante el endpoint genérico.');
  if (!context.userId || !await hasPermission(context.userId, context.tenantId, 'admin.manage')) throw new HttpError(403, 'Permiso administrativo requerido para eliminar archivos.');
  const { error } = await client().storage.from(BUCKET).remove([body.path]);
  if (error) throw new HttpError(502, `No se pudo eliminar la imagen: ${error.message}`);
  ok(res, { deleted: true, path: body.path });
}));

export default router;
