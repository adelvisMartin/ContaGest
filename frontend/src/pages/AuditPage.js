import { PageHeader, Badge, MetricGrid, Button, Field, Select, Textarea, ErpButton, ErpDataTable, ErpGrid, ErpRow, ErpSection } from '../components/ui/index.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';
import { isValidRif } from '../core/validators.js';
import { bs } from '../core/formatters.js';
import { escapeHtml } from '../utils/dom.js';
import { FailureLogService, FAILURE_SEVERITIES, FAILURE_STATUSES } from '../services/failureLogService.js';

const safe=(value)=>escapeHtml(String(value??''));
const statusLabel = (status = '') => ({ abierta:'Abierta', en_revision:'En revisión', bloqueada:'Bloqueada', resuelta:'Resuelta' }[status] || status);
const severityTone = (severity = 'medium') => FAILURE_SEVERITIES[severity]?.tone || 'warning';
const severityLabel = (severity = 'medium') => FAILURE_SEVERITIES[severity]?.label || severity;
const fmt = (date) => date ? new Date(date).toLocaleString('es-VE', { dateStyle:'short', timeStyle:'short' }) : '—';

function failureTable(log) {
  return ErpDataTable({
    caption:'Bitácora interna de fallas y mejoras',
    columns:[
      {key:'severity',label:'Severidad',render:(entry)=>`${Badge(severityLabel(entry.severity),severityTone(entry.severity))}<br><small>${Badge(statusLabel(entry.status),entry.status==='resuelta'?'success':'warning')}</small>`},
      {key:'module',label:'Módulo',render:(entry)=>`<strong>${safe(entry.module)}</strong><br><small>${safe(entry.area||'General')}</small>`},
      {key:'detail',label:'Detalle',render:(entry)=>`<strong>${safe(entry.title)}</strong><br><small>${safe(entry.detail)}</small>${entry.resolution?`<p class="cg-ui-muted"><strong>Resolución:</strong> ${safe(entry.resolution)}</p>`:''}`},
      {key:'owner',label:'Responsable',render:(entry)=>`<strong>${safe(entry.owner||'QA interno')}</strong><br><small>${safe(fmt(entry.at))}</small>`},
      {key:'actions',label:'Acción',render:(entry)=>ErpRow(entry.status==='resuelta'
        ? ErpButton('Reabrir hallazgo',{variant:'secondary',icon:'fa-solid fa-rotate-left',iconOnly:true,data:{'reopen-failure':entry.id}})
        : ErpButton('Marcar resuelta',{variant:'secondary',icon:'fa-solid fa-check',iconOnly:true,data:{'resolve-failure':entry.id}}),{wrap:true})}
    ],
    rows:log.entries
  });
}

export const AuditPage = {
  render(state) {
    const checks = buildChecks(state);
    const log = FailureLogService.ensure(state.failureLog);
    const summary = FailureLogService.summary(log);
    const critical = checks.filter((item) => item.tone === 'danger').length;
    const warnings = checks.filter((item) => item.tone === 'warning').length;
    const degraded=checks.filter((item)=>item.tone!=='success').length;
    const activeUser=state.rbac?.users?.find((user)=>user.id===state.rbac?.activeUserId);
    const checkTable=ErpDataTable({
      caption:'Checks internos de preflight',
      columns:[
        {key:'status',label:'Estado',render:(item)=>Badge(item.status,item.tone)},
        {key:'module',label:'Módulo',render:(item)=>safe(item.module)},
        {key:'detail',label:'Detalle',render:(item)=>`<strong>${safe(item.title)}</strong><br><small>${safe(item.detail)}</small>`}
      ],rows:checks
    });
    const form=`<form id="failureLogForm" class="cg-record-form"><div class="cg-record-fields">${Field({labelKey:'Título',name:'title',required:true,placeholder:'Ej: Botón no ejecuta la acción esperada'})}${Select({labelKey:'Módulo',name:'module',value:'dashboard',options:FailureLogService.moduleOptions()})}${Select({labelKey:'Severidad',name:'severity',value:'medium',options:Object.entries(FAILURE_SEVERITIES).filter(([key])=>key!=='resolved').map(([value,item])=>({value,label:item.label}))})}${Select({labelKey:'Estado',name:'status',value:'abierta',options:FAILURE_STATUSES.map((value)=>({value,label:statusLabel(value)}))})}${Field({labelKey:'Responsable',name:'owner',value:'QA interno'})}${Textarea({labelKey:'Detalle',name:'detail',required:true,className:'cg-field-wide'})}</div><div class="cg-record-actions">${Button({text:'Agregar a bitácora',icon:'fa-bug',type:'submit'})}</div></form>`;

    return `<section class="cg-page-stack cg-audit-enterprise">
      ${PageHeader({eyebrowKey:'auditEyebrow',title:'Auditoría y preflight interno',description:'Checks de consistencia y bitácora de trabajo. Esta pantalla no certifica QA browser, integración, base de datos ni producción.'})}
      ${ErpSection({title:'Evidencia y alcance',description:'Los indicadores de esta vista son señales internas calculadas desde el estado disponible. No son resultados de CI/Playwright ni sustituyen logs de auditoría server-side. Cualquier gate no ejecutado debe conservarse como NOT_EXECUTED.',actions:Badge('PREFLIGHT · NO QA PASS','warning'),content:''})}
      ${MetricGrid([
        {label:'Checks internos',value:String(checks.length),hint:`${degraded} degradados`,iconName:'fa-list-check',tone:'neutral'},
        {label:'Advertencias',value:String(warnings),hint:'Requieren contraste',iconName:'fa-triangle-exclamation',tone:warnings?'warning':'success'},
        {label:'Críticos',value:String(critical),hint:'Bloquean confianza interna',iconName:'fa-circle-xmark',tone:critical?'danger':'success'},
        {label:'Índice bitácora',value:`${summary.healthScore}/100`,hint:'Heurística interna, no QA',iconName:'fa-heart-pulse',tone:summary.healthScore>=80?'brand':'warning'}
      ])}
      ${ErpGrid(
        ErpSection({title:'Contexto operativo',description:'Datos observados en el estado actual del cliente.',content:`<div class="cg-admin-monitor-grid"><article><span>BCV</span><strong>${state.bcv?.rate?bs(state.bcv.rate):'Pendiente'}</strong><small>${safe(state.bcv?.updatedAt?fmt(state.bcv.updatedAt):'Sin actualización')}</small></article><article><span>Usuario activo</span><strong>${safe(activeUser?.fullName||'Sin sesión')}</strong><small>${safe(activeUser?.email||'')}</small></article><article><span>Fallas abiertas</span><strong>${summary.open}</strong><small>${summary.critical} crítica(s)</small></article></div>`})+
        ErpSection({title:'Checks internos',description:'Contratos calculados desde el estado en memoria; validar posteriormente mediante QA ejecutada.',content:checkTable}),
        {columns:'two'}
      )}
      ${ErpSection({title:'Registrar falla / mejora',description:'Bitácora interna de preflight. No reemplaza el AuditLog persistido del backend ni evidencia de CI.',content:form})}
      ${ErpSection({title:'Bitácora interna',description:`${summary.total} registros · ${summary.open} abiertos · ${summary.resolved} resueltos.`,content:failureTable(log)})}
    </section>`;
  },
  mount(_state, { Store, Toast, render }) {
    document.getElementById('failureLogForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      Store.update((draft) => { draft.failureLog = FailureLogService.create(draft.failureLog, data); });
      Toast.show('Hallazgo agregado a la bitácora interna de preflight.', 'success');
      render?.();
    });
    document.querySelectorAll('[data-resolve-failure]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { draft.failureLog = FailureLogService.resolve(draft.failureLog, button.dataset.resolveFailure); });
      Toast.show('Hallazgo marcado como resuelto en la bitácora interna.', 'success');
      render?.();
    }));
    document.querySelectorAll('[data-reopen-failure]').forEach((button) => button.addEventListener('click', () => {
      Store.update((draft) => { draft.failureLog = FailureLogService.reopen(draft.failureLog, button.dataset.reopenFailure); });
      Toast.show('Hallazgo reabierto en preflight.', 'warning');
      render?.();
    }));
  }
};

function buildChecks(state) {
  const inv = calculateInventory(state.inventory);
  const ledger = calculateLedger(state.ledger.entries);
  const checks = [];
  checks.push({ module:'BCV', status:state.bcv.rate ? 'OK' : 'Pendiente', tone:state.bcv.rate ? 'success' : 'warning', title:'Tasa de cambio', detail:state.bcv.rate ? `Tasa cargada: ${bs(state.bcv.rate)}` : 'Actualiza tasa BCV antes de emitir.' });
  checks.push({ module:'Contabilidad', status:ledger.balanced ? 'OK' : 'Crítico', tone:ledger.balanced ? 'success' : 'danger', title:'Balance de partida doble', detail:ledger.balanced ? 'Debe y haber balancean en el estado evaluado.' : `Diferencia: ${bs(ledger.diff)}` });
  checks.push({ module:'Inventario', status:inv.lowStock ? 'Alerta' : 'OK', tone:inv.lowStock ? 'warning' : 'success', title:'Stock mínimo', detail:inv.lowStock ? `${inv.lowStock} productos por debajo del mínimo.` : 'Sin productos bajo mínimo.' });
  const invalidRif = (state.clients||[]).filter((client) => !isValidRif(client.rif)).length;
  checks.push({ module:'Clientes', status:invalidRif ? 'Alerta' : 'OK', tone:invalidRif ? 'warning' : 'success', title:'Validación de RIF', detail:invalidRif ? `${invalidRif} RIF requieren revisión.` : 'RIFs del estado evaluado tienen formato válido.' });
  checks.push({ module:'Roles', status:state.rbac?.roles?.length ? 'OK' : 'Pendiente', tone:state.rbac?.roles?.length ? 'success' : 'warning', title:'RBAC cargado', detail:state.rbac?.roles?.length ? `${state.rbac.roles.length} roles visibles en el estado actual.` : 'Carga RBAC desde administración.' });
  const failureSummary=FailureLogService.summary(state.failureLog);
  checks.push({ module:'Bitácora', status:failureSummary.open ? 'Alerta' : 'OK', tone:failureSummary.critical ? 'danger' : failureSummary.open ? 'warning' : 'success', title:'Fallas internas', detail:`${failureSummary.open} abiertas, ${failureSummary.resolved} resueltas.` });
  checks.push({ module:'Normativa', status:'Manual', tone:'warning', title:'Validación oficial', detail:'El monitor normativo es referencial; valida documento oficial antes de declarar.' });
  return checks;
}
