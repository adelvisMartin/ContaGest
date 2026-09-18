import { readRawBody, safeEqual, verifyMetaSignature } from './_shared.js';
import { metaWebhookConfig } from './meta-runtime.js';
import { proxyCanonicalRequest, relayCanonicalResponse } from './canonical-backend.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  const runtime=metaWebhookConfig();

  if (req.method === 'GET') {
    if(!runtime.ready)return res.status(503).json({ok:false,error:'webhook_not_configured'});
    const mode=req.query?.['hub.mode'];
    const token=req.query?.['hub.verify_token'];
    const challenge=req.query?.['hub.challenge'];
    if(mode==='subscribe'&&safeEqual(token,runtime.verifyToken))return res.status(200).send(String(challenge||''));
    return res.status(403).json({ok:false,error:'verification_failed'});
  }

  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
  if(!runtime.ready)return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});

  let raw;
  try{raw=await readRawBody(req);}
  catch(error){
    if(error?.message==='request_body_too_large')return res.status(413).json({ok:false,retryable:false,error:'request_body_too_large'});
    return res.status(400).json({ok:false,retryable:false,error:'request_body_invalid'});
  }

  const signature=String(req.headers['x-hub-signature-256']||'');
  if(!verifyMetaSignature(raw,signature,runtime.appSecret)){
    return res.status(401).json({ok:false,retryable:false,error:'invalid_signature'});
  }

  try{
    const upstream=await proxyCanonicalRequest({
      path:'/api/v1/hipico-bot/webhook',
      method:'POST',
      headers:{
        'content-type':String(req.headers['content-type']||'application/json'),
        'x-hub-signature-256':signature
      },
      body:raw
    });
    return relayCanonicalResponse(res,upstream);
  }catch(error){
    console.error('hipico whatsapp webhook canonical proxy',{
      code:error?.code||null,
      message:error?.message||String(error)
    });
    return res.status(503).json({ok:false,retryable:true,error:'canonical_backend_unavailable'});
  }
}
