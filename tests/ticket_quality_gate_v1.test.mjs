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
    if (h === 'FODA y mitigaciones') return `## ${h}\nFortalezas: contrato existente; Oportunidades: reuso; Debilidades: gaps; Amenazas: aislamiento; Mitigación: NOW: reproducir y proteger.`;
    if (h === 'Rendimiento y cargas') return `## ${h}\nBaseline: NOT_EXECUTED en PG17; objetivo: p95 250 ms en fixture sintético.`;
    if (h === 'Evidencia y cierre') return `## ${h}\nLOCAL_UNIT: NOT_EXECUTED; PostgreSQL: NOT_EXECUTED. No afirmar PASS.`;
    if (h === 'Investigación y licencias') return `## ${h}\nFuente: https://www.postgresql.org/docs/17/ ; Fecha: 2026-11-19; licencia y procedencia revisadas.`;
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


test('domain aliases for costs, banking, security and Hípico route to existing expert profiles', () => {
  const result = analyzeTicket(specimen(), { domains: ['Hoja de Trabajo', 'Punto de Equilibrio', 'Conciliaciones Bancarias', 'Ciberseguridad', 'Control Hípico', 'Investigación competitiva', 'Estructura de Costos'] });
  assert.equal(result.status, 'SPEC_STRUCTURE_READY', result.errors.join('; '));
  assert.deepEqual(result.advisoryProfiles, [
    '.agents/agents/clinical-services-review.md',
    '.agents/agents/competitive-intelligence-review.md',
    '.agents/agents/financial-domain-review.md',
    '.agents/agents/infra-telecom-performance-review.md'
  ]);
});

test('duplicate sections and empty placeholders fail instead of hiding conflicting requirements', () => {
  const result = analyzeTicket(specimen() + '\n## Objetivo\nOtra definición incompatible');
  assert.ok(result.errors.includes('DUPLICATE_SECTION: objetivo'));
  const blank = analyzeTicket(specimen().replace('Contrato de Fuera de alcance: propietario, riesgo y prueba de cumplimiento.', 'TODO'));
  assert.ok(blank.errors.includes('PLACEHOLDER_SECTION: Fuera de alcance'));
});

test('unverifiable acceptance, missing date and performance baseline are explicit errors', () => {
  const bad = specimen().replace('Entonces persiste solo A', 'Entonces funciona')
    .replace('Prueba: tenant B API', 'Prueba: ...')
    .replace('Fecha: 2026-11-19', 'Fecha: pendiente')
    .replace('Baseline: NOT_EXECUTED', 'Rendimiento: NOT_EXECUTED');
  const result = analyzeTicket(bad);
  for (const expected of ['UNVERIFIABLE_AC: AC-01', 'MISSING_TEST_MAPPING: AC-02', 'MISSING_RESEARCH_DATE: YYYY-MM-DD required', 'MISSING_PERFORMANCE_BASELINE']) {
    assert.ok(result.errors.includes(expected), expected);
  }
});

test('HTML comment cannot contain a required heading; fenced AC cannot count', () => {
  const commented = specimen().replace('## Objetivo\nContrato de Objetivo:', '<!--\n## Objetivo\nContrato de Objetivo:')
    .replace('## Alcance\n', '-->\n## Alcance\n');
  assert.ok(analyzeTicket(commented).errors.includes('MISSING_SECTION: Objetivo'));
  const acCommented = specimen().replace('## Criterios de aceptación\n', '## Criterios de aceptación\n' + '\x60\x60\x60md\n')
    .replace('## UX/UI y accesibilidad', '\x60\x60\x60\n## UX/UI y accesibilidad');
  assert.equal(analyzeTicket(acCommented).acceptanceCriteria, 0);
});

test('10,000 deterministic specification scenarios: fail closed or report only structural readiness', () => {
  let ready = 0, blocked = 0;
  const unique = new Set();
  for (let i = 0; i < 10_000; i++) {
    const mode = i % 10;
    let input = specimen().replace('Contrato de Objetivo:', 'Caso sintético ' + i + ': contrato de Objetivo:');
    if (mode === 0) input = input.replace('## Objetivo\n', '## Objetivo ausente\n');
    else if (mode === 1) input = input.replace('Contrato de Fuera de alcance: propietario, riesgo y prueba de cumplimiento.', 'TODO');
    else if (mode === 2) input += '\n## Objetivo\nConflicto';
    else if (mode === 3) input = input.replace(/^\- \[ \] AC-02 .*\n?/m, '');
    else if (mode === 4) input = input.replace('AC-03 [REGRESION]', 'AC-03 [POSITIVO]');
    else if (mode === 5) input = input.replace('Prueba: PG17 contrato', 'Prueba: ...');
    else if (mode === 6) input = input.replace('Fortalezas:', 'UNKNOWN:');
    else if (mode === 7) input = input.replace('Fecha: 2026-11-19', 'Fecha: N/A');
    else if (mode === 8) input = input.replace('Baseline: NOT_EXECUTED', 'Baseline: NOT_EXECUTED para equipo móvil');
    else input = input.replace('AC-01 [POSITIVO]', 'AC-01 [POSITIVO]');
    assert.ok(!unique.has(input), 'duplicate fixture ' + i);
    unique.add(input);
    const result = analyzeTicket(input, { domains: i % 2 ? ['Gym', 'ERP'] : ['Punto de Equilibrio'] });
    if (mode >= 8) {
      assert.equal(result.status, 'SPEC_STRUCTURE_READY', 'case ' + i + ': ' + result.errors.join('; '));
      ready++;
    } else {
      assert.equal(result.status, 'SPEC_INCOMPLETE', 'case ' + i + ' incorrectly ready');
      blocked++;
    }
  }
  assert.equal(unique.size, 10_000);
  assert.equal(ready, 2_000);
  assert.equal(blocked, 8_000);
});

test('accented regression is accepted and impossible calendar research dates are denied', () => {
  const accented = specimen().replace('[REGRESION]', '[REGRESIÓN]');
  assert.equal(analyzeTicket(accented).status, 'SPEC_STRUCTURE_READY');
  const fakeDate = accented.replace('2026-11-19', '2026-02-30');
  assert.ok(analyzeTicket(fakeDate).errors.includes('MISSING_RESEARCH_DATE: YYYY-MM-DD required'));
});
