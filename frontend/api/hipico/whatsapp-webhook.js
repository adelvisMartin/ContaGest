import { readRawBody } from './_shared.js';
import { proxyCanonicalRequest, relayCanonicalResponse } from './canonical-backend.js';

export const config = { api: { bodyParser: false } };

function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined && item !== null) params.append(key, String(item));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

function webhookPath(req) { return `/api/v1/hipico-bot/webhook${queryString(req.query)}`; }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, retryable: false, error: 'method_not_allowed' });
  let body;
  if (req.method === 'POST') {
    try { body = await readRawBody(req); }
    catch (error) {
      if (error?.message === 'request_body_too_large') return res.status(413).json({ ok: false, retryable: false, error: 'request_body_too_large' });
      return res.status(400).json({ ok: false, retryable: false, error: 'request_body_invalid' });
    }
  }
  const headers = {};
  const contentType = String(req.headers['content-type'] || '').trim();
  const signature = String(req.headers['x-hub-signature-256'] || '').trim();
  if (contentType) headers['content-type'] = contentType;
  if (signature) headers['x-hub-signature-256'] = signature;
  try {
    const upstream = await proxyCanonicalRequest({ path: webhookPath(req), method: req.method, headers, body });
    return relayCanonicalResponse(res, upstream);
  } catch (error) {
    console.error('hipico canonical webhook proxy failed', { message: error?.message || String(error) });
    return res.status(503).json({ ok: false, retryable: true, error: 'canonical_backend_unavailable' });
  }
}

export const __test__ = { queryString, webhookPath };
