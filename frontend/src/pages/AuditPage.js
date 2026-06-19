import { PageHeader, Table, Badge, StatCard, Button, Field, Select, Textarea } from '../components/ui/index.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';
import { isValidRif } from '../core/validators.js';
import { bs } from '../core/formatters.js';
import { escapeHtml } from '../utils/dom.js';
import { FailureLogService, FAILURE_SEVERITIES, FAILURE_STATUSES } from '../services/failureLogService.js';

const statusLabel = (status = '') => ({ abierta:'Abierta', en_revision:'En revisión', bloqueada:'Bloqueada', resuelta:'Resuelta' }[status] || status);
const severityTone = (severity = 'medium') => FAILURE_SEVERITIES[severity]?.tone || 'warning';
const severityLabel = (severity = 'medium') => FAILURE_SEVERITIES[severity]?.label || severity;
const fmt = (date) => date ? new Date(date).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : '—';

function failureRows(log) {
  return log.entries.map((entry) => `<tr>
    <td>${Badge(severityLabel(entry.severity), severityTone(entry.severity))}<br><small>${Badge(statusLabel(entry.status), entry.status === 'resuelta' ? 'success' : 'warning')}</small></td>
    <td><strong>${escapeHtml(entry.module)}</strong><br><small>${escapeHtml(entry.area || 'General')}</small></td>
    <td><p class="font-black">${escapeHtml(entry.title)}</p><p class="text-xs font-bold text-slate-600 dark:text-slate-300">${escapeHtml(entry.detail)}</p>${entry.resolution ? `<p class="cg-resolution-note"><strong>Resolución:</strong> ${escapeHtml(entry.resolution)}</p>` : ''}</td>
    <td><strong>${escapeHtml(entry.owner || 'QA')}</strong><br><small>${fmt(entry.at)}</small></td>
    <td class="cg-actions-cell"><div class="cg-row-actions">
      ${entry.status === 'resuelta'
        ? `<button class="btn btn-secondary !p-2" type="button" data-reopen-failure="${entry.id}" title="Reabrir"><i class="fa-solid fa-rotate-left"></i></button>`
        : `<button class="btn btn-secondary !p-2" type="button" data-resolve-failure="${entry.id}" title="Marcar resuelta"><i class="fa-solid fa-check"></i></button>`}
    </div></td>
  </tr>`);
}

function monitoringPanel(state, checks, summary) {
  const bcvAge = state.bcv?.updatedAt ? fmt(state.bcv.updatedAt) : 'Pendiente';
  const activeUser = state.rbac?.users?.find((user) => user.id === state.rbac?.activeUserId);
  const degraded = checks.filter((check) => check.tone !== 'success').length;
  return `<section class="cgx-section cg-monitor-panel">
    <header class="cgx-section-head"><div><h2>Monitoreo interno</h2><p>Panel operativo para revisar salud, fallas, demo activa y controles antes de producción.</p></div></header>
    <div class="cgx-section-body cg-monitor-grid">
      <article><span>Health score</span><strong>${summary.healthScore}/100</strong><small>${summary.open} falla(s) abiertas · ${summary.critical} crítica(s)</small></article>
      <article><span>Checks degradados</span><strong>${degraded}</strong><small>${checks.length} controles revisados en auditoría</small></article>
      <article><span>BCV</span><strong>${state.bcv?.rate ? bs(state.bcv.rate) : 'Pendiente'}</strong><small>${bcvAge}</small></article>
      <article><span>Usuario activo</span><strong>${escapeHtml(activeUser?.fullName || 'Sin sesión')}</strong><small>${escapeHtml(activeUser?.email || '')}</small></article>
    </div>
  </section>`;
}

export const AuditPage = {
  render(state) {
    const checks = buildChecks(state);
    const log = FailureLogService.ensure(state.failureLog);
    const summary = FailureLogService.summary(log);
    const critical = checks.filter((c) => c.tone === 'danger').length;
    const warnings = checks.filter((c) => c.tone === 'warning').length;
    const rows = checks.map((c) => `<tr><td>${Badge(c.status, c.tone)}</td><td>${escapeHtml(c.module)}</td><td><p class="font-black">${escapeHtml(c.title)}</p><p class="text-xs font-bold text-slate-600 dark:text-slate-300">${escapeHtml(c.detail)}</p></td></tr>`);
    return `<section class="cg-page-stack cgx-module-standard cg-audit-enterprise">
      ${PageHeader({ eyebrowKey:'auditEyebrow', titleKey:'Auditoría, monitoreo interno y bitácora', descKey:'Checks operativos, fallas abiertas, responsables, resolución y trazabilidad para producción.' })}
      <div class="mb-5 grid gap-4 md:grid-cols-4">
        ${StatCard({label:'Checks', value:String(checks.length), icon:'fa-list-check'})}
        ${StatCard({label:'Advertencias', value:String(warnings), icon:'fa-triangle-exclamation', tone:'accent'})}
        ${StatCard({label:'Críticos', value:String(critical), icon:'fa-circle-xmark'})}
        ${StatCard({label:'Health score', value:`${summary.healthScore}/100`, icon:'fa-heart-pulse', tone:summary.healthScore >= 80 ? 'brand' : 'accent'})}
      </div>
      ${monitoringPanel(state, checks, summary)}
      <section class="surface pretest-panel cg-audit-card">
        <h3><i class="fa-solid fa-shield-halved"></i> Checks internos</h3>
        ${Table({ headers:[{key:'status'}, {label:'Módulo'}, {label:'Detalle'}], rows })}
      </section>
      <section class="cgx-section cg-failure-form-section">
        <header class="cgx-section-head"><div><h2>Registrar falla / mejora</h2><p>La bitácora permite dejar trazabilidad de errores visuales, API, permisos, PDF, mobile o datos.</p></div></header>
        <div class="cgx-section-body">
          <form id="failureLogForm" class="cg-failure-form">
            ${Field({ labelKey:'Título', name:'title', value:'', required:true, placeholderKey:'Ej: Botón AC no despliega menú' })}
            ${Select({ labelKey:'Módulo', name:'module', value:'dashboard', options:FailureLogService.moduleOptions() })}
            ${Select({ labelKey:'Severidad', name:'severity', value:'medium', options:Object.entries(FAILURE_SEVERITIES).filter(([key]) => key !== 'resolved').map(([value, item]) => ({ value, label:item.label })) })}
            ${Select({ labelKey:'Estado', name:'status', value:'abierta', options:FAILURE_STATUSES.map((value) => ({ value, label:statusLabel(value) })) })}
            ${Field({ labelKey:'Responsable', name:'owner', value:'QA interno' })}
            ${Textarea({ labelKey:'Detalle', name:'detail', value:'', required:true })}
            <div class="cg-failure-actions">${Button({ text:'Agregar a bitácora', icon:'fa-bug', type:'submit' })}</div>
          </form>
        </div>
      </section>
      <section class="cgx-section cg-failure-log-section">
        <header class="cgx-section-head"><div><h2>Bitácora de fallas y mejoras</h2><p>${summary.total} registros · ${summary.open} abiertos · ${summary.resolved} resueltos.</p></div></header>
        <div class="cgx-section-body">${Table({ headers:[{label:'Severidad'}, {label:'Módulo'}, {label:'Detalle'}, {label:'Responsable'}, {label:'Acción'}], rows:failureRows(log), emptyKey:'Sin fallas registradas' })}</div>
      </section>
    </section>`;
  },
  mount(_state, { Store, Toast, render }) {
    document.getElementById('failureLogForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      Store.update((draft) => { draft.failureLog = FailureLogService.create(draft.failureLog, data); });
      Toast.show('Falla agregada a la bitácora interna.', 'success');
      render?.();
    });
    document.querySelectorAll('[data-resolve-failure]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { draft.failureLog = FailureLogService.resolve(draft.failureLog, button.dataset.resolveFailure); });
      Toast.show('Falla marcada como resuelta.', 'success');
      render?.();
    }));
    document.querySelectorAll('[data-reopen-failure]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { draft.failureLog = FailureLogService.reopen(draft.failureLog, button.dataset.reopenFailure); });
      Toast.show('Falla reabierta.', 'warning');
      render?.();
    }));
  }
};

function buildChecks(state) {
  const inv = calculateInventory(state.inventory);
  const ledger = calculateLedger(state.ledger.entries);
  const checks = [];
  checks.push({ module:'BCV', status:state.bcv.rate ? 'OK' : 'Pendiente', tone:state.bcv.rate ? 'success' : 'warning', title:'Tasa de cambio', detail:state.bcv.rate ? `Tasa cargada: ${bs(state.bcv.rate)}` : 'Actualiza tasa BCV antes de emitir.' });
  checks.push({ module:'Contabilidad', status:ledger.balanced ? 'OK' : 'Crítico', tone:ledger.balanced ? 'success' : 'danger', title:'Balance de partida doble', detail:ledger.balanced ? 'Debe y haber balancean.' : `Diferencia: ${bs(ledger.diff)}` });
  checks.push({ module:'Inventario', status:inv.lowStock ? 'Alerta' : 'OK', tone:inv.lowStock ? 'warning' : 'success', title:'Stock mínimo', detail:inv.lowStock ? `${inv.lowStock} productos por debajo del mínimo.` : 'Sin productos bajo mínimo.' });
  const invalidRif = state.clients.filter((client) => !isValidRif(client.rif)).length;
  checks.push({ module:'Clientes', status:invalidRif ? 'Alerta' : 'OK', tone:invalidRif ? 'warning' : 'success', title:'Validación de RIF', detail:invalidRif ? `${invalidRif} RIF requieren revisión.` : 'RIFs de clientes con formato válido.' });
  checks.push({ module:'Roles', status:state.rbac?.roles?.length ? 'OK' : 'Pendiente', tone:state.rbac?.roles?.length ? 'success' : 'warning', title:'RBAC por alcance', detail:state.rbac?.roles?.length ? `${state.rbac.roles.length} roles definidos con módulos y permisos.` : 'Inicializa RBAC desde Panel admin.' });
  checks.push({ module:'Demos', status:state.rbac?.users?.some((user) => user.demo) ? 'OK' : 'Pendiente', tone:state.rbac?.users?.some((user) => user.demo) ? 'success' : 'warning', title:'Usuarios demo', detail:state.rbac?.users?.filter((user) => user.demo).length ? `${state.rbac.users.filter((user) => user.demo).length} demo(s) con vencimiento/límite.` : 'Crea demos controlados desde Panel admin.' });
  checks.push({ module:'Bitácora', status:FailureLogService.summary(state.failureLog).open ? 'Alerta' : 'OK', tone:FailureLogService.summary(state.failureLog).critical ? 'danger' : FailureLogService.summary(state.failureLog).open ? 'warning' : 'success', title:'Fallas internas', detail:`${FailureLogService.summary(state.failureLog).open} abiertas, ${FailureLogService.summary(state.failureLog).resolved} resueltas.` });
  checks.push({ module:'Normativa', status:'Manual', tone:'warning', title:'Validación oficial', detail:'El monitor normativo es referencial; valida documento oficial antes de declarar.' });
  return checks;
}
