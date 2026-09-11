import { env, safeEqual, sha256, supabase, classifyText } from './_shared.js';

function slug(value) {
  return String(value || 'grupo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'grupo';
}

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

export function validateGroupBridgeBody(body, source = process.env) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_body';
  const groupId = String(body.groupId || '').trim();
  const externalMessageId = String(body.externalMessageId || '').trim();
  const role = String(body.channelRole || 'source');
  if (!groupId || groupId.length > 220 || !externalMessageId || externalMessageId.length > 320) return 'invalid_identifiers';
  if (!['source', 'lab'].includes(role)) return 'invalid_channel_role';
  if (body.groupName !== undefined && (typeof body.groupName !== 'string' || body.groupName.length > 220)) return 'invalid_group_name';
  if (body.channelKey !== undefined && (typeof body.channelKey !== 'string' || !/^[A-Za-z0-9_-]{3,120}$/.test(body.channelKey.trim()))) return 'invalid_channel_key';
  if (body.bridgeVersion !== undefined && (typeof body.bridgeVersion !== 'string' || body.bridgeVersion.length > 80)) return 'invalid_bridge_version';
  if (body.type !== undefined && (typeof body.type !== 'string' || body.type.length > 80)) return 'invalid_message_type';
  if (body.text !== undefined && typeof body.text !== 'string') return 'invalid_text';
  if (String(body.text || '').length > 4000) return 'text_too_large';
  if (body.senderId !== undefined && typeof body.senderId !== 'string') return 'invalid_sender';
  if (body.senderLabel !== undefined && typeof body.senderLabel !== 'string') return 'invalid_sender';
  if (String(body.senderId || '').length > 220 || String(body.senderLabel || '').length > 220) return 'sender_too_large';
  if (!validOptionalBoolean(body, 'shadowMode') || !validOptionalBoolean(body, 'fromMe') || !validOptionalBoolean(body, 'hasMedia')) return 'invalid_boolean_field';
  if (body.quotedExternalMessageId !== undefined && body.quotedExternalMessageId !== null && (typeof body.quotedExternalMessageId !== 'string' || body.quotedExternalMessageId.length > 320)) return 'invalid_quoted_message_id';
  if (normalizedTimestamp(body.timestamp) === undefined) return 'invalid_timestamp';
  if (role === 'source' && body.shadowMode !== true) return 'source_requires_shadow_mode';
  const pinnedSource = String(source.HIPICO_SOURCE_GROUP_ID || '').trim();
  const pinnedLab = String(source.HIPICO_LAB_GROUP_ID || '').trim();
  if (role === 'source' && pinnedSource && groupId !== pinnedSource) return 'source_group_not_authorized';
  if (role === 'lab' && pinnedLab && groupId !== pinnedLab) return 'lab_group_not_authorized';
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

async function ensureChannel(ownerId, body) {
  const groupId = String(body.groupId).trim();
  const groupName = String(body.groupName || 'Grupo WhatsApp').trim().slice(0, 220);
  const role = String(body.channelRole || 'source');
  const explicitChannelKey = String(body.channelKey || '').trim();
  const groupKey = explicitChannelKey && /^[A-Za-z0-9_-]{3,120}$/.test(explicitChannelKey)
    ? explicitChannelKey
    : `web-${slug(groupName)}-${sha256(groupId).slice(0, 10)}`;
  const payload = [{
    owner_id: ownerId,
    group_key: groupKey,
    label: groupName,
    channel_type: 'web_bridge',
    status: 'active',
    config: {
      source: 'whatsapp_web_linked_device',
      group_id_hash: sha256(groupId),
      auto_send: false,
      bridge_version: String(body.bridgeVersion || '').slice(0, 80),
      channel_role: role,
      shadow_mode: body.shadowMode === true
    }
  }];
  const rows = await supabase('hipico_bot_channels?on_conflict=owner_id,group_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  });
  return rows?.[0] || null;
}

async function recordShadowPrediction({ ownerId, channel, body, messageRow, classification, confidence, suggestion }) {
  if (!body.shadowMode || body.channelRole !== 'source' || !messageRow?.id) return;
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
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let configuredToken;
  try {
    configuredToken = env('HIPICO_GROUP_BRIDGE_TOKEN');
  } catch {
    return res.status(503).json({ ok: false, retryable: true, error: 'bridge_not_configured' });
  }
  if (!safeEqual(req.headers['x-hipico-bridge-token'], configuredToken)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  const bodyError = validateGroupBridgeBody(body);
  if (bodyError) return res.status(400).json({ ok: false, error: bodyError });

  const groupId = String(body.groupId).trim();
  const externalMessageId = String(body.externalMessageId).trim();
  const text = String(body.text || '');
  const sentAt = normalizedTimestamp(body.timestamp);

  try {
    const ownerId = env('HIPICO_OWNER_ID');
    const channel = await ensureChannel(ownerId, body);
    if (!channel?.id) throw new Error('channel_resolution_failed');

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
        sender_id: String(body.senderId || ''),
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
          channel_role: String(body.channelRole || 'source'),
          shadow_mode: body.shadowMode === true,
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
      labSimulation: !duplicate && body.channelRole === 'source' ? {
        text: diagnostic || (suggestion ? `🧭 ${suggestion}` : null),
        sourceExternalMessageId: externalMessageId,
        monetaryAutoApply: false
      } : null
    });
  } catch (error) {
    if (error?.code === 'HIPICO_SERVERLESS_REPLAY_MISMATCH' || error?.message === 'HIPICO_SERVERLESS_REPLAY_MISMATCH') {
      return res.status(409).json({ ok: false, retryable: false, error: 'replay_mismatch' });
    }
    console.error('hipico group bridge ingest failed', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'ingest_unavailable' });
  }
}

export const __test__ = { normalizedTimestamp, sourceReplaySignature, persistedReplaySignature };
