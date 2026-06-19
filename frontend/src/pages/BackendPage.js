import { DS } from '../components/ui/index.js';
import { BackendApi } from '../services/backendApi.js';
import { SupabaseConfig } from '../services/supabaseClient.js';
import { BcvService } from '../services/bcvService.js';

export const BackendPage = {
  render() {
    const supa = SupabaseConfig.get();
    const kpis = [
      { label:'API base', value: BackendApi.baseUrl, sub:'URL usada por el frontend', iconName:'api' },
      { label:'Tenant activo', value: BackendApi.tenantId || 'No configurado', sub:'x-tenant-id para requests', tone: BackendApi.tenantId ? 'success' : 'warning', iconName:'domain' },
      { label:'Supabase', value: SupabaseConfig.isConfigured() ? 'Configurado' : 'Pendiente', sub:'URL + anon key', tone: SupabaseConfig.isConfigured() ? 'success' : 'warning', iconName:'database' },
      { label:'BCV realtime', value:'Fallback chain', sub:'Backend → DolarAPI → Rafnixg → PyDolarVE → cache/manual', iconName:'currency_exchange' }
    ];
    return `<section class="grid gap-6">
      ${DS.PageHeader({ title:'Backend & Supabase', subtitle:'Panel educativo para conectar el frontend con API real, tenant activo y Supabase.', actions: `${DS.Button({id:'btnBackendDb', label:'Probar DB', iconName:'database', variant:'primary'})}${DS.Button({id:'btnBackendHealth', label:'Probar API', iconName:'health_and_safety', variant:'primary'})}${DS.Button({id:'btnSyncCoreSupabase', label:'Sync módulos', iconName:'cloud_sync', variant:'secondary'})}${DS.Button({id:'btnBackendBcv', label:'Probar BCV', iconName:'currency_exchange', variant:'secondary'})}` })}
      <div class="ds-kpi-grid">${kpis.map(k=>DS.Kpi(k)).join('')}</div>
      <section class="surface rounded-[1.5rem] p-6">
        <h3 class="text-2xl font-black text-[#00236f] dark:text-white">Configuración rápida</h3>
        ${DS.Form({ id:'backendConfigForm', submitLabel:'Guardar configuración', fields:[
          { name:'apiBase', label:'API Base URL', value: BackendApi.baseUrl, required:true },
          { name:'tenantId', label:'Tenant ID', value: BackendApi.tenantId || 'demo-tenant', placeholder:'demo-tenant' },
          { name:'supabaseUrl', label:'Supabase URL', value:supa.url || '', placeholder:'https://xxxxx.supabase.co' },
          { name:'supabaseAnonKey', label:'Supabase anon key', value:supa.anonKey || '' }
        ]})}
      </section>
      <section class="surface rounded-[1.5rem] p-6">
        <h3 class="text-2xl font-black text-[#00236f] dark:text-white">Cómo se usa</h3>
        <ol class="mt-4 grid gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
          <li>1. Ejecuta <code>cd backend && npm install && npm run dev</code>.</li>
          <li>2. Para testing usa <code>demo-tenant</code>, creado por el SQL bootstrap.</li>
          <li>3. Pega el Tenant ID aquí para que el frontend mande <code>x-tenant-id</code>.</li>
          <li>4. Cuando actives Supabase Auth, cambia el header demo por JWT + RLS.</li>
        </ol>
      </section>
    </section>`;
  },
  mount(_state, { Toast, render, Store, SupabaseSyncService }) {
    document.getElementById('backendConfigForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      BackendApi.setBaseUrl(data.apiBase);
      BackendApi.setTenantId(data.tenantId);
      SupabaseConfig.set({ url:data.supabaseUrl, anonKey:data.supabaseAnonKey });
      Toast.show('Configuración backend guardada.', 'success');
      render();
    });
    document.getElementById('btnBackendDb')?.addEventListener('click', async () => {
      try {
        const result = await BackendApi.request('/health/db');
        Toast.show(`DB OK: ${JSON.stringify(result.database?.[0] || result.database || {})}`, 'success');
      } catch (error) {
        Toast.show(error.message, 'error');
      }
    });
    document.getElementById('btnBackendHealth')?.addEventListener('click', async () => {
      try { const health = await BackendApi.health(); Toast.show(`Backend OK: ${health.service || health.mode || 'API'}`, 'success'); }
      catch (error) { Toast.show(error.message, 'error'); }
    });
    document.getElementById('btnSyncCoreSupabase')?.addEventListener('click', async () => {
      try {
        await SupabaseSyncService.syncCore({ Store, Toast, force:true, silent:false });
        Toast.show('Módulos principales sincronizados con Supabase.', 'success');
        render();
      } catch (error) {
        Toast.show(error.message, 'error');
      }
    });
    document.getElementById('btnBackendBcv')?.addEventListener('click', async () => {
      try { const result = await BcvService.fetchRate({ allowStale:true }); Toast.show(`BCV: Bs. ${result.rate} · ${result.source}`, result.stale ? 'warning' : 'success'); }
      catch (error) { Toast.show(error.message, 'error'); }
    });
  }
};
