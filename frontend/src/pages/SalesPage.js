import { PageHeader, Field, Select, Button, Badge, MetricGrid, ErpButton, ErpDataTable, ErpRow, ErpSection } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';
import { t } from '../i18n/useTranslate.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const SalesPage = {
  render(state) {
    const lang = state.settings?.lang || 'es';
    const sales = state.sales || [];
    const total = sales.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = sales.filter((item) => String(item.status).toLowerCase().includes('pend')).length;
    const pendingAmount = sales.filter((item) => item.status !== 'Cobrada' && item.status !== 'Anulada').reduce((sum,item)=>sum+Number(item.amount||0),0);
    const clientOptions = [{ value:'', label:'Consumidor final / sin cliente' }, ...(state.clients || []).map((client) => ({ value:client.id, label:`${client.name} · ${client.rif}` }))];

    const table = ErpDataTable({
      caption:'Ventas registradas',
      columns:[
        { key:'invoice', label:t('invoice',lang), render:(sale)=>safe(sale.invoice || sale.id) },
        { key:'date', label:t('date',lang), render:(sale)=>safe(shortDate(sale.date)) },
        { key:'client', label:t('client',lang), render:(sale)=>safe(sale.client) },
        { key:'amount', label:t('amount',lang), numeric:true, render:(sale)=>safe(bs(sale.amount)) },
        { key:'method', label:t('method',lang), render:(sale)=>safe(sale.method || 'VES') },
        { key:'status', label:t('status',lang), render:(sale)=>Badge(sale.status, sale.status === 'Cobrada' ? 'success' : sale.status === 'Anulada' ? 'danger' : 'warning') },
        { key:'source', label:t('sync',lang), render:(sale)=>sale.source === 'supabase' ? Badge(t('synced',lang),'success') : Badge(t('pendingSync',lang),'warning') },
        { key:'actions', label:t('actions',lang), render:(sale)=>ErpRow(
          ErpButton('Cargar venta al cotizador', { variant:'secondary', icon:'fa-solid fa-file-invoice-dollar', iconOnly:true, data:{ 'send-quote':sale.id } }),
          { wrap:true }
        ) }
      ],
      rows:sales
    });

    const form = `<form id="saleForm" class="cg-record-form"><div class="cg-record-fields cg-fields-compact">
      ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}
      ${Field({ labelKey:'invoice', name:'invoice', value:`FAC-${new Date().getFullYear()}-${String(sales.length + 1).padStart(3,'0')}` })}
      ${Select({ labelKey:'client', name:'clientId', options:clientOptions })}
      ${Field({ labelKey:'client', name:'client', placeholder:'Nombre libre si no está registrado' })}
      ${Field({ labelKey:'amount', name:'amount', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
      ${Select({ labelKey:'status', name:'status', options:[{value:'Cobrada',label:'Cobrada'}, {value:'Pendiente',label:t('pending',lang)}, {value:'Borrador',label:'Borrador'}] })}
      ${Select({ labelKey:'method', name:'method', options:[{value:'Transferencia',label:'Transferencia'}, {value:'Punto',label:'Punto'}, {value:'Efectivo',label:'Efectivo'}, {value:'Crédito',label:'Crédito'}] })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar venta', icon:'fa-cash-register', type:'submit' })}</div></form>`;

    return `<section class="cg-page-stack cg-sales-workspace">${PageHeader({
      eyebrowKey:'salesEyebrow', titleKey:'salesTitle', descKey:'salesDesc',
      actions:Button({ id:'btnNewSaleFocus', text:'Nueva venta', icon:'fa-plus', attrs:'type="button"' })
        + Button({ id:'btnSyncSales', text:t('sync',lang), icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${MetricGrid([
      { label:'Ventas del período', value:bs(total), hint:`${sales.length} documentos`, iconName:'fa-cash-register', tone:'success' },
      { label:'Documentos pendientes', value:String(pending), hint:t('pending',lang), iconName:'fa-clock', tone:pending?'warning':'success' },
      { label:'Cobranza pendiente', value:bs(pendingAmount), iconName:'fa-wallet', tone:pendingAmount?'warning':'success' },
      { label:'Ticket promedio', value:bs(total / Math.max(sales.length, 1)), iconName:'fa-chart-line', tone:'brand' }
    ])}${ErpSection({ title:'Registrar venta', description:'Captura el documento comercial. Una venta registrada no se elimina desde la interfaz; las anulaciones deben conservar trazabilidad contable y de auditoría.', content:form })}${ErpSection({ title:'Ventas registradas', description:'Estado de cobro, sincronización y acciones seguras disponibles.', content:table })}</section>`;
  },
  mount(state, { Store, Toast, navigate, SupabaseSyncService }) {
    document.getElementById('btnSyncSales')?.addEventListener('click', () => SupabaseSyncService.pullSales({ Store, Toast, force:true, silent:false }));
    document.getElementById('btnNewSaleFocus')?.addEventListener('click', () => document.querySelector('#saleForm input[name="client"]')?.focus());
    mountSubmit('#saleForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const client = (Store.get().clients || []).find((item) => item.id === data.clientId);
        const saved = await SupabaseSyncService.createSale({ ...data, client:data.client || client?.name || 'Consumidor final' });
        Store.update((draft) => { draft.sales = [saved, ...(draft.sales || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Venta guardada y contabilizada.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'la venta');
        if (decision.allowFallback) {
          Store.update((draft) => {
            draft.sales = draft.sales || [];
            draft.sales.unshift({ id:uid('sale'), ...data, amount:Number(data.amount||0), source:'local' });
            draft.auditLog.unshift({ id:uid('log'), module:'sales', action:'create-sale-offline-fallback', at:new Date().toISOString() });
          });
          Toast.show(`Venta guardada localmente; la sincronización está pendiente. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-send-quote]').forEach((button) => button.addEventListener('click', () => {
      const sale = (state.sales || []).find((item) => item.id === button.dataset.sendQuote);
      if (!sale) return;
      Store.update((draft) => { draft.quote.manualAmount = sale.amount; draft.quote.observation = `Generado desde venta ${sale.invoice}`; });
      Toast.show('Venta cargada al cotizador.', 'success');
      navigate('cotizacion');
    }));
  }
};
