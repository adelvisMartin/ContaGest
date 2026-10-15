#!/usr/bin/env node
/**
 * Explicit, operator-only report link management. Never take credentials
 * from CLI args, querystrings, browser state or package hooks.
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const groupPattern = /^[A-Za-z0-9._:-]{1,120}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function reportApiOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('HIPICO_REPORT_ORIGIN_MUST_NOT_CONTAIN_SECRET_OR_PATH');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) {
    throw new Error('HIPICO_REPORT_REQUIRES_HTTPS_OR_LOOPBACK');
  }
  return url.origin;
}
export function parseReportCommand(argv) {
  const [action, groupOrId, audience, codeOrHours, last] = argv;
  if (action === 'list' && argv.length === 2 && groupPattern.test(groupOrId || '')) {
    return { action, groupKey: groupOrId };
  }
  if (action === 'revoke' && argv.length === 2 && uuidPattern.test(groupOrId || '')) {
    return { action, id: groupOrId };
  }
  if (action === 'create' && groupPattern.test(groupOrId || '')) {
    const personal = audience === 'participant';
    const group = audience === 'group';
    if (!personal && !group) throw new Error('HIPICO_REPORT_AUDIENCE_INVALID');
    const hours = Number(personal ? last : codeOrHours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 168 ||
        (personal && (argv.length !== 5 || !groupPattern.test(codeOrHours || ''))) ||
        (group && argv.length !== 4)) throw new Error('HIPICO_REPORT_CREATE_SCOPE_INVALID');
    return {
      action, groupKey: groupOrId, audience, hours,
      ...(personal ? { participantCode: codeOrHours } : {})
    };
  }
  throw new Error('Uso: create GRUPO participant CODIGO HORAS | create GRUPO group HORAS | list GRUPO | revoke UUID');
}
export async function main(args = process.argv.slice(2), env = process.env) {
  const op = parseReportCommand(args);
  const secret = String(env.HIPICO_OPERATOR_CONTROL_TOKEN || env.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
  if (Buffer.byteLength(secret) < 32) throw new Error('HIPICO_REPORT_OPERATOR_TOKEN_REQUIRED');
  const origin = reportApiOrigin(String(env.HIPICO_REPORT_API_ORIGIN || ''));
  const base = origin + '/api/v1/hipico/report-shares';
  const endpoint = op.action === 'list'
    ? base + '?groupKey=' + encodeURIComponent(op.groupKey)
    : op.action === 'revoke' ? base + '/' + encodeURIComponent(op.id) : base;
  const response = await fetch(endpoint, {
    method: op.action === 'create' ? 'POST' : op.action === 'revoke' ? 'DELETE' : 'GET',
    headers: {
      'x-hipico-operator-token': secret,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    ...(op.action === 'create' ? { body: JSON.stringify({
      groupKey: op.groupKey, audience: op.audience, hours: op.hours,
      ...(op.participantCode ? { participantCode: op.participantCode } : {})
    }) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('HIPICO_REPORT_HTTP_' + response.status);
  if (op.action === 'revoke') { process.stdout.write('Enlace revocado.\n'); return; }
  const payload = await response.json();
  if (!payload?.ok || !payload?.data) throw new Error('HIPICO_REPORT_RESPONSE_INVALID');
  if (op.action === 'create') {
    const relative = String(payload.data.relativeUrl || '');
    if (!relative.startsWith('/api/v1/hipico/report-shares/public?t=')) throw new Error('HIPICO_REPORT_LINK_RESPONSE_INVALID');
    process.stdout.write('Enlace privado (compartir solo con el destinatario autorizado):\n' + new URL(relative, origin).toString() + '\n');
  } else {
    // JSON link listing must not contain bearer token material.
    process.stdout.write(JSON.stringify(payload.data, null, 2) + '\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('No se pudo administrar el enlace: ' + String(error?.message || 'error').replace(/https?:\/\/\S+/gi,'[URL omitida]'));
    process.exitCode = 1;
  });
}
