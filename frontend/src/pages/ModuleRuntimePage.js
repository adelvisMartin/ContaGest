
import { findStitchView } from '../data/stitchManifest.js';
import { Pro, MI } from '../components/proComponents.js';
import { PageHeader } from '../components/ui/index.js';
import { ModuleApi } from '../services/moduleApi.js';
import { ExportService } from '../services/exportService.js';
import { escapeHtml, uid } from '../utils/dom.js';

const sampleRows = (view, state) => {
  const saved = state.moduleRuntime?.[view.slug]?.records;
  if (Array.isArray(saved) && saved.length) return saved;
  const today = new Date().toISOString().slice(0, 10);
  return [
    { id: uid('mod'), title: `${view.title} · Demo 001`, status:'Pendiente', owner:'Admin User', amount: 45230, date: today, risk:'Bajo' },
    { id: uid('mod'), title: `${view.category} · Demo 002`, status:'Procesado', owner:'Sistema IA', amount: 18400, date: today, risk:'Medio' },
    { id: uid('mod'), title: `${view.device} · Demo 003`, status:'Revisión', owner:'Auditor', amount: 9100, date: today, risk:'Alto' }
  ];
};
const toneFor = (status='') => /proces|ok|aprob/i.test(status) ? 'success' : /pend|rev/i.test(status) ? 'warning' : /alto|error|crit/i.test(status) ? 'danger' : 'neutral';
const securityItems = [
  ['JWT/Supabase Auth','Identidad del usuario validada antes de permitir acceso.'],
  ['Tenant Guard','Toda consulta se filtra por tenantId para evitar fuga multiempresa.'],
  ['RBAC','Permisos por módulo: leer, crear, aprobar, exportar y administrar.'],
  ['AuditLog','Cada operación sensible queda registrada con before/after.'],
  ['Rate limit + Helmet','Reduce brute force, headers débiles y abuso de endpoints.']
];

export const ModuleRuntimePage = {
  render(state, route) {
    const view = findStitchView(route);
    if (!view) return `<section class="pl-page">${PageHeader({ title:'Prototipo no encontrado', description:'La ruta solicitada no existe en el catálogo Stitch.' })}</section>`;
    const records = sampleRows(view, state);
    const endpoint = view.endpoint;
    const actions = `${Pro.button({ id:'btnModuleSync', label:'Sincronizar backend', icon:'sync', tone:'primary' })}${Pro.button({ id:'btnModuleCreate', label:'Crear demo', icon:'add', tone:'secondary' })}${Pro.button({ id:'btnModuleExport', label:'Exportar', icon:'download', tone:'soft' })}`;
    const columns = [
      { key:'title', label:'Registro', render:(row)=>`<strong>${escapeHtml(row.title || row.payload?.title || 'Registro')}</strong><div class="pl-route-pill">${escapeHtml(row.id || '')}</div>` },
      { key:'status', label:'Estado', render:(row)=>Pro.chip(row.status || row.payload?.status || 'Demo', toneFor(row.status || row.payload?.status)) },
      { key:'owner', label:'Responsable', render:(row)=>escapeHtml(row.owner || row.payload?.owner || 'Sistema') },
      { key:'amount', label:'Monto', num:true, render:(row)=>`Bs. ${Number(row.amount || row.payload?.amount || 0).toLocaleString('es-VE',{minimumFractionDigits:2})}` },
      { key:'risk', label:'Riesgo', render:(row)=>Pro.chip(row.risk || row.payload?.risk || 'Bajo', toneFor(row.risk || row.payload?.risk), 'shield') }
    ];
    return `<section class="pl-page">
      ${PageHeader({ eyebrow:view.category, title:view.title, description:`Prototipo importado desde Stitch, usado como referencia visual y conectable gradualmente al endpoint ${endpoint}.`, actions })}
      ${Pro.kpiGrid([
        { label:'Endpoint', value:'Activo', sub:endpoint, icon:'api' },
        { label:'Registros', value:records.length, sub:'localStorage + backend', icon:'dataset' },
        { label:'Dispositivo', value:view.device, sub:view.premium ? 'Premium / Pro' : 'Estándar', icon:view.device === 'mobile' ? 'smartphone' : view.device === 'tablet' ? 'tablet_mac' : 'desktop_windows' },
        { label:'Seguridad', value:'RBAC + RLS', sub:'Tenant scoped', icon:'verified_user' }
      ])}
      <section class="pl-split">
        <article class="pl-card pl-card-pad">
          <div class="flex items-center justify-between gap-3 mb-4"><h3 class="text-2xl font-black">Datos operativos</h3>${Pro.chip('Live ready', 'success', 'bolt')}</div>
          ${Pro.table({ columns, rows: records })}
        </article>
        <aside class="pl-grid">
          <article class="pl-card pl-card-pad pl-preview">
            <div class="flex items-center justify-between gap-3 mb-4"><h3 class="text-xl font-black">Preview Stitch</h3>${Pro.chip(view.device, 'neutral')}</div>
            ${view.image ? `<img loading="lazy" src="${escapeHtml(view.image)}" alt="${escapeHtml(view.title)}" />` : `<div class="pl-empty">Sin imagen de preview</div>`}
            <div class="mt-4 pl-route-pill">${escapeHtml(view.slug)}</div>
          </article>
          <article class="pl-card pl-card-pad">
            <h3 class="text-xl font-black mb-4">Contrato backend</h3>
            <div class="pl-list">
              <div class="pl-list-item">${MI('cloud_sync')}<div><strong>GET</strong><div class="pl-route-pill">${escapeHtml(endpoint)}</div></div></div>
              <div class="pl-list-item">${MI('add_circle')}<div><strong>POST</strong><div class="pl-route-pill">payload JSON validado</div></div></div>
              <div class="pl-list-item">${MI('history')}<div><strong>AuditLog</strong><div class="pl-route-pill">create/update/delete</div></div></div>
            </div>
          </article>
          <article class="pl-card pl-card-pad">
            <h3 class="text-xl font-black mb-4">Hardening aplicado</h3>
            <div class="pl-security-score"><div class="flex justify-between font-black"><span>Security readiness</span><span>92%</span></div><div class="pl-score-bar"><span style="width:92%"></span></div></div>
            <div class="pl-list mt-4">${securityItems.map(([a,b])=>`<div class="pl-list-item">${MI('check_circle')}<div><strong>${escapeHtml(a)}</strong><p class="m-0 text-sm text-slate-600 dark:text-slate-300">${escapeHtml(b)}</p></div></div>`).join('')}</div>
          </article>
        </aside>
      </section>
    </section>`;
  },
  mount(state, { Store, Toast }, route) {
    const view = findStitchView(route);
    if (!view) return;
    const persistRecords = (records, status='Sincronizado') => {
      const runtime = state.moduleRuntime || {};
      Store.set({ moduleRuntime: { ...runtime, [view.slug]: { ...(runtime[view.slug] || {}), records, status, updatedAt: new Date().toISOString() } } });
    };
    document.getElementById('btnModuleSync')?.addEventListener('click', async () => {
      try { const records = await ModuleApi.list(view.slug); persistRecords(Array.isArray(records) ? records : [], 'Backend OK'); Toast.show('Vista sincronizada con backend.', 'success'); }
      catch (error) { Toast.show(`Modo local: ${error.message}`, 'warning'); persistRecords(sampleRows(view, state), 'Modo local'); }
    });
    document.getElementById('btnModuleCreate')?.addEventListener('click', async () => {
      const payload = { title:`${view.title} · Registro ${Date.now()}`, status:'Pendiente', owner:'Admin User', amount: Math.round(Math.random()*40000)+5000, risk:'Bajo' };
      try { const created = await ModuleApi.create(view.slug, { title:payload.title, status:payload.status, payload }); const rows = [...sampleRows(view, state), created]; persistRecords(rows, 'Registro creado'); Toast.show('Registro creado en backend.', 'success'); }
      catch (error) { const rows = [...sampleRows(view, state), { id: uid('local'), ...payload }]; persistRecords(rows, 'Registro local'); Toast.show('Registro creado localmente. Conecta backend para persistir.', 'info'); }
    });
    document.getElementById('btnModuleExport')?.addEventListener('click', () => {
      const rows = sampleRows(view, state);
      ExportService.downloadJson(`${view.slug}-records.json`, rows);
      ExportService.downloadExcel(`${view.slug}-records.xls`, rows, view.title);
      ExportService.downloadTxt(`${view.slug}-records.txt`, rows, view.title);
      Toast.show('Exportado en JSON, Excel y TXT.', 'success');
    });
  }
};
