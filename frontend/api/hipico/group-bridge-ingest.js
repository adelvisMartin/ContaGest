import { env, safeEqual, serverSecret, sha256, supabase, classifyText } from './_shared.js';

const CHANNEL_KEY_PATTERN=/^[A-Za-z0-9_-]{3,120}$/;
const DEFAULT_SOURCE_CHANNEL_KEY='club-hipico-triple-crown-official';
const DEFAULT_LAB_CHANNEL_KEY='control-hipico-lab';

function shadowSuggestion(classification, body) {
  const sender = String(body?.senderLabel || 'remitente').trim() || 'remitente';
  const suggestions = {
    offer: `Oferta detectada de ${sender}. Verificar participante, carrera, jugada, caballo y monto antes de emparejar o confirmar.`,
    reply_review: `Respuesta corta/citada detectada de ${sender}. Correlacionar con el mensaje origen y validar quién toma el monto.`,
    race_close: 'Cierre de recepción detectado. Confirmar hipódromo y carrera activa antes de bloquear nuevas jugadas.',
    day_close: 'Cierre de jornada detectado. Revisar carreras pendientes, snapshots y disponibles antes de publicar el cierre final.',
    result: 'Llegada/pizarra detectada. Confirmar carrera e hipódromo antes de aplicarla al motor de liquidación.',
    plan_snapshot: 'Plano detectado. Comparar huella, parejas y montos contra la carrera activa antes de aceptarlo.',
    settlement_snapshot: 'Liquidación detectada. Ejecutar auditor de liquidación; no modificar saldos automáticamente.',
    balance_snapshot: 'Snapshot de disponibles detectado. Conciliar contra el ledger sin sobrescribir el historial.'
  };
  return suggestions[classification] || '';
}

function validOptionalBoolean(body, key) {
  return body[key] === undefined || typeof body[key] === 'boolean';
}

function normalizedTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function normalizedChannelRole(body) {
  return String(body?.channelRole || 'source');
}

function configuredChannelIdentity(role, source = process.env) {
  const sourceRole=role==='lab'?'lab':'source';
  const groupId=String((sourceRole==='source'?source.HIPICO_SOURCE_GROUP_ID:source.HIPICO_LAB_GROUP_ID)||'').trim();
  const configuredKey=String((sourceRole==='source'?source.HIPICO_SOURCE_CHANNEL_KEY:source.HIPICO_LAB_CHANNEL_KEY)||'').trim();
  const fallback=sourceRole==='source'?DEFAULT_SOURCE_CHANNEL_KEY:DEFAULT_LAB_CHANNEL_KEY;
  const channelKey=configuredKey||fallback;
  return { role:sourceRole, groupId, channelKey };
}

export function validateGroupBridgeBody(body, source = process.env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_body';
  const groupId = String(body.groupId || '').trim();
  const externalMessageId = String(body.externalMessageId || '').trim();
  const role = normalizedChannelRole(body);
  if (!groupId || groupId.length > 220 || !externalMessageId || externalMessageId.length > 320) return 'invalid_identifiers';
  if (!['source', 'lab'].includes(role)) return 'invalid_channel_role';
  if (body.groupName !== undefined && (typeof body.groupName !== 'string' || body.groupName.length > 220)) return 'invalid_group_name';
  if (body.channelKey !== undefined && (typeof body.channelKey !== 'string' || !CHANNEL_KEY_PATTERN.test(body.channelKey.trim()))) return 'invalid_channel_key';
  if (body.bridgeVersion !== undefined && (typeof body.bridgeVersion !== 'string' || body.bridgeVersion.length > 80)) return 'invalid_bridge_version';
  if (body.type !== undefined && (typeof body.type !== 'string' || body.type.length > 80)) return 'invalid_message_type';
  if (body.text !== undefined && typeof body.text !== 'string') return 'invalid_text';
  if (String(body.text || '').length > 4000) return 'text_too_large';
  if (typeof body.senderId !== 'string' || !body.senderId.trim() || body.senderId.length > 220) return 'invalid_sender';
  if (body.senderLabel !== undefined && (typeof body.senderLabel !== 'string' || body.senderLabel.length > 220)) return 'invalid_sender_label';
  if (!validOptionalBoolean(body, 'shadowMode') || !validOptionalBoolean(body, 'fromMe') || !validOptionalBoolean(body, 'hasMedia')) return 'invalid_boolean_field';
  if (body.quotedExternalMessageId !== undefined && body.quotedExternalMessageId !== null && (typeof body.quotedExternalMessageId !== 'string' || body.quotedExternalMessageId.length > 320)) return 'invalid_quoted_message_id';
  if (!normalizedTimestamp(body.timestamp)) return 'invalid_timestamp';
  if (body.shadowMode !== true) return role === 'source' ? 'source_requires_shadow_mode' : 'lab_requires_shadow_mode';

  const identity=configuredChannelIdentity(role,source);
  if (!identity.groupId) return role === 'source' ? 'source_group_not_configured' : 'lab_group_not_configured';
  if (!CHANNEL_KEY_PATTERN.test(identity.channelKey)) return role === 'source' ? 'source_channel_not_configured' : 'lab_channel_not_configured';
  if (groupId !== identity.groupId) return role === 'source' ? 'source_group_not_authorized' : 'lab_group_not_authorized';
  if (body.channelKey !== undefined && String(body.channelKey).trim() !== identity.channelKey) {
    return role === 'source' ? 'source_channel_not_authorized' : 'lab_channel_not_authorized';
  }
  return null;
}

function sourceReplaySignature(body) {
  return sha256(JSON.stringify([
    String(body.senderId || '').trim(),
    normalizedTimestamp(body.timestamp),
    String(body.type || 'text'),
    String(body.text || ''),
    body.quotedExternalMessageId == null ? null : String(body.quotedExternalMessageId)
  ]));
}

function persistedReplaySignature(row) {
  const sentAt = normalizedTimestamp(row?.sent_at);
  return sha256(JSON.stringify([
    String(row?.sender_id || '').trim(),
    sentAt,
    String(row?.message_type || 'text'),
    String(row?.raw_text || ''),
    row?.quoted_external_message_id == null ? null : String(row.quoted_external_message_id)
  ]));
}

async function assertDuplicateReplay(ownerId, channelKey, externalMessageId, body) {
  const rows = await supabase(
    `hipico_messages?select=id,sender_id,sent_at,message_type,raw_text,quoted_external_message_id&owner_id=eq.${encodeURIComponent(ownerId)}&channel_key=eq.${encodeURIComponent(channelKey)}&external_message_id=eq.${encodeURIComponent(externalMessageId)}&limit=1`,
    { headers: { Prefer: 'return=representation' } }
  );
  const existing = Array.isArray(rows) ? rows[0] : null;
  if (!existing?.id) throw new Error('HIPICO_SERVERLESS_DEDUPE_ROW_MISSING');
  if (persistedReplaySignature(existing) !== sourceReplaySignature(body)) {
    throw Object.assign(new Error('HIPICO_SERVERLESS_REPLAY_MISMATCH'), { code: 'HIPICO_SERVERLESS_REPLAY_MISMATCH' });
  }
}

function assertPersistedChannel(channel,identity,groupId){
  if(!channel?.id)throw Object.assign(new Error('HIPICO_SERVERLESS_CHANNEL_NOT_FOUND'),{code:'HIPICO_SERVERLESS_CHANNEL_NOT_FOUND'});
  if(String(channel.status||'')!=='active')throw Object.assign(new Error('HIPICO_SERVERLESS_CHANNEL_DISABLED'),{code:'HIPICO_SERVERLESS_CHANNEL_DISABLED'});
  if(String(channel.channel_type||'')!=='web_bridge')throw Object.assign(new Error('HIPICO_SERVERLESS_CHANNEL_TYPE_MISMATCH'),{code:'HIPICO_SERVERLESS_CHANNEL_TYPE_MISMATCH'});
  const config=channel.config&&typeof channel.config==='object'?channel.config:{};
  if(config.channel_role&&String(config.channel_role)!==identity.role)throw Object.assign(new Error('HIPICO_SERVERLESS_CHANNEL_ROLE_MISMATCH'),{code:'HIPICO_SERVERLESS_CHANNEL_ROLE_MISMATCH'});
  if(config.group_id_hash&&String(config.group_id_hash)!==sha256(groupId))throw Object.assign(new Error('HIPICO_SERVERLESS_CHANNEL_GROUP_MISMATCH'),{code:'HIPICO_SERVERLESS_CHANNEL_GROUP_MISMATCH'});
  return channel;
}

async function readChannel(ownerId,groupKey){
  const rows=await supabase(`hipico_bot_channels?select=id,owner_id,group_key,label,channel_type,status,config&owner_id=eq.${encodeURIComponent(ownerId)}&group_key=eq.${encodeURIComponent(groupKey)}&limit=2`,{
    headers:{Prefer:'return=representation'}
  });
  if(Array.isArray(rows)&&rows.length>1)throw Object.assign(new Error('HIPICO_SERVERLESS_CHANNEL_AMBIGUOUS'),{code:'HIPICO_SERVERLESS_CHANNEL_AMBIGUOUS'});
  return Array.isArray(rows)?rows[0]||null:null;
}

async function ensureChannel(ownerId, body) {
  const groupId = String(body.groupId).trim();
  const groupName = String(body.groupName || 'Grupo WhatsApp').trim().slice(0, 220);
  const role = normalizedChannelRole(body);
  const identity=configuredChannelIdentity(role);
  const existing=await readChannel(ownerId,identity.channelKey);
  if(existing)return assertPersistedChannel(existing,identity,groupId);

  const payload = [{
    owner_id: ownerId,
    group_key: identity.channelKey,
    label: groupName,
    channel_type: 'web_bridge',
    status: 'active',
    config: {
      source: 'whatsapp_web_linked_device',
      group_id_hash: sha256(groupId),
      auto_send: false,
      bridge_version: String(body.bridgeVersion || '').slice(0, 80),
      channel_role: role,
      shadow_mode: true
    }
  }];
  await supabase('hipico_bot_channels?on_conflict=owner_id,group_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(payload)
  });
  const persisted=await readChannel(ownerId,identity.channelKey);
  return assertPersistedChannel(persisted,identity,groupId);
}

async function recordShadowPrediction({ ownerId, channel, body, messageRow, classification, confidence, suggestion }) {
  if (!body.shadowMode || normalizedChannelRole(body) !== 'source' || !messageRow?.id) return;
  await supabase('hipico_shadow_evaluations?on_conflict=owner_id,source_group_key,source_external_message_id,prediction_type', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{
      owner_id: ownerId,
      source_group_key: channel.group_key,
      source_message_id: messageRow.id,
      source_external_message_id: String(body.externalMessageId || ''),
      scenario_key: String(body.quotedExternalMessageId || body.externalMessageId || ''),
      prediction_type: classification,
      predicted_payload: {
        classification,
        confidence,
        raw_text: String(body.text || ''),
        sender_id_hash: sha256(String(body.senderId || '')),
        quoted_external_message_id: body.quotedExternalMessageId || null,
        automation_state: 'shadow_only',
        proposed_reply: suggestion || null,
        monetary_auto_apply: false
      },
      match_status: classification === 'other' ? 'not_applicable' : 'pending'
    }])
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, retryable: false, error: 'method_not_allowed' });

  let configuredToken;
  try {
    configuredToken = serverSecret('HIPICO_GROUP_BRIDGE_TOKEN');
  } catch {
    return res.status(503).json({ ok: false, retryable: true, error: 'bridge_not_configured' });
  }
  if (!safeEqual(req.headers['x-hipico-bridge-token'], configuredToken)) return res.status(401).json({ ok: false, retryable: false, error: 'unauthorized' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, retryable: false, error: 'invalid_json' });
  }
  const bodyError = validateGroupBridgeBody(body);
  if (bodyError) return res.status(400).json({ ok: false, retryable: false, error: bodyError });

  const groupId = String(body.groupId).trim();
  const externalMessageId = String(body.externalMessageId).trim();
  const text = String(body.text || '');
  const sentAt = normalizedTimestamp(body.timestamp);
  const channelRole = normalizedChannelRole(body);

  try {
    const ownerId = env('HIPICO_OWNER_ID');
    const channel = await ensureChannel(ownerId, body);

    const [classification, confidence] = classifyText(text);
    const suggestion = shadowSuggestion(classification, body);
    const fingerprint = sha256(`${groupId}|${externalMessageId}`);
    const processingStatus = classification === 'other' ? 'ignored' : classification === 'reply_review' ? 'review' : 'processed';

    const rows = await supabase('hipico_messages?on_conflict=owner_id,channel_key,fingerprint', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify([{
        owner_id: ownerId,
        channel_id: channel.id,
        channel_key: channel.group_key,
        external_message_id: externalMessageId,
        fingerprint,
        sender_id: String(body.senderId).trim(),
        sender_label: String(body.senderLabel || ''),
        sender_role: body.fromMe === true ? 'operator' : 'unknown',
        quoted_external_message_id: body.quotedExternalMessageId || null,
        sent_at: sentAt,
        message_type: String(body.type || 'text'),
        raw_text: text,
        classification,
        confidence,
        processing_status: processingStatus,
        normalized: {
          source: 'web_bridge',
          group_name: String(body.groupName || ''),
          channel_role: channelRole,
          shadow_mode: true,
          from_me: body.fromMe === true,
          has_media: body.hasMedia === true
        },
        metadata: {
          bridge_version: String(body.bridgeVersion || ''),
          received_by: 'group-bridge-ingest',
          source_replay_signature: sourceReplaySignature(body),
          proposed_reply: suggestion || null
        }
      }])
    });

    const duplicate = !Array.isArray(rows) || rows.length === 0;
    if (duplicate) await assertDuplicateReplay(ownerId, channel.group_key, externalMessageId, body);
    else await recordShadowPrediction({ ownerId, channel, body, messageRow: rows[0], classification, confidence, suggestion });

    const diagnostic = /^\/hipico_status\s*$/i.test(text.trim())
      ? `Hípico Control conectado ✅\nCanal: ${String(body.groupName || 'WhatsApp')}\nRecepción: activa\nModo: sombra`
      : null;

    return res.status(duplicate ? 200 : 202).json({
      ok: true,
      accepted: true,
      duplicate,
      classification,
      confidence,
      channelKey: channel.group_key,
      automationMode: 'shadow',
      actions: [],
      labSimulation: !duplicate && channelRole === 'source' ? {
        text: diagnostic || (suggestion ? `🧭 ${suggestion}` : null),
        sourceExternalMessageId: externalMessageId,
        monetaryAutoApply: false
      } : null
    });
  } catch (error) {
    if (error?.code === 'HIPICO_SERVERLESS_REPLAY_MISMATCH' || error?.message === 'HIPICO_SERVERLESS_REPLAY_MISMATCH') {
      return res.status(409).json({ ok: false, retryable: false, error: 'replay_mismatch' });
    }
    if (String(error?.code || '').startsWith('HIPICO_SERVERLESS_CHANNEL_')) {
      return res.status(409).json({ ok: false, retryable: false, error: 'channel_not_authorized' });
    }
    console.error('hipico group bridge ingest failed', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'ingest_unavailable' });
  }
}

export const __test__ = { normalizedTimestamp, normalizedChannelRole, sourceReplaySignature, persistedReplaySignature, configuredChannelIdentity, assertPersistedChannel };
