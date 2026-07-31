import { PageHeader, Field, Select, Button, Table, Badge, StatCard } from '../components/ui/index.js';
import { bs, shortDate } from '../core/formatters.js';
import { escapeHtml, mountSubmit, qsa, uid, today } from '../utils/dom.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

const actionCell = (sale) => `<div class="cg-row-actions">
  <button class="btn btn-secondary !p-2" type="button" data-send-quote="${sale.id}" aria-label="Cargar venta al cotizador"><i class="fa-solid fa-file-invoice-dollar"></i></button>
  <button class="btn btn-danger !p-2" type="button" data-delete-sale="${sale.id}" aria-label="Eliminar venta"><i class="fa-solid fa-trash"></i></button>
</div>`;

export const SalesPage = {
  render(state) {
    const sales = state.sales || [];
    const total = sales.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = sales.filter((item) => String(item.status).toLowerCase().includes('pend')).length;
    const clientOptions = [{ value:'', label:'Consumidor final / sin cliente' }, ...(state.clients || []).map((client) => ({ value:client.id, label:`${client.name} · ${client.rif}` }))];
    const rows = sales.map((sale) => `<tr>
      <td class="cg-cell-strong">${escapeHtml(sale.invoice || sale.id)}</td>
      <td>${shortDate(sale.date)}</td>
      <td>${escapeHtml(sale.client)}</td>
      <td class="cg-cell-money">${bs(sale.amount)}</td>
      <td>${escapeHtml(sale.method || 'VES')}</td>
      <td>${Badge(sale.status, sale.status === 'Cobrada' ? 'success' : 'warning')}</td>
      <td>${sale.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning')}</td>
      <td class="cg-actions-cell">${actionCell(sale)}</td>
    </tr>`);

    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({
        eyebrowKey:'salesEyebrow',
        titleKey:'salesTitle',
        descKey:'salesDesc',
        actions: Button({ id:'btnNewSaleFocus', text:'Nueva venta', icon:'fa-plus', attrs:'type="button"' }) + Button({ id:'btnSyncSales', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
      })}
      <div class="mb-5 grid gap-4 md:grid-cols-4">
        ${StatCard({label:'Ventas del período', value:bs(total), hint:'Fuente autoritativa al sincronizar', icon:'fa-cash-register'})}
        ${StatCard({label:'Documentos', value:String(sales.length), hint:`${pending} pendientes`, icon:'fa-cart-shopping', tone:'accent'})}
        ${StatCard({label:'Cobranza pendiente', value:bs(sales.filter((item)=>item.status!=='Cobrada').reduce((sum,item)=>sum+Number(item.amount||0),0)), icon:'fa-clock'})}
        ${StatCard({label:'Ticket promedio', value:bs(total / Math.max(sales.length, 1)), icon:'fa-chart-line'})}
      </div>
      <form id="saleForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4">
        <div class="cg-record-fields cg-fields-compact">
          ${Field({ labelKey:'date', name:'date', type:'date', value:today() })}
          ${Field({ labelKey:'invoice', name:'invoice', value:`FAC-${new Date().getFullYear()}-${String(sales.length + 1).padStart(3,'0')}` })}
          ${Select({ labelKey:'client', name:'clientId', options:clientOptions })}
          ${Field({ labelKey:'client', name:'client', placeholder:'Nombre libre si no está registrado' })}
          ${Field({ labelKey:'amount', name:'amount', type:'number', attrs:'step="0.01" min="0"', value:'0' })}
          ${Select({ labelKey:'status', name:'status', options:[{value:'Cobrada',label:'Cobrada'}, {value:'Pendiente',label:'Pendiente'}, {value:'Anulada',label:'Anulada'}] })}
          ${Select({ labelKey:'method', name:'method', options:[{value:'Transferencia',label:'Transferencia'}, {value:'Punto',label:'Punto'}, {value:'Efectivo',label:'Efectivo'}, {value:'Crédito',label:'Crédito'}] })}
        </div>
        <div class="cg-record-actions">${Button({ text:'Registrar venta', icon:'fa-cash-register', type:'submit' })}</div>
      </form>
      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">
        ${Table({ headers:[{key:'invoice'}, {key:'date'}, {key:'client'}, {key:'amount'}, {key:'method'}, {key:'status'}, {label:'Persistencia'}, {key:'actions'}], rows })}
      </div>
    </section>`;
  },
  mount(state, { Store, Toast, navigate, SupabaseSyncService }) {
    document.getElementById('btnSyncSales')?.addEventListener('click', () => SupabaseSyncService.pullSales({ Store, Toast, force:true, silent:false }));
    document.getElementById('btnNewSaleFocus')?.addEventListener('click', () => document.querySelector('#saleForm input[name="client"]')?.focus());
    mountSubmit('#saleForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        const client = (Store.get().clients || []).find((item) => item.id === data.clientId);
        const saved = await SupabaseSyncService.createSale({ ...data, client: data.client || client?.name || 'Consumidor final' });
        Store.update((draft) => { draft.sales = [saved, ...(draft.sales || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Venta guardada y contabilizada en el servidor.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'la venta');
        if (decision.allowFallback) {
          Store.update((draft) => {
            draft.sales = draft.sales || [];
            draft.sales.unshift({ id:uid('sale'), ...data, amount:Number(data.amount||0), source:'local' });
            draft.auditLog.unshift({ id:uid('log'), module:'sales', action:'create-sale-development-fallback', at:new Date().toISOString() });
          });
          Toast.show(`Venta guardada solo para desarrollo. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-delete-sale]').forEach((button) => button.addEventListener('click', () => Store.update((draft) => { draft.sales = (draft.sales || []).filter((item) => item.id !== button.dataset.deleteSale); })));
    qsa('[data-send-quote]').forEach((button) => button.addEventListener('click', () => {
      const sale = (state.sales || []).find((item) => item.id === button.dataset.sendQuote);
      if (!sale) return;
      Store.update((draft) => { draft.quote.manualAmount = sale.amount; draft.quote.observation = `Generado desde venta ${sale.invoice}`; });
      Toast.show('Venta cargada al cotizador.', 'success');
      navigate('cotizacion');
    }));
  }
};
