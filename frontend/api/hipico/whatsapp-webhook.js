import { adapterCaptureDecision, extractMetaMessages, isE164, readRawBody, safeEqual, sha256, supabase, verifyMetaSignature } from './_shared.js';
import { isMetaPhoneNumberId, metaWebhookConfig } from './meta-runtime.js';

export const config = { api: { bodyParser: false } };

function normalizedTimestamp(value) {
  const parsed=Date.parse(String(value||''));
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}

function rawMetaEnvelopeIdentityError(payload,expectedPhoneNumberId){
  const expected=String(expectedPhoneNumberId||'').trim();
  if(!isMetaPhoneNumberId(expected))return 'META_PHONE_NUMBER_NOT_CONFIGURED';
  for(const entry of payload?.entry||[])for(const change of entry?.changes||[]){
    const value=change?.value||{};
    const hasMessages=Array.isArray(value.messages)&&value.messages.length>0;
    const hasStatuses=Array.isArray(value.statuses)&&value.statuses.length>0;
    if(!hasMessages&&!hasStatuses)continue;
    if(String(value?.metadata?.phone_number_id||'').trim()!==expected)return 'META_PHONE_NUMBER_MISMATCH';
  }
  return null;
}

function validMetaMessageIdentity(message){
  const externalMessageId=String(message?.externalMessageId||'').trim();
  const channelKey=String(message?.channelKey||'').trim();
  const senderId=String(message?.senderId||'').trim();
  const senderLabel=String(message?.senderLabel||'');
  const messageType=String(message?.type||'');
  const text=String(message?.text||'');
  const quoted=message?.quotedExternalMessageId==null?null:String(message.quotedExternalMessageId);
  const sourceTimestamp=message?.raw?.timestamp;
  return Boolean(
    externalMessageId && externalMessageId.length<=320 &&
    isMetaPhoneNumberId(channelKey) &&
    isE164(senderId) &&
    senderLabel.length<=220 &&
    messageType && messageType.length<=80 &&
    text.length<=4000 &&
    (quoted===null||quoted.length<=320) &&
    sourceTimestamp!==undefined && sourceTimestamp!==null && String(sourceTimestamp).trim() &&
    normalizedTimestamp(message?.timestamp)
  );
}

function messageReplaySignature(message){
  return sha256(JSON.stringify([
    String(message?.senderId||'').trim(),
    normalizedTimestamp(message?.timestamp),
    String(message?.type||'unknown'),
    String(message?.text||''),
    message?.quotedExternalMessageId==null?null:String(message.quotedExternalMessageId)
  ]));
}

function persistedReplaySignature(row){
  return sha256(JSON.stringify([
    String(row?.sender_id||'').trim(),
    normalizedTimestamp(row?.sent_at),
    String(row?.message_type||'unknown'),
    String(row?.raw_text||''),
    row?.quoted_external_message_id==null?null:String(row.quoted_external_message_id)
  ]));
}

async function assertDuplicateMetaReplay(ownerId,message){
  if(!message.externalMessageId)return;
  const rows=await supabase(
    `hipico_messages?select=id,sender_id,sent_at,message_type,raw_text,quoted_external_message_id&owner_id=eq.${encodeURIComponent(ownerId)}&channel_key=eq.${encodeURIComponent(message.channelKey)}&external_message_id=eq.${encodeURIComponent(message.externalMessageId)}&limit=1`,
    {headers:{Prefer:'return=representation'}}
  );
  const existing=Array.isArray(rows)?rows[0]||null:null;
  if(!existing?.id)throw Object.assign(new Error('HIPICO_META_DEDUPE_ROW_MISSING'),{code:'HIPICO_META_DEDUPE_ROW_MISSING'});
  if(persistedReplaySignature(existing)!==messageReplaySignature(message)){
    throw Object.assign(new Error('HIPICO_META_REPLAY_MISMATCH'),{code:'HIPICO_META_REPLAY_MISMATCH'});
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  const runtime=metaWebhookConfig();

  if (req.method === 'GET') {
    if(!runtime.ready)return res.status(503).json({ok:false,error:'webhook_not_configured'});
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && safeEqual(token, runtime.verifyToken)) return res.status(200).send(String(challenge || ''));
    return res.status(403).json({ ok: false, error: 'verification_failed' });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if(!runtime.ready)return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});

  let raw;
  try{raw=await readRawBody(req);}
  catch(error){
    if(error?.message==='request_body_too_large')return res.status(413).json({ok:false,retryable:false,error:'request_body_too_large'});
    return res.status(400).json({ok:false,retryable:false,error:'request_body_invalid'});
  }

  if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], runtime.appSecret)) {
    return res.status(401).json({ ok: false, retryable:false, error: 'invalid_signature' });
  }

  let payload;
  try{payload=JSON.parse(raw.toString('utf8'));}
  catch{return res.status(400).json({ok:false,retryable:false,error:'invalid_json'});}

  const envelopeIdentityError=rawMetaEnvelopeIdentityError(payload,runtime.phoneNumberId);
  if(envelopeIdentityError){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch'});
  }

  const messages = extractMetaMessages(payload);
  const validMessages=messages.filter((message)=>validMetaMessageIdentity(message));
  const invalidMessages=messages.length-validMessages.length;
  if(validMessages.some((message)=>String(message.channelKey)!==runtime.phoneNumberId)){
    return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'webhook_phone_number_mismatch',received:messages.length,validMessages:validMessages.length,invalidMessages});
  }
  if(validMessages.length===0){
    if(invalidMessages>0){
      return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'invalid_message_identity',received:messages.length,invalidMessages});
    }
    return res.status(200).json({ok:true,accepted:0,duplicates:0,invalidMessages:0});
  }

  try {
    const ownerId = String(process.env.HIPICO_OWNER_ID || '').trim();
    if (!ownerId) return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
    let accepted = 0;
    let duplicates = 0;
    for (const message of validMessages) {
      const capture=adapterCaptureDecision(message.text);
      const fingerprint = sha256(message.externalMessageId || `${message.channelKey}|${messageReplaySignature(message)}`);
      const body = [{
        owner_id: ownerId,
        channel_key: message.channelKey,
        external_message_id: message.externalMessageId || null,
        fingerprint,
        sender_id: message.senderId || null,
        sender_label: message.senderLabel || null,
        quoted_external_message_id: message.quotedExternalMessageId,
        sent_at: message.timestamp,
        message_type: message.type,
        raw_text: message.text,
        classification: capture.storedClassification,
        confidence: capture.storedConfidence,
        processing_status: capture.processingStatus,
        normalized: {
          source: 'meta_cloud_api',
          domain_authority: capture.domainAuthority,
          adapter_hint_authoritative: false
        },
        metadata: {
          raw_type: message.type,
          source_replay_signature: messageReplaySignature(message),
          adapter_hint: capture.adapterHint
        }
      }];
      const rows=await supabase('hipico_messages?on_conflict=owner_id,channel_key,fingerprint', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(body)
      });
      const duplicate=!Array.isArray(rows)||rows.length===0;
      if(duplicate){
        if(message.externalMessageId)await assertDuplicateMetaReplay(ownerId,message);
        duplicates+=1;
      }else accepted += 1;
    }
    if(invalidMessages>0){
      return res.status(200).json({
        ok:false,
        acknowledged:true,
        accepted:true,
        partial:true,
        retryable:false,
        error:'invalid_message_identity_partial',
        received:messages.length,
        acceptedMessages:accepted,
        duplicates,
        invalidMessages,
        domainAuthority:'backend_canonical_only'
      });
    }
    return res.status(200).json({ ok: true, accepted, duplicates, invalidMessages:0, domainAuthority:'backend_canonical_only' });
  } catch (error) {
    if(error?.code==='HIPICO_META_REPLAY_MISMATCH'){
      return res.status(200).json({ok:false,acknowledged:true,accepted:false,retryable:false,error:'replay_mismatch',invalidMessages});
    }
    console.error('hipico whatsapp webhook',{message:error?.message||String(error)});
    return res.status(503).json({ ok: false, retryable:true, error: 'webhook_processing_failed', invalidMessages });
  }
}

export const __test__={normalizedTimestamp,rawMetaEnvelopeIdentityError,validMetaMessageIdentity,messageReplaySignature,persistedReplaySignature,metaWebhookConfig,adapterCaptureDecision};
