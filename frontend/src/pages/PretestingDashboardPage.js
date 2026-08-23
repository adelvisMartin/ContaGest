import { PageHeader, Button, Badge, MetricGrid, ErpDataTable, ErpGrid, ErpSection } from '../components/ui/index.js';
import { MODULE_CATALOG } from '../data/moduleCatalog.js';
import { moduleRobustness, integrationReport, CORE_FLOWS } from '../services/pretestService.js';
import { hardeningSummary } from '../services/projectHardeningService.js';
import { FailureLogService } from '../services/failureLogService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const toneByScore = (score) => score >= 80 ? 'success' : score >= 65 ? 'warning' : 'danger';
const labelByScore = (score) => score >= 80 ? 'Señal alta' : score >= 65 ? 'Señal media' : 'Señal baja';
const iconByStatus = (status) => status === 'robusta' ? 'fa-shield-check' : status === 'avanzada' ? 'fa-triangle-exclamation' : 'fa-vial-circle-check';

export const PretestingDashboardPage = {
  render(state) {
    const modules = MODULE_CATALOG.map(moduleRobustness).sort((a, b) => b.score - a.score);
    const robust = modules.filter((module) => module.score >= 80);
    const integrations = integrationReport();
    const hardening = hardeningSummary();
    const failureSummary = FailureLogService.summary(state.failureLog);

    const moduleTable=ErpDataTable({
      caption:'Matriz heurística interna por módulo',
      columns:[
        {key:'name',label:'Módulo',render:(item)=>`<strong>${safe(item.name)}</strong><br><small>${safe(item.route)}</small>`},
        {key:'area',label:'Área',render:(item)=>safe(item.area)},
        {key:'tier',label:'Tipo',render:(item)=>Badge(item.tier,item.tier==='core'?'success':item.tier==='advanced'?'brand':'warning')},
        {key:'score',label:'Índice preflight',numeric:true,render:(item)=>`${Badge(labelByScore(item.score),toneByScore(item.score))}<br><small>${item.score}/100</small>`},
        {key:'recommendation',label:'Siguiente acción',render:(item)=>safe(item.recommendation)}
      ],rows:modules
    });
    const integrationTable=ErpDataTable({
      caption:'Señales configuradas de integraciones',
      columns:[
        {key:'name',label:'Integración',render:(item)=>`<strong>${safe(item.name)}</strong>`},
        {key:'category',label:'Categoría',render:(item)=>safe(item.category)},
        {key:'status',label:'Señal',render:(item)=>`${Badge(item.status,toneByScore(item.score))} <span class="cg-ui-muted">${item.score}/100</span>`},
        {key:'hardening',label:'Hardening',render:(item)=>safe(item.hardening)}
      ],rows:integrations
    });
    const uniformityTable=ErpDataTable({
      caption:'Uniformidad visual declarada por módulo',
      columns:[
        {key:'name',label:'Módulo',render:(item)=>`<strong>${safe(item.name)}</strong><br><small>${safe(item.route)}</small>`},
        {key:'area',label:'Área',render:(item)=>safe(item.area)},
        {key:'status',label:'Estado interno',render:(item)=>Badge(item.status,item.visualScore>=86?'success':item.visualScore>=74?'warning':'danger')},
        {key:'visualScore',label:'Índice',numeric:true,render:(item)=>`${item.visualScore}/100`},
        {key:'action',label:'Acción',render:(item)=>safe(item.action)}
      ],rows:hardening.uniformity
    });
    const iterationsTable=ErpDataTable({
      caption:'Rondas internas de hardening',
      columns:[
        {key:'pass',label:'#',numeric:true,render:(item)=>`${item.pass}/20`},
        {key:'axis',label:'Eje',render:(item)=>`<strong>${safe(item.axis)}</strong>`},
        {key:'pro',label:'Pro',render:(item)=>safe(item.pro)},
        {key:'con',label:'Contra / riesgo',render:(item)=>safe(item.con)},
        {key:'mitigation',label:'Mitigación',render:(item)=>safe(item.mitigation)}
      ],rows:hardening.iterations
    });
    const flowCards=CORE_FLOWS.map((flow)=>ErpSection({
      tag:'article',title:flow.name,
      description:`Módulos: ${flow.modules.join(' → ')}`,
      content:`<p><strong>Riesgos:</strong> ${safe(flow.risks.join(', '))}</p><p><strong>Controles esperados:</strong> ${safe(flow.controls.join(', '))}</p>`
    })).join('');

    return `<section class="cg-page-stack">
      ${PageHeader({
        eyebrowKey:'pretestingEyebrow',
        title:'Preflight y hardening interno',
        description:'Inventario de señales, riesgos y contratos para preparar QA. Esta vista no otorga PASS de producción.',
        actions:`${Button({text:'Bitácora',icon:'fa-clipboard-list',variant:'secondary',attrs:'data-route="auditoria" type="button"'})}${Button({text:'Backend & APIs',icon:'fa-server',variant:'secondary',attrs:'data-route="backend" type="button"'})}`
      })}
      ${ErpSection({
        title:'Regla de evidencia',
        description:'Todos los puntajes de esta pantalla son heurísticas internas derivadas del catálogo, configuración y reglas de preflight. No son resultados ejecutados de Playwright, CI, API externa, base de datos, dispositivo real ni producción. Un gate sin ejecución comprobable permanece NOT_EXECUTED.',
        actions:Badge('NO QA PASS','warning'),
        content:'<p class="cg-ui-muted">Los estados PASS/FAIL se asignan únicamente en los reportes de QA que conserven comando, SHA, entorno y evidencia de ejecución.</p>'
      })}
      ${MetricGrid([
        {label:'Señales altas',value:String(robust.length),hint:'Heurística, no módulos certificados',iconName:'fa-shield-check',tone:'brand'},
        {label:'Índice visual',value:String(hardening.averageVisualScore),hint:'Preflight interno',iconName:'fa-swatchbook',tone:'neutral'},
        {label:'Contras mitigados',value:String(hardening.mitigatedCons),hint:'Registro de diseño/hardening',iconName:'fa-screwdriver-wrench',tone:'success'},
        {label:'Fallas abiertas',value:String(failureSummary.open),hint:'Bitácora interna',iconName:'fa-bug',tone:failureSummary.open?'warning':'success'}
      ])}
      ${ErpGrid(
        ErpSection({title:'Matriz de módulos',description:'Índices internos para priorizar el QA posterior al merge.',content:moduleTable})+
        ErpSection({title:'Integraciones',description:'La configuración detectada no prueba disponibilidad del proveedor.',content:integrationTable}),
        {columns:'two'}
      )}
      ${ErpSection({title:'Uniformidad visual declarada',description:'Sirve para priorizar revisión; la ausencia de hallazgos fuente no reemplaza inspección de navegador, contraste ni responsive.',content:uniformityTable})}
      ${ErpSection({title:'20 rondas de hardening',description:'Registro interno de pros, contras y mitigaciones; no representa veinte ejecuciones de QA.',content:iterationsTable})}
      ${ErpSection({title:'Flujos críticos para QA',description:'Contratos que deberán ejecutarse de extremo a extremo después del merge.',content:ErpGrid(flowCards,{columns:'two'})})}
    </section>`;
  }
};
