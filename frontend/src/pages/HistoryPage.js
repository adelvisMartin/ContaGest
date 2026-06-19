import { PageHeader, Button, Table } from '../components/ui/index.js';
import { bs, usd, dateTime } from '../core/formatters.js';
import { escapeHtml, qsa, downloadText } from '../utils/dom.js';
import { downloadCsv } from '../services/csv.js';
import { PdfService } from '../services/pdf.js';

export const HistoryPage = {
  render(state) {
    const rows = state.history.map((record) => `<tr><td>${dateTime(record.createdAt)}</td><td>${escapeHtml(record.clientName || '-')}</td><td>${escapeHtml(record.quote?.numeroFactura || '-')}</td><td>${escapeHtml(record.quote?.orden || '-')}</td><td>${bs(record.calculation?.total || 0)}</td><td>${usd(record.calculation?.totalUsdEquivalent || 0)}</td><td><div class="flex flex-wrap gap-2"><button class="btn btn-secondary !p-2" data-pdf-record="${record.id}"><i class="fa-solid fa-file-pdf"></i></button><button class="btn btn-secondary !p-2" data-duplicate-record="${record.id}"><i class="fa-solid fa-copy"></i></button><button class="btn btn-danger !p-2" data-delete-record="${record.id}"><i class="fa-solid fa-trash"></i></button></div></td></tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'historyEyebrow', titleKey:'historyTitle', descKey:'historyDesc', actions:Button({ id:'btnExportHistoryCsv', text:'Exportar CSV', i18n:'exportCsv', icon:'fa-file-csv', variant:'secondary' }) + Button({ id:'btnExportHistoryJson', text:'Exportar JSON', i18n:'exportJson', icon:'fa-code', variant:'secondary' }) })}<div class="panel-soft rounded-[1.5rem] p-4">${Table({ headers:[{label:'Creado'}, {key:'client'}, {key:'invoice'}, {label:'Orden'}, {label:'Total Bs'}, {label:'Total USD'}, {key:'actions'}], rows })}</div></section>`;
  },
  mount(state, { Store, Toast, navigate }) {
    qsa('[data-pdf-record]').forEach((button) => button.addEventListener('click', () => { const s = Store.get(); const record = s.history.find((item) => item.id === button.dataset.pdfRecord); if (record) PdfService.generateQuote(s, record); }));
    qsa('[data-duplicate-record]').forEach((button) => button.addEventListener('click', () => { Store.update((draft) => { const record = draft.history.find((item) => item.id === button.dataset.duplicateRecord); if (record) draft.quote = JSON.parse(JSON.stringify(record.quote)); }); Toast.show('Documento duplicado al cotizador.', 'success'); navigate('cotizacion'); }));
    qsa('[data-delete-record]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.history = draft.history.filter((item) => item.id !== button.dataset.deleteRecord); })));
    document.getElementById('btnExportHistoryCsv')?.addEventListener('click', () => downloadCsv('historico-contagest-ve.csv', Store.get().history.map((r) => ({ fecha:r.createdAt, cliente:r.clientName, factura:r.quote?.numeroFactura, orden:r.quote?.orden, total:r.calculation?.total }))));
    document.getElementById('btnExportHistoryJson')?.addEventListener('click', () => downloadText('historico-contagest-ve.json', JSON.stringify(Store.get().history, null, 2), 'application/json'));
  }
};
