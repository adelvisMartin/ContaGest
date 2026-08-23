import { PageHeader, Button, ErpButton, ErpDataTable, ErpRow, ErpSection } from '../components/ui/index.js';
import { bs, usd, dateTime } from '../core/formatters.js';
import { escapeHtml, qsa, downloadText } from '../utils/dom.js';
import { downloadCsv } from '../services/csv.js';
import { PdfService } from '../services/pdf.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const HistoryPage = {
  render(state) {
    const actionsFor = (record) => ErpRow([
      ErpButton('Generar PDF', { variant:'secondary', icon:'fa-solid fa-file-pdf', iconOnly:true, data:{ 'pdf-record':record.id } }),
      ErpButton('Duplicar documento', { variant:'secondary', icon:'fa-solid fa-copy', iconOnly:true, data:{ 'duplicate-record':record.id } }),
      ErpButton('Eliminar registro local', { variant:'danger', icon:'fa-solid fa-trash', iconOnly:true, data:{ 'delete-record':record.id } })
    ].join(''), { wrap:true });

    const table = ErpDataTable({
      caption:'Histórico de documentos ContaGest',
      columns:[
        { key:'createdAt', label:'Creado', render:(record) => safe(dateTime(record.createdAt)) },
        { key:'clientName', label:'Cliente', render:(record) => safe(record.clientName || '-') },
        { key:'invoice', label:'Factura', render:(record) => safe(record.quote?.numeroFactura || '-') },
        { key:'order', label:'Orden', render:(record) => safe(record.quote?.orden || '-') },
        { key:'totalBs', label:'Total Bs', numeric:true, render:(record) => safe(bs(record.calculation?.total || 0)) },
        { key:'totalUsd', label:'Total USD', numeric:true, render:(record) => safe(usd(record.calculation?.totalUsdEquivalent || 0)) },
        { key:'actions', label:'Acciones', render:actionsFor }
      ],
      rows:state.history
    });

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'historyEyebrow',
      titleKey:'historyTitle',
      descKey:'historyDesc',
      actions:Button({ id:'btnExportHistoryCsv', text:'Exportar CSV', i18n:'exportCsv', icon:'fa-file-csv', variant:'secondary' })
        + Button({ id:'btnExportHistoryJson', text:'Exportar JSON', i18n:'exportJson', icon:'fa-code', variant:'secondary' })
    })}${ErpSection({ title:'Documentos guardados', description:'Consulta, exporta, duplica o genera nuevamente los documentos registrados. Eliminar sólo retira la copia local del historial; no anula documentos fiscales o contables.', content:table })}</section>`;
  },
  mount(state, { Store, Toast, Modal, navigate }) {
    qsa('[data-pdf-record]').forEach((button) => button.addEventListener('click', () => { const s = Store.get(); const record = s.history.find((item) => item.id === button.dataset.pdfRecord); if (record) PdfService.generateQuote(s, record); }));
    qsa('[data-duplicate-record]').forEach((button) => button.addEventListener('click', () => { Store.update((draft) => { const record = draft.history.find((item) => item.id === button.dataset.duplicateRecord); if (record) draft.quote = JSON.parse(JSON.stringify(record.quote)); }); Toast.show('Documento duplicado al cotizador.', 'success'); navigate('cotizacion'); }));
    qsa('[data-delete-record]').forEach((button) => button.addEventListener('click', async () => {
      const record = Store.get().history.find((item) => item.id === button.dataset.deleteRecord);
      if (!record) return;
      const confirmed = await Modal.confirm({
        title:'Eliminar copia local',
        message:`Se retirará del historial local ${record.quote?.numeroFactura || record.clientName || 'este registro'}. Esta acción no anula una factura ni un asiento contable.`,
        confirmText:'Eliminar copia local',
        tone:'danger'
      });
      if (!confirmed) return;
      Store.update((draft) => { draft.history = draft.history.filter((item) => item.id !== button.dataset.deleteRecord); });
      Toast.show('Copia local retirada del historial.', 'success');
    }));
    document.getElementById('btnExportHistoryCsv')?.addEventListener('click', () => downloadCsv('historico-contagest-ve.csv', Store.get().history.map((r) => ({ fecha:r.createdAt, cliente:r.clientName, factura:r.quote?.numeroFactura, orden:r.quote?.orden, total:r.calculation?.total }))));
    document.getElementById('btnExportHistoryJson')?.addEventListener('click', () => downloadText('historico-contagest-ve.json', JSON.stringify(Store.get().history, null, 2), 'application/json'));
  }
};
