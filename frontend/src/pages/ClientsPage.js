import { PageHeader, Field, Textarea, Button, Badge, ErpButton, ErpDataTable, ErpRow, ErpSection } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa, uid } from '../utils/dom.js';
import { isValidRif } from '../core/validators.js';
import { RuntimePolicy } from '../services/runtimePolicy.js';

const safe = (value) => escapeHtml(String(value ?? ''));

export const ClientsPage = {
  render(state) {
    const clients = state.clients || [];
    const table = ErpDataTable({
      caption:'Directorio de clientes',
      columns:[
        { key:'name', label:'Nombre', render:(client) => safe(client.name) },
        { key:'rif', label:'RIF', render:(client) => `${safe(client.rif)} ${isValidRif(client.rif) ? Badge('OK','success') : Badge('Revisar','warning')}` },
        { key:'email', label:'Email', render:(client) => safe(client.email) },
        { key:'phone', label:'Teléfono', render:(client) => safe(client.phone) },
        { key:'type', label:'Tipo', render:(client) => safe(client.type) },
        { key:'source', label:'Persistencia', render:(client) => client.source === 'supabase' ? Badge('Servidor','success') : Badge('Solo desarrollo','warning') },
        { key:'actions', label:'Acciones', render:(client) => ErpRow(
          ErpButton('Cargar cliente al cotizador', { variant:'secondary', icon:'fa-solid fa-file-invoice-dollar', iconOnly:true, data:{ 'load-client':client.id } })
          + ErpButton('Eliminar cliente', { variant:'danger', icon:'fa-solid fa-trash', iconOnly:true, data:{ 'delete-client':client.id } }),
          { wrap:true }
        ) }
      ],
      rows:clients
    });

    const form = `<form id="clientForm" class="cg-record-form"><div class="cg-record-fields">
      ${Field({ labelKey:'name', name:'name', required:true })}${Field({ labelKey:'rif', name:'rif', required:true })}${Field({ labelKey:'email', name:'email', type:'email' })}${Field({ labelKey:'phone', name:'phone' })}${Field({ labelKey:'type', name:'type', value:'Contribuyente ordinario' })}${Textarea({ labelKey:'address', name:'address', className:'cg-field-wide' })}
      </div><div class="cg-record-actions">${Button({ text:'Registrar cliente', icon:'fa-user-plus', type:'submit' })}</div></form>`;

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'clientsEyebrow',
      titleKey:'clientsTitle',
      descKey:'clientsDesc',
      actions:Button({ id:'btnSyncClients', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${ErpSection({ title:'Registrar cliente', description:'Datos comerciales y fiscales utilizados por cotizaciones y documentos.', content:form })}${ErpSection({ title:'Directorio de clientes', description:'Persistencia, validación fiscal y acciones operativas.', content:table })}</section>`;
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
