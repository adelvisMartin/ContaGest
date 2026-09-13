import express, { Router, type Request, type Response } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { bridgeTokenValid } from './hipico-bridge-security.js';
import { bridgeIdentityConfig, normalizeBridgeSender, validateBridgeGroupIdentity } from './hipico-bridge-input-policy.js';
import { DocumentIngestionService } from '../hipico/document-engine.js';
import { createPdfJsDocumentExtractor } from '../hipico/document-extractor.js';
import { createPreferredDocumentExtractor } from '../hipico/document-anydoc-extractor.js';
import { PostgresDocumentStore } from '../hipico/document.store.js';

export const BRIDGE_DOCUMENT_MAX_BYTES=10*1024*1024;
const uuidSchema=z.string().uuid();
const CONTROL=/[\u0000-\u001F\u007F]/;
type RuntimeEnv=Record<string,string|undefined>|NodeJS.ProcessEnv;
type HeaderBag=Record<string,string|string[]|undefined>;

function coded(code:string){return Object.assign(new Error(code),{code});}
function value(headers:HeaderBag,name:string){const raw=headers[name]??headers[name.toLowerCase()];return String(Array.isArray(raw)?raw[0]||'':raw||'').trim();}
export function bridgeDocumentMimeAllowed(input:unknown){return String(input||'').split(';',1)[0].trim().toLowerCase()==='application/pdf';}

export function parseBridgeDocumentHeaders(headers:HeaderBag,env:RuntimeEnv=process.env){
  const ownerId=String(env.HIPICO_BRIDGE_OWNER_ID||'').trim();
  if(!uuidSchema.safeParse(ownerId).success)throw coded('HIPICO_BRIDGE_OWNER_NOT_CONFIGURED');
  const groupId=value(headers,'x-hipico-group-id');
  const channelKey=value(headers,'x-hipico-channel-key');
  const labChannelKey=value(headers,'x-hipico-lab-channel-key');
  const identityError=validateBridgeGroupIdentity({groupId,channelRole:'source',channelKey,labChannelKey},env);
  if(identityError)throw coded(identityError==='HIPICO_BRIDGE_GROUP_IDENTITY_NOT_CONFIGURED'?'HIPICO_BRIDGE_DOCUMENT_IDENTITY_NOT_CONFIGURED':'HIPICO_BRIDGE_DOCUMENT_IDENTITY_MISMATCH');
  const externalMessageId=value(headers,'x-hipico-external-message-id');
  if(!externalMessageId||externalMessageId.length>300||CONTROL.test(externalMessageId))throw coded('HIPICO_BRIDGE_DOCUMENT_MESSAGE_ID_INVALID');
  const rawSender=value(headers,'x-hipico-sender');const sender=normalizeBridgeSender(rawSender);
  if(!sender)throw coded('HIPICO_BRIDGE_DOCUMENT_SENDER_INVALID');
  const filename=value(headers,'x-hipico-filename');
  if(!filename||filename.length>180||CONTROL.test(filename)||path.basename(filename)!==filename||!filename.toLowerCase().endsWith('.pdf'))throw coded('HIPICO_BRIDGE_DOCUMENT_FILENAME_INVALID');
  const receivedAt=value(headers,'x-hipico-received-at');
  if(!receivedAt||receivedAt.length>80||!Number.isFinite(Date.parse(receivedAt)))throw coded('HIPICO_BRIDGE_DOCUMENT_RECEIVED_AT_INVALID');
  const config=bridgeIdentityConfig(env);
  return{ownerId,groupKey:config.sourceChannelKey,filename,provenance:{sourceChannel:config.sourceChannelKey,sourceMessageId:`waweb:${externalMessageId}`,sender,receivedAt,authority:'group_evidence' as const}};
}

const router=Router();
const store=new PostgresDocumentStore();
const extractor=createPreferredDocumentExtractor(createPdfJsDocumentExtractor());
const service=new DocumentIngestionService(store,extractor);

function requestId(req:Request){return String((req as any).requestId||'').trim()||null;}
function statusFor(code:string){
  if(code==='entity.too.large'||code==='PDF_TOO_LARGE')return 413;
  if(code==='HIPICO_BRIDGE_DOCUMENT_IDENTITY_MISMATCH')return 403;
  if(code==='HIPICO_BRIDGE_OWNER_NOT_CONFIGURED'||code==='HIPICO_BRIDGE_DOCUMENT_IDENTITY_NOT_CONFIGURED'||code==='HIPICO_DOCUMENT_EXTRACTOR_NOT_CONFIGURED')return 503;
  if(code==='HIPICO_DOCUMENT_EXTRACTION_TIMEOUT'||code==='HIPICO_DOCUMENT_TOOL_TIMEOUT')return 504;
  if(code.includes('REPLAY_MISMATCH')||code==='HIPICO_DOCUMENT_EXTRACTION_IN_PROGRESS')return 409;
  return 400;
}
function fail(req:Request,res:Response,error:any){const code=String(error?.code||error?.type||error?.message||'HIPICO_BRIDGE_DOCUMENT_ERROR').slice(0,120);return res.status(statusFor(code)).json({ok:false,error:code,requestId:requestId(req),retryable:[503,504].includes(statusFor(code))});}

router.post('/bridge/documents',(req,res,next)=>{
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(!bridgeTokenValid(req.header('x-hipico-bridge-token')||undefined))return res.status(401).json({ok:false,error:'HIPICO_BRIDGE_UNAUTHORIZED',requestId:requestId(req),retryable:false});
  if(!bridgeDocumentMimeAllowed(req.header('content-type')))return res.status(415).json({ok:false,error:'PDF_MIME_INVALID',requestId:requestId(req),retryable:false});
  next();
},express.raw({type:'application/pdf',limit:BRIDGE_DOCUMENT_MAX_BYTES}),async(req,res)=>{
  try{
    const metadata=parseBridgeDocumentHeaders(req.headers as HeaderBag);
    const pdf=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
    const result=await service.ingest({ownerId:metadata.ownerId,groupKey:metadata.groupKey,pdf,filename:metadata.filename,mimeType:'application/pdf',provenance:metadata.provenance});
    return res.status(result.duplicate?200:201).json({ok:true,duplicate:result.duplicate,data:{id:result.id,status:result.status,classification:result.classification,confidence:result.confidence,extractionStatus:result.extractionStatus,financialAuthority:false}});
  }catch(error){return fail(req,res,error);}
});
router.use((error:any,req:Request,res:Response,_next:any)=>fail(req,res,error));

export default router;
