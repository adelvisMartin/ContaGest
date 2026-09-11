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

function validateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_body';
  const groupId = String(body.groupId || '').trim();
  const externalMessageId = String(body.externalMessageId || '').trim();
  const role = String(body.channelRole || 'source');
  if (!groupId || groupId.length > 220 || !externalMessageId || externalMessageId.length > 320) return 'invalid_identifiers';
  if (!['source', 'lab'].includes(role)) return 'invalid_channel_role';
  if (String(body.text || '').length > 4000) return 'text_too_large';
  if (String(body.senderId || '').length > 220 || String(body.senderLabel || '').length > 220) return 'sender_too_large';
  if (role === 'source' && body.shadowMode !== true) return 'source_requires_shadow_mode';
  const pinnedSource = env('HIPICO_SOURCE_GROUP_ID', false);
  const pinnedLab = env('HIPICO_LAB_GROUP_ID', false);
  if (role === 'source' && pinnedSource && groupId !== pinnedSource) return 'source_group_not_authorized';
  if (role === 'lab' && pinnedLab && groupId !== pinnedLab) return 'lab_group_not_authorized';
  return null;
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
      shadow_mode: Boolean(body.shadowMode)
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

  const configuredToken = env('HIPICO_GROUP_BRIDGE_TOKEN');
  if (!safeEqual(req.headers['x-hipico-bridge-token'], configuredToken)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  const bodyError = validateBody(body);
  if (bodyError) return res.status(400).json({ ok: false, error: bodyError });

  const groupId = String(body.groupId).trim();
  const externalMessageId = String(body.externalMessageId).trim();
  const text = String(body.text || '');

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
        sender_role: body.fromMe ? 'operator' : 'unknown',
        quoted_external_message_id: body.quotedExternalMessageId || null,
        sent_at: body.timestamp || null,
        message_type: String(body.type || 'text').slice(0, 80),
        raw_text: text,
        classification,
        confidence,
        processing_status: processingStatus,
        normalized: {
          source: 'web_bridge',
          group_name: String(body.groupName || ''),
          channel_role: String(body.channelRole || 'source'),
          shadow_mode: Boolean(body.shadowMode),
          from_me: Boolean(body.fromMe),
          has_media: Boolean(body.hasMedia)
        },
        metadata: {
          bridge_version: String(body.bridgeVersion || '').slice(0, 80),
          received_by: 'group-bridge-ingest',
          proposed_reply: suggestion || null
        }
      }])
    });

    const duplicate = !Array.isArray(rows) || rows.length === 0;
    if (!duplicate) await recordShadowPrediction({ ownerId, channel, body, messageRow: rows[0], classification, confidence, suggestion });

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
    console.error('hipico group bridge ingest failed', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'ingest_unavailable' });
  }
}
