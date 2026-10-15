import { PageHeader, Field, Textarea, Button, Badge, ErpButton, ErpDataTable, ErpRow, ErpSection } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa } from '../utils/dom.js';
import { isValidRif } from '../core/validators.js';
import { BackendApi } from '../services/backendApi.js';
import { checkClientRegistrationBeforeSave } from '../services/clientRegistrationPreflight.mjs';

const safe = (value) => escapeHtml(String(value ?? ''));

export const ClientsPage = {
  render(state) {
    const clients = state.clients || [];
    const table = ErpDataTable({
      caption:'Directorio de clientes',
      columns:[
        { key:'name', label:'Nombre', render:(client) => safe(client.name) },
        { key:'rif', label:'RIF', render:(client) => `<span class="cg-inline-pair"><span class="cg-ui-code">${safe(client.rif)}</span>${isValidRif(client.rif) ? Badge('OK','success') : Badge('Revisar','warning')}</span>` },
        { key:'email', label:'Email', render:(client) => safe(client.email) },
        { key:'phone', label:'Teléfono', render:(client) => safe(client.phone) },
        { key:'type', label:'Tipo', render:(client) => safe(client.type) },
        { key:'source', label:'Persistencia', render:(client) => client.source === 'supabase' ? Badge('Sincronizado','success') : Badge('Pendiente de sincronización','warning') },
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
      </div><p id="clientPreflightFeedback" role="status" aria-live="polite" class="cg-ui-muted">La identidad fiscal se verificará con el servidor antes de registrar.</p><div class="cg-record-actions">${Button({ text:'Registrar cliente', icon:'fa-user-plus', type:'submit' })}</div></form>`;

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
      const feedback = document.getElementById('clientPreflightFeedback');
      try {
        if (!isValidRif(data.rif)) throw new Error('El RIF no tiene un formato válido.');
        // No local cache or client-side duplicate authority: signed cookie/CSRF
        // go through the canonical BackendApi and tenant/RBAC server endpoint.
        if (feedback) feedback.textContent = 'Verificando identidad fiscal…';
        const verdict = await checkClientRegistrationBeforeSave(data, (path, payload) => BackendApi.post(path, payload));
        if (feedback) feedback.textContent = verdict.message;
        if (!verdict.maySubmit) {
          Toast.show(verdict.message, 'warning');
          return;
        }
        // REVIEW_NEW is advisory only; the canonical create API still owns
        // DB uniqueness, authorization and final race/conflict handling.
        const saved = await SupabaseSyncService.createClient(data);
        Store.update((draft) => { draft.clients = [saved, ...(draft.clients || []).filter((item) => item.id !== saved.id)]; });
        form.reset();
        Toast.show('Cliente guardado y sincronizado.', 'success');
      } catch (_error) {
        // Never create an unsynchronized local Client after a failed server
        // write: it could collide with a committed canonical Client on retry.
        if (feedback) feedback.textContent = 'No se guardó el cliente. Revisa la conexión y vuelve a verificarlo.';
        Toast.show('No se creó el cliente. Revisa la conexión o el conflicto en el servidor.', 'error');
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
