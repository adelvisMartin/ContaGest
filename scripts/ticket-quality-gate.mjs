#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The specification gate checks structure, NOT whether a feature is implemented.
export const REQUIRED_SECTIONS = Object.freeze([
  'Contexto y evidencia', 'Objetivo', 'Alcance', 'Fuera de alcance',
  'Dependencias y ownership', 'Flujo y arquitectura', 'Criterios de aceptación',
  'UX/UI y accesibilidad', 'QA y regresión', 'Rendimiento y cargas',
  'Seguridad y datos', 'FODA y mitigaciones', 'Investigación y licencias',
  'Plan de implementación', 'Evidencia y cierre'
]);

export const DOMAIN_PROFILES = Object.freeze({
  contabilidad: ['financial-domain-review'],
  administracion: ['financial-domain-review'],
  erp: ['financial-domain-review'],
  crm: ['financial-domain-review'],
  compras: ['financial-domain-review'],
  ventas: ['financial-domain-review'],
  inventario: ['financial-domain-review'],
  kpi: ['financial-domain-review'],
  costos: ['financial-domain-review'],
  conciliacion: ['financial-domain-review'],
  'hoja-trabajo': ['financial-domain-review'],
  'hoja-de-trabajo': ['financial-domain-review'],
  'estructura-de-costos': ['financial-domain-review'],
  'punto-de-equilibrio': ['financial-domain-review'],
  'conciliaciones-bancarias': ['financial-domain-review'],
  bancos: ['financial-domain-review'],
  'ventas-y-compras': ['financial-domain-review'],
  reportes: ['financial-domain-review'],
  'estados-financieros': ['financial-domain-review'],
  gym: ['clinical-services-review'],
  veterinaria: ['clinical-services-review'],
  odontologia: ['clinical-services-review'],
  medicina: ['clinical-services-review'],
  hipico: ['clinical-services-review'],
  'control-hipico': ['clinical-services-review'],
  fitness: ['clinical-services-review'],
  salud: ['clinical-services-review'],
  clinica: ['clinical-services-review'],
  seguridad: ['infra-telecom-performance-review'],
  ciberseguridad: ['infra-telecom-performance-review'],
  redes: ['infra-telecom-performance-review'],
  devops: ['infra-telecom-performance-review'],
  'ux-ui': ['infra-telecom-performance-review'],
  infraestructura: ['infra-telecom-performance-review'],
  telecomunicaciones: ['infra-telecom-performance-review'],
  rendimiento: ['infra-telecom-performance-review'],
  frontend: ['infra-telecom-performance-review'],
  backend: ['infra-telecom-performance-review'],
  qa: ['infra-telecom-performance-review'],
  benchmark: ['competitive-intelligence-review'],
  scraping: ['competitive-intelligence-review'],
  'investigacion-competitiva': ['competitive-intelligence-review']
});

function normalized(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function normalizedDomain(value) {
  return normalized(value).replace(/[_\s]+/g, '-').replace(/-+/g, '-');
}

const PLACEHOLDER = /(?:\b(?:TODO|TBD|POR DEFINIR|PENDIENTE DE DEFINIR|LOREM IPSUM)\b|<[^>\n]{2,90}>|\.{3,})/i;
const AC_PREFIX = /^\s*- \[ \] (AC-\d+)\b/i;

function parseSections(body) {
  const sections = new Map();
  const duplicates = new Set();
  let active = null;
  let fence = null;
  let comment = false;
  for (const line of String(body).split(/\r?\n/)) {
    const withoutComments = line.replace(/<!--(?:(?!-->).)*-->/g, '');
    if (comment) {
      if (withoutComments.includes('-->')) comment = false;
      else continue;
      continue; // A comment ending mid-line cannot claim readiness.
    }
    if (withoutComments.includes('<!--')) {
      if (!withoutComments.includes('-->')) comment = true;
      continue;
    }
    const delimiter = /^\s*(`{3,}|~{3,})/.exec(withoutComments);
    if (delimiter) {
      const symbol = delimiter[1][0];
      if (!fence) fence = { symbol, size: delimiter[1].length };
      else if (symbol === fence.symbol && delimiter[1].length >= fence.size) fence = null;
      continue;
    }
    if (fence) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(withoutComments);
    if (heading) {
      active = normalized(heading[1]);
      if (sections.has(active)) duplicates.add(active);
      else sections.set(active, []);
    } else if (active) {
      sections.get(active).push(withoutComments);
    }
  }
  return { sections, duplicates };
}

export function analyzeTicket(markdown, { domains = [] } = {}) {
  const errors = [];
  const { sections, duplicates } = parseSections(markdown);
  const selected = [...new Set(domains.map(normalizedDomain).filter(Boolean))];
  for (const name of duplicates) errors.push(`DUPLICATE_SECTION: ${name}`);
  for (const domain of selected) {
    if (!Object.hasOwn(DOMAIN_PROFILES, domain)) errors.push(`UNKNOWN_DOMAIN: ${domain}`);
  }
  for (const label of REQUIRED_SECTIONS) {
    const content = sections.get(normalized(label));
    if (!content || !content.some(line => line.trim())) {
      errors.push(`MISSING_SECTION: ${label}`);
    } else if (content.every(line => !line.trim() || PLACEHOLDER.test(line))) {
      errors.push(`PLACEHOLDER_SECTION: ${label}`);
    }
  }
  const acLines = sections.get(normalized('Criterios de aceptación'))?.filter(line => AC_PREFIX.test(line)) || [];
  if (sections.has(normalized('Criterios de aceptación'))) {
    const seen = new Set();
    const kinds = new Set();
    for (const line of acLines) {
      const id = AC_PREFIX.exec(line)?.[1].toUpperCase();
      if (seen.has(id)) errors.push(`DUPLICATE_AC: ${id}`);
      seen.add(id);
      const kind = /\[(POSITIVO|NEGATIVO|REGRESI[OÓ]N)\]/i.exec(line)?.[1]?.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (kind) kinds.add(kind);
      else errors.push(`MISSING_AC_KIND: ${id}`);
      if (!/\bDado\b.+\bCuando\b.+\bEntonces\b.+/i.test(line)) errors.push(`MISSING_GWT: ${id}`);
      const mapping = /\bPrueba:\s*(.*)$/i.exec(line)?.[1]?.trim() || '';
      if (!mapping || PLACEHOLDER.test(mapping) || mapping.length < 8) errors.push(`MISSING_TEST_MAPPING: ${id}`);
      if (PLACEHOLDER.test(line) || /\bEntonces\s+(?:ok|funciona|correcto|bien|listo|pasa)\b/i.test(line)) {
        errors.push(`UNVERIFIABLE_AC: ${id}`);
      }
    }
    if (acLines.length < 3) errors.push('AC_COUNT: at least three traceable criteria required');
    for (const kind of ['POSITIVO', 'NEGATIVO', 'REGRESION']) {
      if (!kinds.has(kind)) errors.push(`MISSING_AC_COVERAGE: ${kind}`);
    }
  }
  const foda = sections.get(normalized('FODA y mitigaciones'))?.join('\n') || '';
  for (const item of ['Fortalezas', 'Oportunidades', 'Debilidades', 'Amenazas']) {
    if (!new RegExp(`\\b${item}\\s*:`, 'i').test(foda)) errors.push(`MISSING_FODA: ${item}`);
  }
  if (!/(Mitigaci[oó]n|NOW|FOLLOW_UP|FOLLOW-UP|REJECT)\s*:/i.test(foda)) errors.push('MISSING_FODA_ACTION: mitigation and decision required');
  const evidence = sections.get(normalized('Evidencia y cierre'))?.join('\n') || '';
  if (!/NOT_EXECUTED|NO_EJECUTADO/i.test(evidence)) errors.push('MISSING_EVIDENCE_STATUS: mark unexecuted gates honestly');
  const research = sections.get(normalized('Investigación y licencias'))?.join('\n') || '';
  if (!/(https:\/\/|NO_APLICA)/i.test(research)) errors.push('MISSING_RESEARCH_PROVENANCE: URL or justified NO_APLICA');
  if (!/(licencia|copyright|provenance|procedencia)/i.test(research)) errors.push('MISSING_LICENSE_REVIEW');
  const dates = [...research.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(match => match[1]);
  const validDate = dates.some(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(`${value}T`);
  });
  if (/https:\/\//.test(research) && !validDate) errors.push('MISSING_RESEARCH_DATE: YYYY-MM-DD required');
  if (/\bNO_APLICA\b/.test(research) && !/NO_APLICA\s*:\s*.{12,}/i.test(research)) errors.push('UNJUSTIFIED_RESEARCH_EXCLUSION');
  const perf = sections.get(normalized('Rendimiento y cargas'))?.join('\n') || '';
  if (!/\bbaseline\b|\blinea base\b|\bNO_APLICA\s*:/i.test(perf)) errors.push('MISSING_PERFORMANCE_BASELINE');
  if (!/\b(p95|LCP|INP|CLS|latencia|milisegundos|ms|\d+\s*(?:s|MB))\b|\bNO_APLICA\s*:/i.test(perf)) errors.push('MISSING_MEASURABLE_PERFORMANCE');
  const profiles = [...new Set(selected.flatMap(domain => DOMAIN_PROFILES[domain] || []))].sort();
  return { status: errors.length ? 'SPEC_INCOMPLETE' : 'SPEC_STRUCTURE_READY',
    note: 'Document structure only; NOT a source review, QA execution, security certification or release approval.',
    domains: selected, advisoryProfiles: profiles.map(id => `.agents/agents/${id}.md`),
    acceptanceCriteria: acLines.length,
    errors };
}

export function parseArgs(args) {
  let file = '', strict = false, json = false, domains = [];
  for (let i = 0; i < args.length; i++) {
    const item = args[i];
    if (item === '--file' && args[i + 1]) file = args[++i];
    else if (item === '--domains' && args[i + 1]) domains = args[++i].split(',');
    else if (item === '--strict') strict = true;
    else if (item === '--json') json = true;
    else throw new Error(`INVALID_ARGUMENT: ${item}`);
  }
  if (!file) throw new Error('USAGE: --file <ticket.md> [--domains erp,seguridad] [--strict] [--json]');
  return { file, strict, json, domains };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    const { file, strict, json, domains } = parseArgs(process.argv.slice(2));
    const result = analyzeTicket(readFileSync(file, 'utf8'), { domains });
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${result.status}: ${result.acceptanceCriteria} AC; reviews=${result.advisoryProfiles.join(',') || 'none'}`);
      for (const error of result.errors) console.error(`- ${error}`);
      console.log(result.note);
    }
    if (strict && result.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
