import { PageHeader, Field, Select, Button, Table, Badge, StatCard } from '../components/ui/index.js';
import { bs, usd, number, shortDate } from '../core/formatters.js';
import { calculateLedger } from '../core/calculator.js';
import { escapeHtml, mountSubmit, qsa, uid, today, downloadText } from '../utils/dom.js';

const docTypes = [
  { value: 'SA', label: 'SA · Asiento diario' },
  { value: 'AB', label: 'AB · Documento contable' },
  { value: 'DZ', label: 'DZ · Cobranza cliente' },
  { value: 'KZ', label: 'KZ · Pago proveedor' },
  { value: 'PR', label: 'PR · Nómina' },
  { value: 'AJ', label: 'AJ · Ajuste / reclasificación' }
];

const templates = [
  { id: 'saleVat', label: 'Venta con IVA', debitAccount: 'Cuentas por cobrar', creditAccount: 'Ventas', description: 'Venta comercial con IVA débito fiscal' },
  { id: 'bankExpense', label: 'Egreso bancario', debitAccount: 'Gastos administrativos', creditAccount: 'Bancos', description: 'Pago operativo desde banco' },
  { id: 'inventoryPurchase', label: 'Compra inventario', debitAccount: 'Inventario', creditAccount: 'Cuentas por pagar', description: 'Compra de inventario / mercancía' },
  { id: 'payroll', label: 'Nómina', debitAccount: 'Gastos administrativos', creditAccount: 'Bancos', description: 'Registro de nómina y pago' }
];

const normalizeAmount = (value) => Number(value || 0);
const toBs = (amount, currency, rate) => currency === 'USD' ? normalizeAmount(amount) * normalizeAmount(rate) : normalizeAmount(amount);
const groupDocs = (entries = []) => entries.reduce((acc, entry) => {
  const key = entry.docNo || entry.id || 'SIN-DOC';
  if (!acc[key]) acc[key] = [];
  acc[key].push(entry);
  return acc;
}, {});

function currencyDual(amountBs, rate) {
  const bsValue = normalizeAmount(amountBs);
  const usdValue = rate ? bsValue / normalizeAmount(rate) : 0;
  return `<span class="cg-ledger-dual"><strong>${bs(bsValue)}</strong><small>${usd(usdValue)}</small></span>`;
}

function documentRows(entries, rate) {
  return entries.map((entry, index) => {
    const debitBs = toBs(entry.debit, entry.currency || 'VES', entry.rate || rate);
    const creditBs = toBs(entry.credit, entry.currency || 'VES', entry.rate || rate);
    return `<tr>
      <td class="mono">${escapeHtml(entry.docNo || '-')}<small>${String(index + 1).padStart(3, '0')}</small></td>
      <td>${shortDate(entry.date)}<small>FecCont/FecDoc</small></td>
      <td><strong>${escapeHtml(entry.docType || 'SA')}</strong><small>${escapeHtml(entry.reference || entry.id || '-')}</small></td>
      <td class="mono">${escapeHtml(entry.account)}</td>
      <td>${escapeHtml(entry.description || entry.headerText || '')}</td>
      <td class="cg-cell-money mono">${normalizeAmount(entry.debit) ? number(entry.debit) : '-'}</td>
      <td>${escapeHtml(entry.currency || 'VES')}</td>
      <td class="cg-cell-money">${debitBs ? currencyDual(debitBs, entry.rate || rate) : '-'}</td>
      <td class="cg-cell-money">${creditBs ? currencyDual(creditBs, entry.rate || rate) : '-'}</td>
      <td>${entry.source === 'supabase' ? Badge('Supabase','success') : Badge('Local','warning')}</td>
      <td class="cg-actions-cell"><div class="cg-row-actions"><button class="btn btn-danger !p-2" type="button" data-delete-ledger="${escapeHtml(entry.id)}" aria-label="Eliminar línea"><i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`;
  });
}

function csvFromEntries(entries = [], rate = 0) {
  const header = ['docNo','lineNo','date','docType','reference','account','description','debitME','creditME','currency','rate','debitBs','creditBs'];
  const lines = entries.map((entry, index) => {
    const lineNo = entry.lineNo || index + 1;
    const currency = entry.currency || 'VES';
    const rowRate = entry.rate || rate;
    const debitBs = toBs(entry.debit, currency, rowRate);
    const creditBs = toBs(entry.credit, currency, rowRate);
    return [entry.docNo || '', lineNo, entry.date || '', entry.docType || '', entry.reference || '', entry.account || '', entry.description || '', entry.debit || 0, entry.credit || 0, currency, rowRate, debitBs, creditBs]
      .map((value) => `"${String(value ?? '').replaceAll('"','""')}"`).join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

function htmlBook(state) {
  const rate = Number(state.bcv?.rate || 0);
  const entries = state.ledger.entries || [];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Libro diario ContaGest</title><style>
    body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a} h1{font-size:28px;margin:0 0 8px} p{color:#475569;font-weight:700} table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px} th{background:#e8eef7;text-align:left;color:#1e3a8a;text-transform:uppercase;letter-spacing:.08em} th,td{border:1px solid #cbd5e1;padding:8px} td.num{text-align:right;font-family:Consolas,monospace}.doc{font-weight:900;color:#0b1f3a}.total{font-weight:900;background:#f8fafc}</style></head><body>
    <h1>Libro Diario · ${escapeHtml(state.settings?.companyTradeName || state.settings?.companyName || 'ContaGest')}</h1>
    <p>RIF ${escapeHtml(state.settings?.companyRif || '')} · Tasa referencial ${bs(rate)} / USD · Generado ${new Date().toLocaleString('es-VE')}</p>
    <table><thead><tr><th>Doc.</th><th>Fecha</th><th>Tipo</th><th>Cuenta</th><th>Texto</th><th>Debe Bs</th><th>Haber Bs</th></tr></thead><tbody>
    ${entries.map((entry) => `<tr><td class="doc">${escapeHtml(entry.docNo || '')}</td><td>${shortDate(entry.date)}</td><td>${escapeHtml(entry.docType || 'SA')}</td><td>${escapeHtml(entry.account || '')}</td><td>${escapeHtml(entry.description || '')}</td><td class="num">${number(toBs(entry.debit, entry.currency || 'VES', entry.rate || rate))}</td><td class="num">${number(toBs(entry.credit, entry.currency || 'VES', entry.rate || rate))}</td></tr>`).join('')}
    </tbody></table></body></html>`;
}

export const LedgerPage = {
  render(state) {
    const rate = Number(state.bcv?.rate || 0);
    const totals = calculateLedger((state.ledger.entries || []).map((entry) => ({
      debit: toBs(entry.debit, entry.currency || 'VES', entry.rate || rate),
      credit: toBs(entry.credit, entry.currency || 'VES', entry.rate || rate)
    })));
    const docs = groupDocs(state.ledger.entries || []);
    const entries = state.ledger.entries || [];
    const rows = documentRows(entries, rate);
    const docCount = Object.keys(docs).length;
    const actions = `
      ${Button({ id:'btnDownloadLedgerCsv', text:'Descargar CSV', icon:'fa-file-csv', variant:'secondary', attrs:'type="button"' })}
      ${Button({ id:'btnPrintLedgerBook', text:'Vista / imprimir libro', icon:'fa-print', variant:'secondary', attrs:'type="button"' })}
      ${Button({ id:'btnLedgerTemplateSale', text:'Plantilla venta', icon:'fa-wand-magic-sparkles', variant:'primary', attrs:'type="button"' })}
      ${Button({ id:'btnSyncLedger', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button" data-admin-only="true"' })}`;
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7 cg-ledger-page">
      ${PageHeader({ eyebrowKey:'ledgerEyebrow', titleKey:'ledgerTitle', descKey:'ledgerDesc', actions })}
      <div class="mb-5 grid gap-4 md:grid-cols-5 cg-ledger-kpis">
        ${StatCard({label:'Documentos', value:String(docCount), icon:'fa-file-invoice'})}
        ${StatCard({label:'Líneas', value:String(entries.length), icon:'fa-list-ol'})}
        ${StatCard({label:'Debe', value:bs(totals.debit), hint:rate ? usd(totals.debit / rate) : 'USD pendiente', icon:'fa-arrow-up'})}
        ${StatCard({label:'Haber', value:bs(totals.credit), hint:rate ? usd(totals.credit / rate) : 'USD pendiente', icon:'fa-arrow-down'})}
        ${StatCard({label:'Estado', value:totals.balanced ? 'Balanceado' : 'Descuadre', hint:totals.balanced ? 'Partida doble OK' : `Diferencia ${bs(totals.diff)}`, icon:'fa-scale-balanced', tone: totals.balanced ? 'success' : 'danger'})}
      </div>

      <section class="cg-ledger-workbench">
        <form id="ledgerForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4 cg-ledger-form">
          <div class="cg-ledger-form-head">
            <div><p class="cgx-eyebrow">Captura guiada</p><h2>Documento contable</h2><small>Usa contrapartida automática para generar debe/haber en una sola operación.</small></div>
            <div class="cg-ledger-status ${totals.balanced ? 'is-ok' : 'is-risk'}"><i class="fa-solid fa-scale-balanced"></i>${totals.balanced ? 'Libro balanceado' : 'Requiere revisión'}</div>
          </div>
          <div class="cg-record-fields cg-fields-compact cg-ledger-header-fields">
            ${Field({ labelKey:'Fecha contable', name:'date', type:'date', value:today() })}
            ${Field({ labelKey:'Nº documento', name:'docNo', value:`DI-${new Date().getFullYear()}-${String(entries.length + 1).padStart(4, '0')}` })}
            ${Select({ labelKey:'Clase doc.', name:'docType', options:docTypes })}
            ${Field({ labelKey:'Referencia', name:'reference', placeholder:'Factura, banco, nómina...' })}
            ${Select({ labelKey:'Moneda', name:'currency', value:'VES', options:[{ value:'VES', label:'Bs / VES' }, { value:'USD', label:'USD' }] })}
            ${Field({ labelKey:'Tasa', name:'rate', type:'number', value:String(rate || 0), attrs:'step="0.0001"' })}
            ${Field({ labelKey:'Texto cabecera', name:'headerText', className:'cg-field-wide', placeholder:'Resumen del documento contable' })}
          </div>
          <div class="cg-ledger-line-card">
            <div class="cg-ledger-line-title"><strong>Línea y contrapartida</strong><span>Debe/Haber se genera balanceado automáticamente.</span></div>
            <div class="cg-record-fields cg-fields-compact">
              ${Select({ labelKey:'Cuenta principal', name:'account', options:state.ledger.accounts.map((name) => ({ value:name, label:name })) })}
              ${Select({ labelKey:'Cuenta contrapartida', name:'counterAccount', options:state.ledger.accounts.map((name) => ({ value:name, label:name })) })}
              ${Field({ labelKey:'Texto línea', name:'description', className:'cg-field-wide', required:true, placeholder:'Descripción de la operación' })}
              ${Select({ labelKey:'Naturaleza principal', name:'side', value:'debit', options:[{ value:'debit', label:'Debe' }, { value:'credit', label:'Haber' }] })}
              ${Field({ labelKey:'Monto', name:'amount', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
            </div>
          </div>
          <div class="cg-record-actions cg-ledger-actions">
            ${Button({ text:'Agregar documento balanceado', icon:'fa-book', type:'submit' })}
            ${Button({ id:'btnLedgerCounterpart', text:'Previsualizar contrapartida', icon:'fa-right-left', variant:'secondary', attrs:'type="button"' })}
          </div>
        </form>

        <aside class="panel-soft rounded-[1.5rem] p-4 cg-ledger-preview-card">
          <p class="cgx-eyebrow">Vista previa</p>
          <h2>Hoja de libro diario</h2>
          <div id="ledgerLivePreview" class="cg-ledger-live-preview">Completa el formulario para ver la contrapartida.</div>
          <div class="cg-ledger-template-list">
            ${templates.map((template) => `<button type="button" data-ledger-template="${template.id}"><strong>${template.label}</strong><small>${template.debitAccount} ↔ ${template.creditAccount}</small></button>`).join('')}
          </div>
        </aside>
      </section>

      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4 mt-5 cg-ledger-book">
        <div class="cg-ledger-book-head"><div><p class="cgx-eyebrow">Libro Diario ESAP / SAP-like</p><h2>Diario de documentos</h2></div>${Badge(totals.balanced ? 'Libro balanceado' : 'Libro descuadrado', totals.balanced ? 'success' : 'danger')}</div>
        ${Table({ headers:[{label:'Nº doc.'}, {label:'FecCont / FecDoc'}, {label:'Clase / Referencia'}, {label:'Cuenta'}, {label:'Texto cabecera doc.'}, {label:'Imp. debe ME'}, {label:'Mon.'}, {label:'Imp. debe ML'}, {label:'Imp. haber ML'}, {label:'Origen'}, {key:'actions'}], rows })}
      </div>
    </section>`;
  },
  mount(state, { Store, Toast, SupabaseSyncService }) {
    const rate = Number(Store.get().bcv?.rate || 0);
    const refreshPreview = () => {
      const form = document.getElementById('ledgerForm');
      const host = document.getElementById('ledgerLivePreview');
      if (!form || !host) return;
      const data = Object.fromEntries(new FormData(form));
      const amount = normalizeAmount(data.amount);
      const rowRate = normalizeAmount(data.rate || rate);
      const mainDebit = data.side === 'debit' ? amount : 0;
      const mainCredit = data.side === 'credit' ? amount : 0;
      const counterDebit = data.side === 'credit' ? amount : 0;
      const counterCredit = data.side === 'debit' ? amount : 0;
      host.innerHTML = `<table class="cg-ledger-mini"><thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th><th>Bs</th></tr></thead><tbody>
        <tr><td>${escapeHtml(data.account || '-')}</td><td>${mainDebit ? number(mainDebit) : '-'}</td><td>${mainCredit ? number(mainCredit) : '-'}</td><td>${bs(toBs(mainDebit || mainCredit, data.currency || 'VES', rowRate))}</td></tr>
        <tr><td>${escapeHtml(data.counterAccount || '-')}</td><td>${counterDebit ? number(counterDebit) : '-'}</td><td>${counterCredit ? number(counterCredit) : '-'}</td><td>${bs(toBs(counterDebit || counterCredit, data.currency || 'VES', rowRate))}</td></tr>
      </tbody></table>`;
    };

    document.getElementById('btnSyncLedger')?.addEventListener('click', () => SupabaseSyncService.pullLedger({ Store, Toast, force:true, silent:false }));
    document.getElementById('btnDownloadLedgerCsv')?.addEventListener('click', () => downloadText(`libro-diario-${today()}.csv`, csvFromEntries(Store.get().ledger.entries, Store.get().bcv.rate), 'text/csv;charset=utf-8'));
    document.getElementById('btnPrintLedgerBook')?.addEventListener('click', () => {
      const win = window.open('', '_blank', 'noopener,noreferrer');
      if (!win) return Toast.show('Permite ventanas emergentes para imprimir el libro.', 'warning');
      win.document.write(htmlBook(Store.get()));
      win.document.close();
      setTimeout(() => win.print(), 250);
    });
    document.getElementById('btnLedgerCounterpart')?.addEventListener('click', refreshPreview);
    document.getElementById('ledgerForm')?.addEventListener('input', refreshPreview);
    document.getElementById('btnLedgerTemplateSale')?.addEventListener('click', () => {
      const btn = document.querySelector('[data-ledger-template="saleVat"]');
      btn?.click();
    });
    qsa('[data-ledger-template]').forEach((button) => button.addEventListener('click', () => {
      const template = templates.find((item) => item.id === button.dataset.ledgerTemplate);
      const form = document.getElementById('ledgerForm');
      if (!template || !form) return;
      form.querySelector('[name="account"]').value = template.debitAccount;
      form.querySelector('[name="counterAccount"]').value = template.creditAccount;
      form.querySelector('[name="description"]').value = template.description;
      form.querySelector('[name="headerText"]').value = template.description;
      form.querySelector('[name="side"]').value = 'debit';
      refreshPreview();
      Toast.show(`Plantilla aplicada: ${template.label}`, 'success');
    }));

    mountSubmit('#ledgerForm', async (data, form) => {
      const amount = normalizeAmount(data.amount);
      if (!amount) return Toast.show('Indica un monto mayor a cero.', 'warning');
      if (!data.account || !data.counterAccount) return Toast.show('Selecciona cuenta principal y contrapartida.', 'warning');
      if (data.account === data.counterAccount) return Toast.show('La cuenta principal y la contrapartida no pueden ser iguales.', 'warning');
      const rowRate = normalizeAmount(data.rate || Store.get().bcv.rate || 0);
      const docNo = data.docNo || uid('doc');
      const base = {
        date: data.date || today(),
        docNo,
        docType: data.docType || 'SA',
        reference: data.reference || '',
        headerText: data.headerText || data.description || '',
        currency: data.currency || 'VES',
        rate: rowRate,
        source: 'local'
      };
      const lineA = {
        id: uid('entry'), ...base, lineNo: 1, account: data.account, description: data.description,
        debit: data.side === 'debit' ? amount : 0,
        credit: data.side === 'credit' ? amount : 0
      };
      const lineB = {
        id: uid('entry'), ...base, lineNo: 2, account: data.counterAccount, description: `Contrapartida: ${data.description}`,
        debit: data.side === 'credit' ? amount : 0,
        credit: data.side === 'debit' ? amount : 0
      };
      try {
        const savedA = await SupabaseSyncService.createLedgerEntry(lineA);
        const savedB = await SupabaseSyncService.createLedgerEntry(lineB);
        Store.update((draft) => { draft.ledger.entries = [savedB, savedA, ...(draft.ledger.entries || [])]; });
        Toast.show('Documento contable guardado en Supabase.', 'success');
      } catch (error) {
        Store.update((draft) => {
          draft.ledger.entries = [lineB, lineA, ...(draft.ledger.entries || [])];
          draft.auditLog.unshift({ id:uid('log'), module:'ledger', action:'create-balanced-document-local', at:new Date().toISOString(), docNo });
        });
        Toast.show(`Documento balanceado guardado localmente. Backend: ${error.message}`, 'warning');
      }
      form.reset();
      form.querySelector('[name="date"]').value = today();
      form.querySelector('[name="docNo"]').value = `DI-${new Date().getFullYear()}-${String((Store.get().ledger.entries || []).length + 1).padStart(4, '0')}`;
      form.querySelector('[name="rate"]').value = String(Store.get().bcv?.rate || 0);
      refreshPreview();
    });
    qsa('[data-delete-ledger]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.ledger.entries = draft.ledger.entries.filter((entry) => entry.id !== button.dataset.deleteLedger); })));
    refreshPreview();
  }
};
