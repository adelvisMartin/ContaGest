import { PageHeader, Button, Badge, Table } from '../components/ui/index.js';
import { MODULE_CATALOG } from '../data/moduleCatalog.js';
import { moduleRobustness, integrationReport, CORE_FLOWS } from '../services/pretestService.js';
import { hardeningSummary } from '../services/projectHardeningService.js';
import { FailureLogService } from '../services/failureLogService.js';
import { escapeHtml } from '../utils/dom.js';

const toneByScore = (score) => score >= 80 ? 'success' : score >= 65 ? 'warning' : 'danger';
const labelByScore = (score) => score >= 80 ? 'Robusto' : score >= 65 ? 'Avanzado' : 'Pretesting';
const iconByStatus = (status) => status === 'robusta' ? 'fa-shield-check' : status === 'avanzada' ? 'fa-triangle-exclamation' : 'fa-vial-circle-check';

function hardeningRows(iterations) {
  return iterations.map((item) => `<tr>
    <td><strong>${item.pass}/20</strong><br>${Badge(`${item.confidence}%`, item.confidence >= 88 ? 'success' : 'warning')}</td>
    <td><strong>${escapeHtml(item.axis)}</strong></td>
    <td><p class="font-black text-emerald-700 dark:text-emerald-200">${escapeHtml(item.pro)}</p></td>
    <td><p class="font-black text-amber-700 dark:text-amber-200">${escapeHtml(item.con)}</p></td>
    <td><p class="font-black text-slate-700 dark:text-slate-200">${escapeHtml(item.mitigation)}</p></td>
  </tr>`);
}

function uniformityRows(items) {
  return items.map((m) => `<tr>
    <td><strong>${escapeHtml(m.name)}</strong><br><small>${escapeHtml(m.route)}</small></td>
    <td>${escapeHtml(m.area)}</td>
    <td>${Badge(m.status, m.visualScore >= 86 ? 'success' : m.visualScore >= 74 ? 'warning' : 'danger')}</td>
    <td><strong>${m.visualScore}/100</strong></td>
    <td>${escapeHtml(m.action)}</td>
  </tr>`);
}

export const PretestingDashboardPage = {
  render(state) {
    const modules = MODULE_CATALOG.map(moduleRobustness).sort((a, b) => b.score - a.score);
    const robust = modules.filter((m) => m.score >= 80);
    const weak = modules.filter((m) => m.score < 65);
    const integrations = integrationReport();
    const hardening = hardeningSummary();
    const failureSummary = FailureLogService.summary(state.failureLog);
    const rows = modules.map((m) => `<tr>
      <td><strong>${escapeHtml(m.name)}</strong><br><small>${escapeHtml(m.route)}</small></td>
      <td>${escapeHtml(m.area)}</td>
      <td>${Badge(m.tier, m.tier === 'core' ? 'success' : m.tier === 'advanced' ? 'brand' : 'warning')}</td>
      <td>${Badge(labelByScore(m.score), toneByScore(m.score))}</td>
      <td><strong>${m.score}/100</strong></td>
      <td>${escapeHtml(m.recommendation)}</td>
    </tr>`);

    return `<section class="pretest-page cgx-module-standard">
      ${PageHeader({
        eyebrowKey:'pretestingEyebrow',
        titleKey:'Pretesting, pros/contras y hardening 20x',
        descKey:'Matriz de madurez, uniformidad visual enterprise, riesgos y mitigaciones para producción.',
        actions: `${Button({ text:'Bitácora', icon:'fa-clipboard-list', variant:'secondary', attrs:'data-route="auditoria" type="button"' })}${Button({ text:'Backend & APIs', icon:'fa-server', variant:'secondary', attrs:'data-route="backend" type="button"' })}${Button({ text:'Conectar Supabase', icon:'fa-database', variant:'primary', attrs:'data-route="backend" type="button"' })}`
      })}

      <div class="pretest-hero surface">
        <div>
          <p class="pretest-eyebrow">Pretesting Enterprise</p>
          <h2>Auditoría visual, funcional, API, roles, demos, bitácora y seguridad antes de Supabase</h2>
          <p>Esta vista consolida 20 rondas de pros/contras, riesgos minimizados y próximos controles para pasar de prototipo robusto a ERP productivo.</p>
        </div>
        <div class="pretest-score-grid">
          <article><span>Módulos robustos</span><strong>${robust.length}</strong></article>
          <article><span>Visual promedio</span><strong>${hardening.averageVisualScore}</strong></article>
          <article><span>Contras mitigados</span><strong>${hardening.mitigatedCons}</strong></article>
          <article><span>Fallas abiertas</span><strong>${failureSummary.open}</strong></article>
        </div>
      </div>

      <div class="pretest-grid">
        <section class="surface pretest-panel">
          <h3><i class="fa-solid fa-shield-halved"></i> Módulos más robustos</h3>
          <div class="pretest-card-list">
            ${robust.slice(0, 8).map((m) => `<article>
              <div><strong>${escapeHtml(m.name)}</strong><span>${escapeHtml(m.area)} · ${escapeHtml(m.route)}</span></div>
              ${Badge(`${m.score}/100`, 'success')}
            </article>`).join('')}
          </div>
        </section>

        <section class="surface pretest-panel">
          <h3><i class="fa-solid fa-plug-circle-bolt"></i> Integraciones API</h3>
          <div class="pretest-integration-list">
            ${integrations.map((api) => `<article>
              <i class="fa-solid ${iconByStatus(api.status)}"></i>
              <div><strong>${escapeHtml(api.name)}</strong><span>${escapeHtml(api.category)} · ${escapeHtml(api.status)} · ${api.score}/100</span><p>${escapeHtml(api.hardening)}</p></div>
            </article>`).join('')}
          </div>
        </section>
      </div>

      <section class="surface pretest-panel">
        <h3><i class="fa-solid fa-compass-drafting"></i> Uniformidad visual enterprise por módulo</h3>
        <p class="cg-pretest-note">La capa visual unificada normaliza shell, header, cards, tablas, formularios, botones, mobile y espaciado. Los módulos marcados como “Normalizado” funcionan, pero deben migrarse gradualmente al kit UI para pixel perfect.</p>
        ${Table({ headers:[{label:'Módulo'}, {label:'Área'}, {label:'Estado visual'}, {label:'Score'}, {label:'Acción'}], rows:uniformityRows(hardening.uniformity) })}
      </section>

      <section class="surface pretest-panel">
        <h3><i class="fa-solid fa-repeat"></i> 20 rondas de pros/contras y mitigación</h3>
        <p class="cg-pretest-note">Cada ronda detecta un pro, un contra/riesgo y una acción para minimizar errores antes de subir a GitHub/Vercel/Supabase.</p>
        ${Table({ headers:[{label:'#'}, {label:'Eje'}, {label:'Pro'}, {label:'Contra/Riesgo'}, {label:'Mitigación aplicada o definida'}], rows:hardeningRows(hardening.iterations) })}
      </section>

      <section class="surface pretest-panel">
        <h3><i class="fa-solid fa-route"></i> Flujos críticos para pretesting</h3>
        <div class="pretest-flow-grid">
          ${CORE_FLOWS.map((flow) => `<article>
            <h4>${escapeHtml(flow.name)}</h4>
            <p><strong>Módulos:</strong> ${flow.modules.map(escapeHtml).join(' → ')}</p>
            <p><strong>Riesgos:</strong> ${flow.risks.map(escapeHtml).join(', ')}</p>
            <p><strong>Controles:</strong> ${flow.controls.map(escapeHtml).join(', ')}</p>
          </article>`).join('')}
        </div>
      </section>

      <section class="surface pretest-panel">
        <h3><i class="fa-solid fa-table-list"></i> Matriz de madurez por módulo</h3>
        ${Table({ headers:[
          {label:'Módulo'}, {label:'Área'}, {label:'Tipo'}, {label:'Estado'}, {label:'Score'}, {label:'Siguiente acción'}
        ], rows })}
      </section>
    </section>`;
  }
};
