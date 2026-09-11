import { env, extractMetaMessages, isE164, isMetaPhoneNumberId, readRawBody, safeEqual, serverSecret, sha256, supabase, verifyMetaSignature, classifyText } from './_shared.js';

export const config = { api: { bodyParser: false } };

function normalizedTimestamp(value) {
  const parsed=Date.parse(String(value||''));
  return Number.isFinite(parsed)?new Date(parsed).toISOString():null;
}

function validMetaMessageIdentity(message, source = process.env){
  const externalMessageId=String(message?.externalMessageId||'').trim();
  const channelKey=String(message?.channelKey||'').trim();
  const senderId=String(message?.senderId||'').trim();
  const expectedChannelKey=String(source?.HIPICO_META_PHONE_NUMBER_ID||'').trim();
  const sourceTimestamp=message?.raw?.timestamp;
  return Boolean(
    isMetaPhoneNumberId(expectedChannelKey) &&
    externalMessageId && externalMessageId.length<=320 &&
    channelKey && channelKey!=='meta' && channelKey.length<=220 &&
    channelKey===expectedChannelKey &&
    isE164(senderId) &&
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

function acknowledgeRejected(res,error,extra={}){
  return res.status(200).json({
    ok:false,
    acknowledged:true,
    accepted:false,
    retryable:false,
    error,
    ...extra
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store, max-age=0');
  if (req.method === 'GET') {
    let verifyToken;
    try{verifyToken=serverSecret('HIPICO_META_VERIFY_TOKEN');}
    catch{return res.status(503).json({ok:false,error:'webhook_not_configured'});}
    const mode = req.query?.['hub.mode'];
    const token = req.query?.['hub.verify_token'];
    const challenge = req.query?.['hub.challenge'];
    if (mode === 'subscribe' && token && safeEqual(token, verifyToken)) return res.status(200).send(String(challenge || ''));
    return res.status(403).json({ ok: false, error: 'verification_failed' });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let raw;
  try{raw=await readRawBody(req);}
  catch(error){
    if(error?.message==='request_body_too_large')return res.status(413).json({ok:false,retryable:false,error:'request_body_too_large'});
    return res.status(400).json({ok:false,retryable:false,error:'request_body_invalid'});
  }

  let appSecret;
  try{appSecret=serverSecret('HIPICO_META_APP_SECRET');}
  catch{return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});}
  if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], appSecret)) {
    return res.status(401).json({ ok: false, retryable:false, error: 'invalid_signature' });
  }

  let payload;
  try{payload=JSON.parse(raw.toString('utf8'));}
  catch{return res.status(400).json({ok:false,retryable:false,error:'invalid_json'});}

  let ownerId;
  let phoneNumberId;
  try{
    ownerId=env('HIPICO_OWNER_ID');
    phoneNumberId=env('HIPICO_META_PHONE_NUMBER_ID');
    if(!isMetaPhoneNumberId(phoneNumberId))throw new Error('invalid_meta_phone_number_id');
  }catch{
    return res.status(503).json({ok:false,retryable:true,error:'webhook_not_configured'});
  }

  try {
    const messages = extractMetaMessages(payload);
    const inboundIdentity={HIPICO_META_PHONE_NUMBER_ID:phoneNumberId};
    if(messages.some((message)=>!validMetaMessageIdentity(message,inboundIdentity))){
      // The request is signed and durably received, but its identity is
      // permanently invalid for this endpoint. Acknowledge transport receipt so
      // Meta does not redeliver the same rejected event indefinitely.
      return acknowledgeRejected(res,'invalid_message_identity',{rejected:messages.length});
    }
    let accepted = 0;
    let duplicates = 0;
    for (const message of messages) {
      const [classification, confidence] = classifyText(message.text);
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
        classification,
        confidence,
        processing_status: classification === 'other' ? 'ignored' : classification === 'reply_review' ? 'review' : 'pending',
        normalized: { source: 'meta_cloud_api' },
        metadata: { raw_type: message.type, source_replay_signature: messageReplaySignature(message) }
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
    return res.status(200).json({ ok: true, accepted, duplicates });
  } catch (error) {
    if(error?.code==='HIPICO_META_REPLAY_MISMATCH'){
      return acknowledgeRejected(res,'replay_mismatch',{rejected:1});
    }
    console.error('hipico whatsapp webhook',{message:error?.message||String(error)});
    return res.status(500).json({ ok: false, retryable:true, error: 'webhook_processing_failed' });
  }
}

export const __test__={normalizedTimestamp,validMetaMessageIdentity,messageReplaySignature,persistedReplaySignature,acknowledgeRejected};
