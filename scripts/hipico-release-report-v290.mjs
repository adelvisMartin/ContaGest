import fs from 'node:fs/promises';
import path from 'node:path';

const sha = String(process.env.HIPICO_RELEASE_SHA || process.env.GITHUB_SHA || '').trim();
if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('HIPICO_RELEASE_REPORT_SHA_REQUIRED');

const event = String(process.env.HIPICO_RELEASE_EVENT || process.env.GITHUB_EVENT_NAME || 'unknown');
const statuses = {
  static: String(process.env.HIPICO_GATE_STATIC || 'unknown'),
  postgres: String(process.env.HIPICO_GATE_POSTGRES || 'unknown'),
  browserChromium: String(process.env.HIPICO_GATE_CHROMIUM || 'unknown'),
  security: String(process.env.HIPICO_GATE_SECURITY || 'unknown'),
  android: String(process.env.HIPICO_GATE_ANDROID || 'unknown'),
  browserMatrix: String(process.env.HIPICO_GATE_MATRIX || 'unknown')
};

const required = event === 'schedule'
  ? ['browserMatrix']
  : event === 'workflow_dispatch'
    ? ['static', 'postgres', 'browserChromium', 'security', 'android', 'browserMatrix']
    : ['static', 'postgres', 'browserChromium', 'security', 'android'];
const missing = required.filter((name) => statuses[name] !== 'success');
const executedRequiredPass = missing.length === 0;

const blockers = [];
if (!executedRequiredPass) blockers.push({ code: 'REQUIRED_GATE_NOT_GREEN', gates: missing.map((name) => ({ name, result: statuses[name] })) });
if (event !== 'schedule') blockers.push({ code: 'P0_ISSUE_290_OPEN_UNTIL_MERGE', readinessCap: 60 });

const readiness = event === 'schedule'
  ? {
      score: null,
      cap: 'NOT_A_PRODUCT_RELEASE_RUN',
      state: executedRequiredPass ? 'SCHEDULED_MATRIX_VERIFIED_ONLY' : 'SCHEDULED_MATRIX_BLOCKED',
      note: 'A scheduled browser matrix is compatibility evidence only; it cannot establish product release readiness.'
    }
  : {
      score: executedRequiredPass ? 60 : 50,
      cap: 'P0_OPEN_MAX_60',
      state: executedRequiredPass ? 'READY_FOR_REVIEW_NOT_DONE' : 'BLOCKED',
      note: 'Issue #290 remains P0 until final evidence is reviewed and the ticket is explicitly closed.'
    };

const report = {
  schema: 'hipico-release-report.v290',
  sha,
  event,
  generatedAt: new Date().toISOString(),
  ticket: 290,
  required,
  statuses,
  executedRequiredPass,
  readiness,
  blockers,
  foda: {
    fortalezas: [
      'PostgreSQL real efímero por ejecución y cleanup fail-safe.',
      'E2E de canal, documentos, lifecycle, multigrupo, restart, agente y Command Center.',
      'PWA/Android/versiones y release contract unidos al SHA.',
      'Seguridad explícita para replay, RLS/RBAC, documentos hostiles, provider enrichment y límites del agente.'
    ],
    oportunidades: [
      'Promover desde pilot sólo después de evidencia física y cierre explícito del P0.',
      'Comparar perfiles CI con el equipo objetivo i5 6ª generación / 16 GB cuando esté disponible.'
    ],
    debilidades: [
      'La latencia real del proveedor externo requiere credenciales/entorno autorizado y se reporta separada del adapter local.',
      'La validación en hardware físico objetivo no puede inferirse desde un runner cloud.'
    ],
    amenazas: [
      'GitHub Actions puede quedar sin runner/steps; ese caso es BLOCKED_INFRASTRUCTURE, nunca PASS.',
      'Límites externos de despliegue como Vercel deben permanecer separados de la calidad del código.'
    ]
  },
  risks: [
    { id: 'R-PHYSICAL-QA', state: 'FOLLOW_UP', mitigation: 'Ejecutar smoke/UX/performance en equipo objetivo antes de promoción estable.' },
    { id: 'R-LIVE-PROVIDER-LATENCY', state: 'FOLLOW_UP', mitigation: 'Medir contra proveedor autorizado sin convertirlo en autoridad financiera.' }
  ],
  followUps: [
    'Cerrar #290 sólo después de revisar evidencia final del SHA y confirmar que los jobs realmente ejecutaron pasos.',
    'Mantener SOURCE/WhatsApp en shadow/read-only hasta promoción explícita.',
    'Conservar artefactos de browser, PostgreSQL, Android y seguridad durante el periodo definido por release policy.'
  ]
};

const root = path.resolve('artifacts/qa/hipico-v290');
await fs.mkdir(root, { recursive: true });
await fs.writeFile(path.join(root, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const scoreLabel = readiness.score == null ? 'N/A' : `${readiness.score}/100`;
const markdown = `# Control Hípico — Release report #290\n\n- SHA: \`${sha}\`\n- Evento: \`${event}\`\n- Required executed pass: **${executedRequiredPass ? 'YES' : 'NO'}**\n- Readiness: **${scoreLabel}** (${readiness.cap})\n- Estado: **${readiness.state}**\n- Nota: ${readiness.note}\n\n## Gates\n${required.map((name) => `- ${name}: **${statuses[name]}**`).join('\n')}\n\n## FODA\n### Fortalezas\n${report.foda.fortalezas.map((item) => `- ${item}`).join('\n')}\n\n### Oportunidades\n${report.foda.oportunidades.map((item) => `- ${item}`).join('\n')}\n\n### Debilidades\n${report.foda.debilidades.map((item) => `- ${item}`).join('\n')}\n\n### Amenazas\n${report.foda.amenazas.map((item) => `- ${item}`).join('\n')}\n\n## Riesgos / follow-up\n${report.risks.map((item) => `- ${item.id}: ${item.state} — ${item.mitigation}`).join('\n')}\n${report.followUps.map((item) => `- ${item}`).join('\n')}\n`;
await fs.writeFile(path.join(root, 'release-report.md'), markdown, 'utf8');

if (!executedRequiredPass) {
  console.error(`[hipico-v290] release report BLOCKED: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`[hipico-v290] release report written for ${sha}; state=${readiness.state}; readiness=${scoreLabel}`);
}
