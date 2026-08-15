import crypto from 'node:crypto';
import { env, sha256, supabase, classifyText } from './_shared.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

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
    race_close: 'Cierre de recepción detectado. Confirmar hipódromo y carrera activa antes de publicar plano o bloquear nuevas jugadas.',
    day_close: 'Cierre de jornada detectado. Revisar carreras pendientes, snapshots y disponibles antes de publicar el cierre final.',
    result: 'Llegada/pizarra detectada. Confirmar carrera e hipódromo antes de aplicarla al motor de liquidación.',
    plan_snapshot: 'Plano detectado. Comparar huella, parejas y montos contra la carrera activa antes de aceptarlo.',
    settlement_snapshot: 'Liquidación detectada. Ejecutar auditor de liquidación; no modificar saldos automáticamente.',
    balance_snapshot: 'Snapshot de disponibles detectado. Conciliar contra el ledger sin sobrescribir el historial.'
  };
  return suggestions[classification] || '';
}

async function resolveOwnerId() {
  const rows = await supabase('hipico_workspaces?select=owner_id&order=updated_at.desc&limit=1');
  const ownerId = rows?.[0]?.owner_id;
  if (!ownerId) throw new Error('No Hípico workspace owner found');
  return ownerId;
}

async function ensureChannel(ownerId, body) {
  const groupId = String(body.groupId || '').trim();
  const groupName = String(body.groupName || 'Grupo WhatsApp').trim();
  const groupKey = `web-${slug(groupName)}-${sha256(groupId).slice(0, 10)}`;
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
      bridge_version: String(body.bridgeVersion || ''),
      channel_role: String(body.channelRole || 'source'),
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
  const sourceExternalMessageId = String(body.externalMessageId || '');
  await supabase('hipico_shadow_evaluations?on_conflict=owner_id,source_group_key,source_external_message_id,prediction_type', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{
      owner_id: ownerId,
      source_group_key: channel.group_key,
      source_message_id: messageRow.id,
      source_external_message_id: sourceExternalMessageId,
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const configuredToken = env('HIPICO_GROUP_BRIDGE_TOKEN');
  const suppliedToken = req.headers['x-hipico-bridge-token'];
  if (!safeEqual(suppliedToken, configuredToken)) return res.status(401).json({ error: 'unauthorized' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const groupId = String(body?.groupId || '').trim();
  const externalMessageId = String(body?.externalMessageId || '').trim();
  const text = String(body?.text || '');
  if (!groupId || !externalMessageId) return res.status(400).json({ error: 'missing_group_or_message_id' });

  try {
    const ownerId = await resolveOwnerId();
    const channel = await ensureChannel(ownerId, body);
    if (!channel?.id) throw new Error('Channel could not be resolved');

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
        message_type: String(body.type || 'text'),
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
          bridge_version: String(body.bridgeVersion || ''),
          received_by: 'group-bridge-ingest',
          proposed_reply: suggestion || null
        }
      }])
    });

    const duplicate = !Array.isArray(rows) || rows.length === 0;
    if (!duplicate) {
      await recordShadowPrediction({ ownerId, channel, body, messageRow: rows[0], classification, confidence, suggestion });
    }

    const response = {
      accepted: true,
      duplicate,
      classification,
      confidence,
      channelKey: channel.group_key,
      automationMode: body.shadowMode ? 'shadow' : 'manual_guarded',
      actions: []
    };

    // In shadow mode source-group suggestions are routed by the linked-device bridge
    // to the laboratory group. No monetary action is ever applied here.
    if (!duplicate && body.shadowMode && body.channelRole === 'source' && suggestion) {
      response.actions.push({ type: 'reply', text: `🧭 ${suggestion}` });
    }

    // Harmless end-to-end diagnostic. It proves message -> backend -> authorized
    // bridge response without changing bets, races or balances.
    if (!duplicate && /^\/hipico_status\s*$/i.test(text.trim())) {
      response.actions.push({
        type: 'reply',
        text: `Hípico Control conectado ✅\nCanal: ${String(body.groupName || 'WhatsApp')}\nRecepción: activa\nModo: ${body.shadowMode ? 'sombra' : 'manual protegido'}`
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('hipico group bridge ingest failed', error);
    return res.status(500).json({ error: 'ingest_failed' });
  }
}
