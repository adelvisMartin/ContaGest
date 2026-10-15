import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';
import {
  consolidatedQuerySchema, createShareSchema, reportDate, reportGroupKey, validateReportToken
} from './report-share-policy.js';
import {
  issueHipicoReportLink, listHipicoReportLinks, readHipicoConsolidatedShare, readHipicoReportLink, revokeHipicoReportLink
} from './report-share.store.js';

const uuid = z.string().uuid();
const linkId = z.string().uuid();
const reportPath = '/api/v1/hipico/report-shares/public';

export type ReportShareStore = {
  issue: typeof issueHipicoReportLink;
  read: typeof readHipicoReportLink;
  revoke: typeof revokeHipicoReportLink;
  list: typeof listHipicoReportLinks;
  consolidated: typeof readHipicoConsolidatedShare;
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
function htmlReport(data: any, nonce: string, token: string) {
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
    </header><section><form method="get" action="${reportPath}">
    <input type="hidden" name="t" value="${escapeHtml(token)}">
    <label for="day">Fecha de consulta</label>
    <input id="day" type="date" name="date" value="${escapeHtml(data.date)}" required>
    <button type="submit">Consultar</button></form></section>
    <section><h2>Saldos al corte</h2><div class="table"><table><thead><tr><th>Participante</th><th>Moneda</th><th>Saldo</th></tr></thead><tbody>
    ${balances || '<tr><td colspan="3">Sin registros de ledger para este corte.</td></tr>'}</tbody></table></div></section>
    <section><h2>Movimientos del día</h2><div class="table"><table><thead><tr><th>Hora UTC</th><th>Participante</th><th>Tipo</th><th>Moneda</th><th>Monto</th></tr></thead><tbody>
    ${entries || '<tr><td colspan="5">Sin movimientos registrados.</td></tr>'}</tbody></table></div></section>
    ${data.entriesTruncated || data.balancesTruncated ? '<p class="notice">Hay más registros que los mostrados. Este listado es parcial: no lo uses como cierre consolidado.</p>' : ''}
    <p class="notice">La pizarra de carreras y los reportes de la PWA no forman parte de este ledger. No se han importado operaciones del software de referencia.</p>
    </main></body></html>`;
}

function htmlConsolidated(data: Awaited<ReturnType<typeof readHipicoConsolidatedShare>> & {}, nonce: string, token: string) {
  if (!data) throw new Error('HIPICO_REPORT_NOT_FOUND');
  const title = 'Consolidador del grupo · Control Hípico';
  const totals = (values: Array<{ currency:string;balanceMinor:string }>) =>
    values.map(v => `<li>${escapeHtml(v.currency)} ${escapeHtml(readableMinor(v.balanceMinor))}</li>`).join('') ||
      '<li>Sin movimientos del ledger en este período.</li>';
  const rows = data.rows.map((r) => `<tr>
    <th scope="row">${escapeHtml(r.participantCode)}</th>
    <td>${escapeHtml(r.currency)}</td>
    <td class="num">${escapeHtml(readableMinor(r.balanceMinor))}</td>
    <td class="num">${escapeHtml(readableMinor(r.daySettlementMinor))}</td>
    <td class="num">${escapeHtml(readableMinor(r.weekSettlementMinor))}</td>
  </tr>`).join('') || '<tr><td colspan="5">Sin participantes en el período.</td></tr>';
  const query = (page: number) =>
    reportPath + '?t=' + encodeURIComponent(token) +
      '&view=consolidated&date=' + encodeURIComponent(data.date) +
      '&page=' + page + '&search=' + encodeURIComponent(data.search);
  const previous = data.page > 1 ? `<a href="${escapeHtml(query(data.page - 1))}">← Anterior</a>` : '';
  const next = data.page < data.pages ? `<a href="${escapeHtml(query(data.page + 1))}">Siguiente →</a>` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow,noarchive">
    <title>${escapeHtml(title)}</title>
    <style nonce="${nonce}">
    :root{font-family:system-ui,sans-serif;color:#192842;background:#f3f6fa;color-scheme:light}
    body{margin:0;padding:14px}main{max-width:1140px;margin:auto}
    header{padding:20px;background:#243d6d;color:white;border-radius:14px}
    h1{font-size:1.4rem;margin:0 0 8px}h2{font-size:1.1rem}
    section{background:white;border-radius:12px;padding:18px;margin-top:16px}
    form{display:flex;gap:12px;flex-wrap:wrap;align-items:end}
    label{display:grid;gap:6px}input,button,a{font:inherit;padding:9px;min-height:26px}
    .table{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:620px}
    th,td{text-align:left;padding:10px;border-bottom:1px solid #e1e7ef}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .summary div{padding:12px;border:1px solid #dce2ec;border-radius:8px}
    nav{display:flex;gap:14px;align-items:center;padding-top:12px}
    small{line-height:1.5} .notice{border-left:4px solid #ad7815;background:#fff9ea;padding:12px}
    @media(max-width:650px){body{padding:8px}header{padding:14px}section{padding:12px}}
    </style></head><body><main>
    <header><h1>${escapeHtml(title)}</h1>
      <p>Grupo ${escapeHtml(data.groupKey)} · Corte ${escapeHtml(data.date)} (Venezuela)</p>
      <small>Origen: ledger PostgreSQL · Vigente hasta ${escapeHtml(data.expiresAt)} · Solo lectura</small>
    </header>
    <section><form method="get" action="${reportPath}">
      <input type="hidden" name="t" value="${escapeHtml(token)}">
      <input type="hidden" name="view" value="consolidated">
      <label for="report-date">Fecha <input id="report-date" type="date" name="date" value="${escapeHtml(data.date)}" required></label>
      <label for="report-search">Código de participante <input id="report-search" type="search" name="search" maxlength="120" value="${escapeHtml(data.search)}"></label>
      <button type="submit">Ver informe</button>
    </form></section>
    <section><h2>Resumen y totales</h2>
      <p>${data.totalParticipants} participantes del grupo · ${data.matchedParticipants} encontrados · Página ${data.page} de ${data.pages}</p>
      <div class="summary"><div><h3>Grupo completo · por moneda</h3><ul>${totals(data.groupTotals)}</ul></div>
      <div><h3>Resultado de la búsqueda · por moneda</h3><ul>${totals(data.filteredTotals)}</ul></div></div>
    </section>
    <section><h2>Participantes y movimientos registrados</h2>
      <div class="table"><table><thead><tr><th>Participante</th><th>Moneda</th><th>Saldo histórico</th>
        <th>Liquidaciones del día · neto</th><th>Liquidaciones de la semana · neto</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <nav>${previous}<span>Página ${data.page}/${data.pages}</span>${next}</nav>
    </section>
    <section class="notice"><h2>Columnas sin fuente comprobada</h2><p>Disponible con aval, devolución, depósitos, retiros y transferencias:
      <strong>no disponibles en este ledger</strong>. No son cero.
      Los importes están expresados en unidades menores y se muestran por moneda, sin convertirlos.
      Las liquidaciones son netos de asientos tipo settlement, no volumen apostado ni utilidad del club.</p>
    </section></main></body></html>`;
}

function setPrivateHeaders(res: Response) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Vary', 'Accept');
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}
function publicFailure(res: Response, code = 404) {
  // Do not reveal whether a valid, expired or revoked capability ever existed.
  return res.status(code).json({ ok: false, code: code === 404 ? 'REPORT_NOT_FOUND' : 'REPORT_UNAVAILABLE' });
}

export function createHipicoReportShareRouter(options: RouterOptions = {}) {
  const router = Router();
  const ownerId = options.ownerId || ownerFromEnvironment;
  const caracasToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now());
  const store: ReportShareStore = options.store || {
    issue: issueHipicoReportLink, read: readHipicoReportLink, revoke: revokeHipicoReportLink,
    list: listHipicoReportLinks, consolidated: readHipicoConsolidatedShare
  };
  const operatorAuthorized = options.validateOperator || operatorTokenValid;
  const now = options.now || (() => new Date());
  router.use((_req, res, next) => { setPrivateHeaders(res); next(); });

  router.get('/public', async (req: Request, res: Response) => {
    const token = validateReportToken(req.query.t);
    const dateParsed = reportDate.safeParse(req.query.date || caracasToday());
    if (!token || !dateParsed.success) return publicFailure(res);
    const view = req.query.view;
    if (view !== undefined && view !== 'consolidated') return publicFailure(res);
    try {
      if (view === 'consolidated') {
        const selected = consolidatedQuerySchema.safeParse({
          view, date: dateParsed.data, page: req.query.page ?? 1,
          search: req.query.search ?? ''
        });
        if (!selected.success) return publicFailure(res);
        const data = await store.consolidated(
          ownerId(), token, selected.data.date!, selected.data.page, selected.data.search, now()
        );
        if (!data) return publicFailure(res);
        if (req.accepts(['html','json']) === 'html') {
          const nonce = crypto.randomBytes(16).toString('base64');
          res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
          return res.status(200).type('html').send(htmlConsolidated(data,nonce,token));
        }
        return res.status(200).json({ok:true,data});
      }
      const data = await store.read(ownerId(), token, dateParsed.data, now());
      if (!data) return publicFailure(res);
      if (req.accepts(['html', 'json']) === 'html') {
        const nonce = crypto.randomBytes(16).toString('base64');
        res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
        return res.status(200).type('html').send(htmlReport(data, nonce, token));
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
  router.get('/', async (req, res) => {
    const group = reportGroupKey.safeParse(req.query.groupKey);
    if (!group.success) return res.status(400).json({ ok: false, code: 'HIPICO_REPORT_GROUP_REQUIRED' });
    try {
      return res.status(200).json({ ok: true, data: await store.list(ownerId(), group.data) });
    } catch { return res.status(503).json({ ok: false, code: 'HIPICO_REPORT_LINKS_UNAVAILABLE' }); }
  });

  router.post('/', async (req, res) => {
    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ ok: false, code: 'HIPICO_REPORT_ISSUE_INVALID' });
    try {
      const result = await store.issue({ ownerId: ownerId(), ...parsed.data }, now());
      // Only this authorized response exposes the raw secret, once.
      return res.status(201).json({
        ok: true, data: { id: result.id, expiresAt: result.expiresAt,
          relativeUrl: `${reportPath}?t=${result.token}`,
          ...(parsed.data.audience === 'group' ? {
            consolidatedRelativeUrl: `${reportPath}?t=${result.token}&view=consolidated`
          } : {})
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
