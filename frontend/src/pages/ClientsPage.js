import { PageHeader, Field, Textarea, Button, Badge, ErpButton, ErpDataTable, ErpRow, ErpSection } from '../components/ui/index.js';
import { escapeHtml, mountSubmit, qsa } from '../utils/dom.js';
import { isValidRif } from '../core/validators.js';
import { BackendApi } from '../services/backendApi.js';
import { checkClientRegistrationBeforeSave } from '../services/clientRegistrationPreflight.mjs';
import { createCrmLeadService } from '../services/crmLeadService.mjs';

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

    const prospectForm = `<form id="crmLeadForm" class="cg-record-form"><div class="cg-record-fields">
      ${Field({labelKey:'Nombre del prospecto',name:'name',required:true})}${Field({labelKey:'RIF del prospecto',name:'rif',placeholder:'J-12345678-9'})}${Field({labelKey:'Correo',name:'email',type:'email',placeholder:'contacto@empresa.com'})}${Field({labelKey:'Teléfono',name:'phone'})}${Textarea({labelKey:'Notas comerciales',name:'notes',className:'cg-field-wide'})}
      </div><p id="crmLeadStatus" role="status" aria-live="polite" class="cg-ui-muted">Los prospectos se guardan en el servidor sin convertirse automáticamente en clientes.</p><div class="cg-record-actions">${Button({text:'Registrar prospecto',icon:'fa-user-plus',type:'submit'})}${Button({id:'crmLeadRefresh',text:'Actualizar prospectos',icon:'fa-rotate',type:'button',variant:'secondary'})}</div></form>`;
    const prospectPanel = `${ErpSection({title:'Prospectos CRM',description:'Alta y seguimiento inicial de interesados. Solo el servidor mantiene estos datos.',content:prospectForm})}${ErpSection({title:'Últimos prospectos',description:'Listado real consultado al CRM, independiente del directorio de clientes.',content:'<div id="crmLeadResults" role="region" aria-live="polite" aria-label="Listado de prospectos"><p class="cg-ui-muted">Cargando prospectos…</p></div>'})}`;

    const form = `<form id="clientForm" class="cg-record-form"><div class="cg-record-fields">
      ${Field({ labelKey:'name', name:'name', required:true })}${Field({ labelKey:'rif', name:'rif', required:true })}${Field({ labelKey:'email', name:'email', type:'email' })}${Field({ labelKey:'phone', name:'phone' })}${Field({ labelKey:'type', name:'type', value:'Contribuyente ordinario' })}${Textarea({ labelKey:'address', name:'address', className:'cg-field-wide' })}
      </div><p id="clientPreflightFeedback" role="status" aria-live="polite" class="cg-ui-muted">La identidad fiscal se verificará con el servidor antes de registrar.</p><div class="cg-record-actions">${Button({ text:'Registrar cliente', icon:'fa-user-plus', type:'submit' })}</div></form>`;

    return `<section class="cg-page-stack">${PageHeader({
      eyebrowKey:'clientsEyebrow',
      titleKey:'clientsTitle',
      descKey:'clientsDesc',
      actions:Button({ id:'btnSyncClients', text:'Sincronizar', icon:'fa-cloud-arrow-down', variant:'secondary', attrs:'type="button"' })
    })}${prospectPanel}${ErpSection({ title:'Registrar cliente', description:'Datos comerciales y fiscales utilizados por cotizaciones y documentos.', content:form })}${ErpSection({ title:'Directorio de clientes', description:'Persistencia, validación fiscal y acciones operativas.', content:table })}</section>`;
  },
  mount(state, { Store, Toast, navigate, Modal, SupabaseSyncService }) {
    const crmLeads = createCrmLeadService({api:BackendApi});
    const status = document.getElementById('crmLeadStatus');
    const results = document.getElementById('crmLeadResults');
    let loadedCrmLeads = [];
    let stageRequestInFlight = false;
    const refreshCrmLeads = async () => {
      loadedCrmLeads = [];
      if (!results) return;
      results.textContent = 'Cargando prospectos…';
      try {
        const rows = await crmLeads.list();
        loadedCrmLeads = rows;
        if (!rows.length) {
          results.textContent = 'Todavía no hay prospectos registrados para esta empresa.';
          return;
        }
        results.innerHTML = ErpDataTable({
          caption:'Prospectos comerciales',
          columns:[
            {key:'name',label:'Prospecto',render:(lead)=>safe(lead.name)},
            {key:'stage',label:'Etapa',render:(lead)=>safe(lead.stage||'new')},
            {key:'email',label:'Correo',render:(lead)=>safe(lead.email)},
            {key:'phone',label:'Teléfono',render:(lead)=>safe(lead.phone)},
            {key:'createdAt',label:'Registrado',render:(lead)=>safe(lead.createdAt?new Date(lead.createdAt).toLocaleDateString('es-VE'):'')},
            {key:'actions',label:'Etapa',render:(lead)=>{
              if (lead.stage === 'lost') return Badge('Descartado','neutral');
              const actions=[];
              if (lead.stage === 'new') actions.push(ErpButton('Calificar',{
                variant:'secondary',data:{'crm-stage-id':lead.id,'crm-next-stage':'qualified'}
              }));
              if (lead.stage === 'new' || lead.stage === 'qualified') actions.push(ErpButton('Descartar',{
                variant:'danger',data:{'crm-stage-id':lead.id,'crm-next-stage':'lost'}
              }));
              return actions.length ? ErpRow(actions.join(''),{wrap:true}) : Badge('Sin acciones','neutral');
            }}
          ],rows
        });
      } catch (_error) {
        results.textContent = 'No se pudieron consultar los prospectos. Comprueba tu sesión y vuelve a intentar.';
      }
    };
    results?.addEventListener('click',async(event)=>{
      const button=event.target?.closest?.('[data-crm-stage-id]');
      if (!button || stageRequestInFlight) return;
      const lead=loadedCrmLeads.find(item=>item.id===button.dataset.crmStageId);
      if (!lead) return;
      stageRequestInFlight=true;
      button.setAttribute('disabled','disabled');
      if (status) status.textContent='Actualizando etapa del prospecto…';
      try {
        await crmLeads.changeStage(lead,button.dataset.crmNextStage);
        if (status) status.textContent='La nueva etapa quedó guardada y auditada.';
        Toast.show('Etapa de prospecto actualizada.', 'success');
      } catch (error) {
        const concurrent=error?.status===409;
        if (status) status.textContent=concurrent
          ? 'Otro usuario actualizó el prospecto. El listado se volverá a consultar.'
          : 'No se confirmó el cambio de etapa. No se realizaron cambios locales.';
        Toast.show('No se pudo confirmar la etapa. Revisa el listado actualizado.', 'warning');
      } finally {
        button.removeAttribute('disabled');
        stageRequestInFlight=false;
        await refreshCrmLeads();
      }
    });
    document.getElementById('crmLeadRefresh')?.addEventListener('click',()=>{void refreshCrmLeads()});
    mountSubmit('#crmLeadForm', async (data, form) => {
      const submit = form.querySelector('button[type="submit"]');
      if (submit?.disabled) return;
      submit?.setAttribute('disabled','disabled');
      if (status) status.textContent = 'Registrando prospecto con identidad verificada por el servidor…';
      try {
        await crmLeads.create(data);
        if (status) status.textContent = 'Prospecto registrado. Puedes consultarlo en el listado.';
        Toast.show('Prospecto guardado en CRM.', 'success');
        form.reset();
        await refreshCrmLeads();
      } catch (error) {
        // The attempted UUID is preserved for the same form values on retry;
        // never create a local Lead after an ambiguous server/network error.
        if (status) status.textContent = error?.status === 409
          ? 'La solicitud ya fue procesada. Actualiza el listado antes de repetir.'
          : 'No se confirmó el registro. Revisa la conexión; no se guardó un prospecto local.';
        Toast.show('No se confirmó el registro del prospecto.', 'warning');
      } finally { submit?.removeAttribute('disabled'); }
    });
    void refreshCrmLeads();
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
