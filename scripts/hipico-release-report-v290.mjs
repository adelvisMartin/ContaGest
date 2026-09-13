import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const SHA40 = /^[0-9a-f]{40}$/i;
const STATUSES = Object.freeze(['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']);
const outputRoot = path.resolve('artifacts/qa/hipico-v290');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim().toLowerCase();
  } catch {
    return '';
  }
}

const sha = String(
  process.env.HIPICO_RELEASE_SHA
    || process.env.HIPICO_CANDIDATE_SHA
    || process.env.GITHUB_SHA
    || gitHead()
).trim().toLowerCase();
if (!SHA40.test(sha)) throw new Error('HIPICO_RELEASE_REPORT_SHA_REQUIRED');
const head = gitHead();
if (head && head !== sha) throw new Error(`HIPICO_RELEASE_REPORT_SHA_MISMATCH:${head}:${sha}`);

function strictStatus(value, fallback = 'NOT_EXECUTED') {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (!STATUSES.includes(normalized)) return 'FAIL';
  return normalized;
}

async function readJson(relative) {
  try {
    return JSON.parse(await fs.readFile(path.join(outputRoot, relative), 'utf8'));
  } catch {
    return null;
  }
}

const verified = await readJson('evidence-verification.json');
const verifiedStatus = verified && String(verified.sha || '').toLowerCase() === sha
  ? strictStatus(verified.status)
  : 'NOT_EXECUTED';

const statuses = {
  static: strictStatus(process.env.HIPICO_GATE_STATIC),
  postgres: strictStatus(process.env.HIPICO_GATE_POSTGRES),
  restartRecovery: strictStatus(process.env.HIPICO_GATE_RESTART),
  browserChromium: strictStatus(process.env.HIPICO_GATE_CHROMIUM),
  security: strictStatus(process.env.HIPICO_GATE_SECURITY),
  android: strictStatus(process.env.HIPICO_GATE_ANDROID),
  evidence: verifiedStatus,
  browserMatrix: strictStatus(process.env.HIPICO_GATE_MATRIX),
  physicalQa: strictStatus(process.env.HIPICO_GATE_PHYSICAL_QA)
};

const requiredForCodeReview = ['static', 'postgres', 'restartRecovery', 'browserChromium', 'security', 'android', 'evidence'];
const requiredForStablePromotion = [...requiredForCodeReview, 'browserMatrix', 'physicalQa'];

function aggregate(names) {
  const values = names.map((name) => statuses[name]);
  if (values.includes('FAIL')) return 'FAIL';
  if (values.includes('BLOCKED')) return 'BLOCKED';
  if (values.includes('NOT_EXECUTED')) return 'NOT_EXECUTED';
  return 'PASS';
}

const codeReviewStatus = aggregate(requiredForCodeReview);
const stablePromotionStatus = aggregate(requiredForStablePromotion);
const infrastructureReason = String(process.env.HIPICO_BLOCKER_REASON || '').trim();
const blockedInfrastructure = infrastructureReason === 'BLOCKED_INFRASTRUCTURE';

const blockers = [];
for (const name of requiredForStablePromotion) {
  if (statuses[name] !== 'PASS') blockers.push({ gate: name, status: statuses[name] });
}
if (blockedInfrastructure) blockers.push({ gate: 'ci-runner', status: 'BLOCKED', reason: 'BLOCKED_INFRASTRUCTURE' });

const report = {
  schema: 'hipico-release-report.v290-current',
  sha,
  generatedAt: new Date().toISOString(),
  ticket: 290,
  allowedStatuses: STATUSES,
  statuses,
  codeReviewStatus,
  stablePromotionStatus,
  blockerClassification: blockedInfrastructure ? 'BLOCKED_INFRASTRUCTURE' : null,
  blockers,
  readiness: {
    productionReady: stablePromotionStatus === 'PASS',
    state: stablePromotionStatus,
    note: stablePromotionStatus === 'PASS'
      ? 'All required code, browser, security, Android, evidence and physical-QA gates are PASS on this SHA.'
      : 'Production promotion remains blocked until every required gate is PASS on this exact SHA.'
  },
  foda: {
    fortalezas: [
      'PostgreSQL efímero reconstruye la cadena Hípico vigente v12-v21 con RLS/RBAC.',
      'Restart recovery valida persistencia y replay en procesos separados.',
      'Agent/Shadow conserva cero autoridad financiera y SOURCE sin envío automático.',
      'Command Center representa fallos como unavailable y evita ceros saludables ficticios.'
    ],
    oportunidades: [
      'Ejecutar matriz Chromium/Firefox/WebKit y QA físico del equipo objetivo cuando la infraestructura esté disponible.',
      'Usar la evidencia SHA-bound para promover pilot→stable sin reinterpretar resultados históricos.'
    ],
    debilidades: [
      'Los runners sin asignación impiden demostrar gates ejecutables aunque el código fuente esté revisado.',
      'QA físico y latencia de proveedores externos no pueden inferirse desde source review.'
    ],
    amenazas: [
      'BLOCKED_INFRASTRUCTURE puede aparecer como failure en GitHub aunque ningún step se ejecute.',
      'Una evidencia de otro SHA no es válida para el candidato actual.'
    ]
  },
  followUps: blockers.map((item) => `Resolver ${item.gate}: ${item.status}${item.reason ? ` (${item.reason})` : ''}`)
};

await fs.mkdir(outputRoot, { recursive: true });
await fs.writeFile(path.join(outputRoot, 'release-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const markdown = `# Control Hípico — Release report #290\n\n- SHA: \`${sha}\`\n- Code review gates: **${codeReviewStatus}**\n- Stable promotion: **${stablePromotionStatus}**\n- Infra classification: **${blockedInfrastructure ? 'BLOCKED_INFRASTRUCTURE' : 'N/A'}**\n\n## Gates\n${Object.entries(statuses).map(([name, status]) => `- ${name}: **${status}**`).join('\n')}\n\n## Promotion\n${report.readiness.note}\n\n## Blockers\n${blockers.length ? blockers.map((item) => `- ${item.gate}: **${item.status}**${item.reason ? ` — ${item.reason}` : ''}`).join('\n') : '- Ninguno.'}\n`;
await fs.writeFile(path.join(outputRoot, 'release-report.md'), markdown, 'utf8');

console.log(`[hipico-v290] release report sha=${sha} code=${codeReviewStatus} stable=${stablePromotionStatus}`);
if (stablePromotionStatus !== 'PASS') process.exitCode = 1;
