import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';
import {
  createShareSchema, reportDate, validateReportToken
} from './report-share-policy.js';
import {
  issueHipicoReportLink, readHipicoReportLink, revokeHipicoReportLink
} from './report-share.store.js';

const uuid = z.string().uuid();
const linkId = z.string().uuid();
const reportPath = '/api/v1/hipico/report-shares/public';

export type ReportShareStore = {
  issue: typeof issueHipicoReportLink;
  read: typeof readHipicoReportLink;
  revoke: typeof revokeHipicoReportLink;
};
type RouterOptions = { ownerId?: () => string; validateOperator?: (value: string | undefined) => boolean; store?: ReportShareStore; now?: () => Date };
function ownerFromEnvironment() {
  const id = uuid.safeParse(String(process.env.HIPICO_OWNER_ID || '').trim());
  if (!id.success) throw new Error('HIPICO_REPORT_OWNER_NOT_CONFIGURED');
  return id.data;
}
function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] || ch);
}
export function readableMinor(amount: string) {
  if (!/^-?\d{1,30}$/.test(String(amount))) throw new Error('HIPICO_REPORT_AMOUNT_INVALID');
  const sign = amount.startsWith('-') ? '-' : '';
  const unsigned = sign ? amount.slice(1) : amount;
  const digits = unsigned.padStart(3, '0');
  const major = digits.slice(0, -2).replace(/^0+(?=\d)/, '');
  const grouped = major.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + grouped + ',' + digits.slice(-2);
}
function htmlReport(data: any, nonce: string) {
  const balances = data.balances.map((b: any) => `<tr><td>${escapeHtml(b.participantCode)}</td><td>${escapeHtml(b.currency)}</td><td class="num">${escapeHtml(readableMinor(b.amountMinor))}</td></tr>`).join('');
  const entries = data.entries.map((e: any) => `<tr><td>${escapeHtml(String(e.createdAt).slice(0, 19).replace('T', ' '))}</td><td>${escapeHtml(e.participantCode)}</td><td>${escapeHtml(e.entryType)}</td><td>${escapeHtml(e.currency)}</td><td class="num">${escapeHtml(readableMinor(e.amountMinor))}</td></tr>`).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive"><title>Estado de movimientos · Control Hípico</title>
    <style nonce="${nonce}">
      :root{color-scheme:light;font-family:system-ui,sans-serif;background:#f2f5fa;color:#17243b}
      body{margin:0;padding:24px 14px}main{max-width:1100px;margin:auto}
      header{background:#223b6b;color:white;padding:24px;border-radius:14px}
      h1{font-size:1.3rem}h2{font-size:1.05rem}p{line-height:1.5}
      section{margin-top:18px;padding:18px;background:white;border-radius:12px}
      .table{max-width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:480px}
      td,th{padding:10px;border-bottom:1px solid #e0e5ed;text-align:left}th{font-size:.83rem;color:#4e617c}
      .num{text-align:right;font-variant-numeric:tabular-nums}
      .notice{border-left:4px solid #9b6d12;padding:12px;background:#fff7e5}
      @media(max-width:600px){body{padding:10px}header{padding:16px}section{padding:12px}}
    </style></head><body><main><header><h1>Control Hípico · Movimientos</h1>
    <p>Fecha: ${escapeHtml(data.date)} · Grupo: ${escapeHtml(data.groupKey)} · Alcance: ${data.scope === 'participant' ? 'Participante' : 'Grupo completo'}</p>
    ${data.participantCode ? '<p>Cuenta: '+escapeHtml(data.participantCode)+'</p>' : ''}
    <small>Datos verificados del ledger · Lectura exclusiva · Vigente hasta ${escapeHtml(data.expiresAt)}</small>
    </header><section><h2>Saldos al corte</h2><div class="table"><table><thead><tr><th>Participante</th><th>Moneda</th><th>Saldo</th></tr></thead><tbody>
    ${balances || '<tr><td colspan="3">Sin registros de ledger para este corte.</td></tr>'}</tbody></table></div></section>
    <section><h2>Movimientos del día</h2><div class="table"><table><thead><tr><th>Hora UTC</th><th>Participante</th><th>Tipo</th><th>Moneda</th><th>Monto</th></tr></thead><tbody>
    ${entries || '<tr><td colspan="5">Sin movimientos registrados.</td></tr>'}</tbody></table></div></section>
    ${data.entriesTruncated || data.balancesTruncated ? '<p class="notice">Hay más registros que los mostrados. Este listado es parcial: no lo uses como cierre consolidado.</p>' : ''}
    <p class="notice">La pizarra de carreras y los reportes de la PWA no forman parte de este ledger. No se han importado operaciones del software de referencia.</p>
    </main></body></html>`;
}
function setPrivateHeaders(res: Response) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Vary', 'Accept');
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
}
function publicFailure(res: Response, code = 404) {
  // Do not reveal whether a valid, expired or revoked capability ever existed.
  return res.status(code).json({ ok: false, code: code === 404 ? 'REPORT_NOT_FOUND' : 'REPORT_UNAVAILABLE' });
}

export function createHipicoReportShareRouter(options: RouterOptions = {}) {
  const router = Router();
  const ownerId = options.ownerId || ownerFromEnvironment;
  const store: ReportShareStore = options.store || {
    issue: issueHipicoReportLink, read: readHipicoReportLink, revoke: revokeHipicoReportLink
  };
  const operatorAuthorized = options.validateOperator || operatorTokenValid;
  const now = options.now || (() => new Date());
  router.use((_req, res, next) => { setPrivateHeaders(res); next(); });

  router.get('/public', async (req: Request, res: Response) => {
    const token = validateReportToken(req.query.t);
    const dateParsed = reportDate.safeParse(req.query.date);
    if (!token || !dateParsed.success) return publicFailure(res);
    try {
      const data = await store.read(ownerId(), token, dateParsed.data, now());
      if (!data) return publicFailure(res);
      if (req.accepts('html') && !req.accepts('json')) {
        const nonce = crypto.randomBytes(16).toString('base64');
        res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
        return res.status(200).type('html').send(htmlReport(data, nonce));
      }
      return res.status(200).json({ ok: true, data });
    } catch { return publicFailure(res, 503); }
  });

  router.use((req, res, next) => {
    if (!operatorAuthorized(req.header('x-hipico-operator-token') || undefined)) {
      return res.status(401).json({ ok: false, code: 'HIPICO_REPORT_OPERATOR_UNAUTHORIZED' });
    }
    next();
  });
  router.post('/', async (req, res) => {
    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: 'HIPICO_REPORT_ISSUE_INVALID' });
    try {
      const result = await store.issue({ ownerId: ownerId(), ...parsed.data }, now());
      // Only this authorized response exposes the raw secret, once.
      return res.status(201).json({
        ok: true, data: { id: result.id, expiresAt: result.expiresAt,
          relativeUrl: `${reportPath}?t=${result.token}&date=${new Date().toISOString().slice(0, 10)}`
        }
      });
    } catch { return res.status(503).json({ ok: false, code: 'HIPICO_REPORT_ISSUE_UNAVAILABLE' }); }
  });
  router.delete('/:id', async (req, res) => {
    const parsed = linkId.safeParse(req.params.id);
    if (!parsed.success) return res.status(400).json({ ok: false, code: 'HIPICO_REPORT_LINK_ID_INVALID' });
    try {
      if (!await store.revoke(ownerId(), parsed.data)) return publicFailure(res);
      return res.status(204).end();
    } catch { return res.status(503).json({ ok: false, code: 'HIPICO_REPORT_REVOKE_UNAVAILABLE' }); }
  });
  return router;
}
export default createHipicoReportShareRouter();
