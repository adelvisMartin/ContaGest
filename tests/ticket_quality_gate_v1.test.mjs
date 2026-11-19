import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { analyzeTicket, parseArgs, REQUIRED_SECTIONS, DOMAIN_PROFILES } from '../scripts/ticket-quality-gate.mjs';

const specimen = () => [
  '# Ticket: calidad medible',
  ...REQUIRED_SECTIONS.map(h => {
    if (h === 'Criterios de aceptación') return [
      `## ${h}`,
      '- [ ] AC-01 [POSITIVO] Dado un tenant A Cuando guardo Entonces persiste solo A | Prueba: PG17 contrato',
      '- [ ] AC-02 [NEGATIVO] Dado tenant B Cuando consulta A Entonces 403 | Prueba: tenant B API',
      '- [ ] AC-03 [REGRESION] Dado un usuario activo Cuando actualiza Entonces conserva permisos | Prueba: Chromium E2E'
    ].join('\n');
    if (h === 'FODA y mitigaciones') return `## ${h}\nFortalezas: contrato existente; Oportunidades: reuso; Debilidades: gaps; Amenazas: aislamiento; NOW: reproducir y proteger.`;
    if (h === 'Evidencia y cierre') return `## ${h}\nLOCAL_UNIT: NOT_EXECUTED; PostgreSQL: NOT_EXECUTED. No afirmar PASS.`;
    if (h === 'Investigación y licencias') return `## ${h}\nhttps://www.postgresql.org/docs/17/ ; fecha y licencia revisadas.`;
    return `## ${h}\nContrato de ${h}: propietario, riesgo y prueba de cumplimiento.`;
  })
].join('\n\n');

test('complete specification is structurally ready, not a release PASS', () => {
  const result = analyzeTicket(specimen(), { domains: ['contabilidad', 'veterinaria', 'benchmark'] });
  assert.equal(result.status, 'SPEC_STRUCTURE_READY');
  assert.equal(result.acceptanceCriteria, 3);
  assert.equal(result.advisoryProfiles.length, 3);
  assert.equal(result.errors.length, 0);
  assert.match(result.note, /NOT a source review/);
});

test('missing scope, QA, security and other sections fail closed', () => {
  const result = analyzeTicket('# Ticket\n## Objetivo\nAlgo');
  assert.equal(result.status, 'SPEC_INCOMPLETE');
  for (const part of ['Fuera de alcance','QA y regresión','Seguridad y datos']) {
    assert.ok(result.errors.includes('MISSING_SECTION: ' + part));
  }
});

test('AC duplicate, missing expected outcome/test and missing negative/regression are rejected', () => {
  const broken = specimen().replace(/^- \[ \] AC-02 .*\n?/m, '')
    .replace('AC-03 [REGRESION] Dado', 'AC-01 [REGRESION] Dado')
    .replace('Prueba: PG17 contrato', 'sin referencia');
  const result = analyzeTicket(broken);
  assert.ok(result.errors.includes('DUPLICATE_AC: AC-01'));
  assert.ok(result.errors.includes('MISSING_AC_COVERAGE: NEGATIVO'));
  assert.ok(result.errors.includes('MISSING_TEST_MAPPING: AC-01'));
});

test('invalid domains do not silently select unrelated specialists', () => {
  const result = analyzeTicket(specimen(), { domains: ['medicina','desconocido'] });
  assert.ok(result.errors.includes('UNKNOWN_DOMAIN: desconocido'));
  assert.deepEqual(result.advisoryProfiles, ['.agents/agents/clinical-services-review.md']);
});

test('missing FODA, evidence and research provenance are visible failures', () => {
  const broken = specimen().replace('Fortalezas:', 'Puntos:')
    .replace('LOCAL_UNIT: NOT_EXECUTED; PostgreSQL: NOT_EXECUTED', 'LOCAL_UNIT: pendiente; PostgreSQL: pendiente')
    .replace('https://www.postgresql.org/docs/17/', 'sin URL');
  const r = analyzeTicket(broken);
  assert.ok(r.errors.includes('MISSING_FODA: Fortalezas'));
  assert.ok(r.errors.includes('MISSING_EVIDENCE_STATUS: mark unexecuted gates honestly'));
  assert.ok(r.errors.includes('MISSING_RESEARCH_PROVENANCE: URL or justified NO_APLICA'));
});

test('CLI strict exits nonzero on incomplete spec and reports only structural readiness', () => {
  const cli = spawnSync(process.execPath,['scripts/ticket-quality-gate.mjs','--file','AGENTS.md','--domains','erp','--strict','--json'],{encoding:'utf8'});
  assert.equal(cli.status,1);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.status,'SPEC_INCOMPLETE');
});

test('all recommended advisory profile files and policy owners are present', () => {
  const profiles = new Set(Object.values(DOMAIN_PROFILES).flat());
  for (const id of profiles) {
    const file = `.agents/agents/${id}.md`;
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source,new RegExp(`^id: ${id}$`,'m'));
    for (const header of ['Purpose','Triggers','Reads','Owns','Does not own','Required invariants','Expected outputs','Escalation / stop conditions']) {
      assert.ok(source.includes('## '+header),`${id} missing ${header}`);
    }
  }
  assert.ok(fs.readFileSync('AGENTS.md','utf8').includes('TICKET_ENGINEERING_PROTOCOL.md'));
  assert.ok(fs.readFileSync('.agents/TICKET_EXECUTION_POLICY.md','utf8').includes('ticket-quality-gate.mjs'));
});

test('argument parser requires file and rejects unknown flags', () => {
  assert.deepEqual(parseArgs(['--file','x.md','--domains','gym,erp','--strict']),{file:'x.md',strict:true,json:false,domains:['gym','erp']});
  assert.throws(() => parseArgs(['--unknown']),/INVALID_ARGUMENT/);
  assert.throws(() => parseArgs([]),/USAGE/);
});

test('fenced documentation examples cannot satisfy ticket headings or AC', () => {
  const example = '```md\n' + specimen() + '\n```';
  const result = analyzeTicket(example);
  assert.equal(result.status, 'SPEC_INCOMPLETE');
  assert.equal(result.acceptanceCriteria, 0);
  assert.ok(result.errors.includes('MISSING_SECTION: Objetivo'));
});
