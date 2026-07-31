import { PageHeader, Field, Textarea, Button, Table, Badge } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { isValidRif } from '../core/validators.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

export const ClientsPage = {
  render(state) {
    const clients = state.clients || [];
    const rows = clients.map((client) => `<tr>
      <td>${escapeHtml(client.name)}</td><td>${escapeHtml(client.rif)} ${isValidRif(client.rif) ? Badge('OK','success') : Badge('Revisar','warning')}</td>
      <td>${escapeHtml(client.email)}</td><td>${escapeHtml(client.phone)}</td><td>${escapeHtml(client.type)}</td>
      <td>${client.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning')}</td>
      <td class="cg-actions-cell"><div class="cg-row-actions"><button class="btn btn-secondary !p-2" type="button" data-load-client="${client.id}" aria-label="Cargar cliente al cotizador"><i class="fa-solid fa-file-invoice-dollar"></i></button><button class="btn btn-danger !p-2" type="button" data-delete-client="${client.id}" aria-label="Eliminar cliente"><i class="fa-solid fa-trash"></i></button></div></td>
    </tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">
      ${PageHeader({ eyebrowKey:'clientsEyebrow', titleKey:'clientsTitle', descKey:'clientsDesc', actions: Button({ id:'btnSyncClients', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' }) })}
      <form id="clientForm" class="panel-soft cg-record-form rounded-[1.5rem] p-4"><div class="cg-record-fields">
        ${Field({ labelKey:'name', name:'name', required:true })}${Field({ labelKey:'rif', name:'rif', required:true })}${Field({ labelKey:'email', name:'email', type:'email' })}${Field({ labelKey:'phone', name:'phone' })}${Field({ labelKey:'type', name:'type', value:'Contribuyente ordinario' })}${Textarea({ labelKey:'address', name:'address', className:'cg-field-wide' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar cliente', icon:'fa-user-plus', type:'submit' })}</div></form>
      <div class="panel-soft cg-record-table rounded-[1.5rem] p-4">${Table({ headers:[{key:'name'}, {key:'rif'}, {key:'email'}, {key:'phone'}, {key:'type'}, {label:'Persistencia'}, {key:'actions'}], rows })}</div>
    </section>`;
  },
  mount(state, { Store, Toast, navigate, Modal, SupabaseSyncService }) {
    document.getElementById('btnSyncClients')?.addEventListener('click', () => SupabaseSyncService.pullClients({ Store, Toast, force:true, silent:false }));
    mountSubmit('#clientForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"], [data-mui-button-fallback]');
      submit?.setAttribute('disabled', 'disabled');
      try {
        if (!isValidRif(data.rif)) throw new Error('El RIF no tiene un formato válido.');
        const saved = await SupabaseSyncService.createClient(data);
        Store.update((draft) => { draft.clients = [saved, ...(draft.clients || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Cliente guardado en el servidor.', 'success');
      } catch (error) {
        const decision = RuntimePolicy.handlePersistenceFailure(error, 'el cliente');
        if (decision.allowFallback) {
          Store.update((draft) => { draft.clients.unshift({ id:uid('cli'), ...data, source:'local' }); });
          Toast.show(`Cliente guardado solo para desarrollo. ${decision.message}`, 'warning');
        } else Toast.show(decision.message, 'error');
      } finally { submit?.removeAttribute('disabled'); }
    });
    qsa('[data-load-client]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { draft.quote.clientId = button.dataset.loadClient; });
      Toast.show('Cliente cargado al cotizador.', 'success');
      navigate('cotizacion');
    }));
    qsa('[data-delete-client]').forEach((button) => button.addEventListener('click', () => Modal.confirm({
      title:'Eliminar cliente', body:'La eliminación se confirmará en el servidor antes de retirar el registro de la interfaz.',
      onConfirm: async () => {
        try {
          await SupabaseSyncService.deleteClient(button.dataset.deleteClient);
          Store.update((draft) => { draft.clients = draft.clients.filter((client) => client.id !== button.dataset.deleteClient); });
          Toast.show('Cliente eliminado del servidor.', 'success');
        } catch (error) { Toast.show(`No se eliminó el cliente: ${error.message}`, 'error'); }
      }
    })));
  }
};
