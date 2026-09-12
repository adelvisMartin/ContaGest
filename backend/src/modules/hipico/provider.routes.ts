import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hipicoError } from './hipico-domain.js';
import { createDefaultRacingProviderRegistry } from './provider-registry.js';
import { ProviderCapabilityUnsupportedError, RacingDataConflictError, type RacingDataProvider, type RacingProviderCapability } from './racing-provider.js';
import { ProviderEvidenceStore, fetchAndRecordProviderData } from './provider-evidence.store.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router=Router();
const registry=createDefaultRacingProviderRegistry();
const evidenceStore=new ProviderEvidenceStore();
const uuid=z.string().uuid();
const providerIdSchema=z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/);
const groupSchema=z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const externalIdSchema=z.string().trim().min(1).max(220).regex(/^[A-Za-z0-9:@._-]+$/);
const limitSchema=z.coerce.number().int().min(1).max(200).default(50);

function requestId(req:Request){return String((req as any).requestId||'').trim()||null;}
function ownerId(){const value=String(process.env.HIPICO_OWNER_ID||'').trim();if(!uuid.safeParse(value).success)throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});return value;}
function groupKey(req:Request){const parsed=groupSchema.safeParse(req.header('x-hipico-group-key')||req.query.groupKey);if(!parsed.success)throw Object.assign(new Error('HIPICO_GROUP_INVALID'),{code:'HIPICO_GROUP_INVALID'});return parsed.data;}
function provider(req:Request):RacingDataProvider{
  const id=providerIdSchema.parse(req.params.providerId);
  const value=registry.get(id);
  if(!value)throw Object.assign(new Error('RACING_PROVIDER_NOT_FOUND'),{code:'RACING_PROVIDER_NOT_FOUND'});
  return value;
}
function externalId(req:Request){return externalIdSchema.parse(req.params.externalId);}
function errorStatus(code:string){
  if(code==='RACING_PROVIDER_NOT_FOUND')return 404;
  if(code==='PROVIDER_CAPABILITY_UNSUPPORTED')return 501;
  if(code==='DATA_CONFLICT')return 409;
  if(code==='INVALID_STAGE_ID'||code.includes('INVALID'))return 400;
  if(code==='HIPICO_OWNER_NOT_CONFIGURED'||code==='NOT_CONFIGURED')return 503;
  if(code==='UPSTREAM_TIMEOUT')return 504;
  if(code.startsWith('UPSTREAM_'))return 502;
  if(code.startsWith('HIPICO_PROVIDER_'))return 409;
  return 500;
}
function sendError(req:Request,res:Response,error:any){
  const code=String(error?.code||error?.message||'RACING_PROVIDER_ERROR').slice(0,120);
  return res.status(errorStatus(code)).json(hipicoError({
    code,
    message:error instanceof ProviderCapabilityUnsupportedError
      ?`El proveedor ${error.providerId} no soporta ${error.capability}.`
      :error instanceof RacingDataConflictError
        ?'Las fuentes hípicas no coinciden y requieren revisión.'
        :'No se pudo consultar la fuente hípica.',
    requestId:requestId(req),
    retryable:Boolean(error?.retryable)||code==='UPSTREAM_TIMEOUT'||code==='HIPICO_OWNER_NOT_CONFIGURED'
  }));
}

async function live<T>(req:Request,providerValue:RacingDataProvider,capability:RacingProviderCapability,external:string,load:()=>Promise<any>){
  return fetchAndRecordProviderData<T>({
    store:evidenceStore,provider:providerValue,ownerId:ownerId(),groupKey:groupKey(req),capability,externalId:external,load
  });
}

router.use((req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined))return res.status(401).json(hipicoError({code:'HIPICO_OPERATOR_UNAUTHORIZED',message:'Operador no autenticado.',requestId:requestId(req)}));
  next();
});

router.get('/providers',async(req,res)=>{
  try{return res.json({ok:true,data:await registry.status()});}
  catch(error){return sendError(req,res,error);}
});

router.get('/providers/:providerId',async(req,res)=>{
  try{const value=provider(req);return res.json({ok:true,data:await value.health()});}
  catch(error){return sendError(req,res,error);}
});

router.get('/providers/:providerId/capabilities',(req,res)=>{
  try{const value=provider(req);return res.json({ok:true,data:{id:value.id,capabilities:value.capabilities(),financialAuthority:false}});}
  catch(error){return sendError(req,res,error);}
});

router.get('/providers/:providerId/health',async(req,res)=>{
  try{const value=provider(req);const health=await value.health();return res.json({ok:true,data:health});}
  catch(error){return sendError(req,res,error);}
});

router.get('/provider-evidence',async(req,res)=>{
  try{return res.json({ok:true,data:await evidenceStore.recent(ownerId(),groupKey(req),limitSchema.parse(req.query.limit??50))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/meetings',async(req,res)=>{
  try{const value=provider(req);return res.json({ok:true,...await live(req,value,'listMeetings','',()=>value.listMeetings())});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/meetings/:externalId',async(req,res)=>{
  try{const value=provider(req),id=externalId(req);return res.json({ok:true,...await live(req,value,'getMeeting',id,()=>value.getMeeting(id))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId',async(req,res)=>{
  try{const value=provider(req),id=externalId(req);return res.json({ok:true,...await live(req,value,'getRace',id,()=>value.getRace(id))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId/entries',async(req,res)=>{
  try{const value=provider(req),id=externalId(req);return res.json({ok:true,...await live(req,value,'getEntries',id,()=>value.getEntries(id))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId/scratches',async(req,res)=>{
  try{const value=provider(req),id=externalId(req);return res.json({ok:true,...await live(req,value,'getScratches',id,()=>value.getScratches(id))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId/result',async(req,res)=>{
  try{const value=provider(req),id=externalId(req);return res.json({ok:true,...await live(req,value,'getResult',id,()=>value.getResult(id))});}
  catch(error){return sendError(req,res,error);}
});

router.use((error:any,req:Request,res:Response,_next:any)=>sendError(req,res,error));

export default router;
