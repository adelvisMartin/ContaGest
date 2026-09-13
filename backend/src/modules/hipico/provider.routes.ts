import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hipicoError } from './hipico-domain.js';
import { createDefaultRacingProviderRegistry } from './provider-registry.js';
import { ProviderCapabilityUnsupportedError, RacingDataConflictError, type RacingDataProvider } from './racing-provider.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router=Router();
const registry=createDefaultRacingProviderRegistry();
const providerIdSchema=z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}$/);
const externalIdSchema=z.string().regex(/^\d{1,18}$/);

function requestId(req:Request){return String((req as any).requestId||'').trim()||null;}
function provider(req:Request):RacingDataProvider{
  const id=providerIdSchema.parse(req.params.providerId);
  const value=registry.get(id);
  if(!value)throw Object.assign(new Error('RACING_PROVIDER_NOT_FOUND'),{code:'RACING_PROVIDER_NOT_FOUND'});
  return value;
}
function errorStatus(code:string){
  if(code==='RACING_PROVIDER_NOT_FOUND')return 404;
  if(code==='PROVIDER_CAPABILITY_UNSUPPORTED')return 501;
  if(code==='DATA_CONFLICT')return 409;
  if(code==='INVALID_STAGE_ID')return 400;
  if(code==='NOT_CONFIGURED')return 503;
  if(code==='UPSTREAM_TIMEOUT')return 504;
  if(code.startsWith('UPSTREAM_'))return 502;
  return 400;
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
    retryable:Boolean(error?.retryable)||code==='UPSTREAM_TIMEOUT'
  }));
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
  try{const value=provider(req);const health=await value.health();return res.status(health.state==='ready'?200:503).json({ok:health.state==='ready',data:health});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/meetings',async(req,res)=>{
  try{return res.json({ok:true,...await provider(req).listMeetings()});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId',async(req,res)=>{
  try{return res.json({ok:true,...await provider(req).getRace(externalIdSchema.parse(req.params.externalId))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId/entries',async(req,res)=>{
  try{return res.json({ok:true,...await provider(req).getEntries(externalIdSchema.parse(req.params.externalId))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId/scratches',async(req,res)=>{
  try{return res.json({ok:true,...await provider(req).getScratches(externalIdSchema.parse(req.params.externalId))});}
  catch(error){return sendError(req,res,error);}
});

router.get('/live/:providerId/races/:externalId/result',async(req,res)=>{
  try{return res.json({ok:true,...await provider(req).getResult(externalIdSchema.parse(req.params.externalId))});}
  catch(error){return sendError(req,res,error);}
});

router.use((error:any,req:Request,res:Response,_next:any)=>sendError(req,res,error));

export default router;
