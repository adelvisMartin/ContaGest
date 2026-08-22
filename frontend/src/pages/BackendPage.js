import { PageHeader, MetricGrid, Section, Field, Button, Badge } from '../components/ui/index.js';
import { BackendApi } from '../services/backendApi.js';
import { BcvService } from '../services/bcvService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));

export const BackendPage = {
  render() {
    const tenantId=BackendApi.tenantId || '';
    const sameOrigin=BackendApi.baseUrl === '/api/v1';
    return `<section class="cg-page-stack">
      ${PageHeader({
        eyebrow:'Administración · Integraciones',
        title:'Backend e integraciones',
        description:'Diagnóstico de la API y del tenant firmado en la sesión. El navegador no puede cambiar el tenant ni almacenar secretos del servidor.',
        actions:`${Button({id:'btnBackendHealth',text:'Probar API',icon:'fa-heart-pulse',variant:'primary'})}${Button({id:'btnBackendDb',text:'Probar DB',icon:'fa-database',variant:'secondary'})}${Button({id:'btnSyncCoreSupabase',text:'Sincronizar módulos',icon:'fa-cloud-arrow-down',variant:'secondary'})}${Button({id:'btnBackendBcv',text:'Probar BCV',icon:'fa-money-bill-transfer',variant:'secondary'})}`
      })}
      ${MetricGrid([
        {label:'API',value:sameOrigin?'Mismo origen':'Personalizada',hint:safe(BackendApi.baseUrl),iconName:'fa-server',tone:'brand'},
        {label:'Tenant de sesión',value:tenantId?'Asignado':'Sin sesión',hint:tenantId?safe(tenantId):'Se obtiene del login; no es editable',iconName:'fa-building-shield',tone:tenantId?'success':'warning'},
        {label:'Autenticación',value:BackendApi.isReady?'Activa':'Pendiente',hint:'Cookie HttpOnly + CSRF en mutaciones',iconName:'fa-shield-halved',tone:BackendApi.isReady?'success':'warning'},
        {label:'BCV',value:'Diagnóstico',hint:'Fuente y fallback se resuelven por servicio',iconName:'fa-landmark',tone:'neutral'}
      ])}
      ${Section({
        title:'Endpoint de desarrollo',
        subtitle:'En producción se recomienda /api/v1 del mismo origen. Esta preferencia nunca modifica el tenant autenticado.',
        children:`<form id="backendConfigForm" class="cg-record-form"><div class="cg-record-fields">${Field({labelKey:'API Base URL',name:'apiBase',value:BackendApi.baseUrl,required:true})}</div><div class="cg-record-actions">${Button({text:'Guardar endpoint',icon:'fa-floppy-disk',type:'submit'})}</div></form>`
      })}
      ${Section({
        title:'Contrato de seguridad',
        subtitle:'La identidad empresarial se deriva exclusivamente de la sesión autorizada.',
        children:`<div class="cg-ui-stack cg-ui-gap-sm"><p>${Badge('Tenant no editable','success')} El frontend no envía un tenant arbitrario para elevar o cambiar alcance.</p><p>${Badge('Secretos server-only','success')} Claves privadas, service-role, credenciales de correo y proveedores permanecen fuera del navegador.</p><p>${Badge('Sesión + RBAC','success')} Cada operación debe validar tenant, rol/licencia y autorización en backend.</p></div>`
      })}
    </section>`;
  },
  mount(_state, { Toast, Store, SupabaseSyncService }) {
    document.getElementById('backendConfigForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data=Object.fromEntries(new FormData(event.currentTarget));
      BackendApi.setBaseUrl(data.apiBase);
      Toast.show('Endpoint de API guardado. El tenant continúa ligado a la sesión.', 'success');
    });
    document.getElementById('btnBackendDb')?.addEventListener('click', async () => {
      try { const result=await BackendApi.request('/health/db'); Toast.show(`DB operativa: ${JSON.stringify(result.database?.[0] || result.database || {})}`, 'success'); }
      catch (error) { Toast.show(error.message, 'error'); }
    });
    document.getElementById('btnBackendHealth')?.addEventListener('click', async () => {
      try { const health=await BackendApi.health(); Toast.show(`Backend operativo: ${health.service || health.mode || 'API'}`, 'success'); }
      catch (error) { Toast.show(error.message, 'error'); }
    });
    document.getElementById('btnSyncCoreSupabase')?.addEventListener('click', async () => {
      try { await SupabaseSyncService.syncCore({Store,Toast,force:true,silent:false}); Toast.show('Módulos principales sincronizados.', 'success'); }
      catch (error) { Toast.show(error.message, 'error'); }
    });
    document.getElementById('btnBackendBcv')?.addEventListener('click', async () => {
      try { const result=await BcvService.fetchRate({allowStale:true}); Toast.show(`BCV: Bs. ${result.rate} · ${result.source}`, result.stale?'warning':'success'); }
      catch (error) { Toast.show(error.message, 'error'); }
    });
  }
};
