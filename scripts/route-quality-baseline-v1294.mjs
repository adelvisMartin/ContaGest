#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';
import { MODULE_VISUAL_CATALOG, VISUAL_VIEWPORTS } from '../qa/support/module-visual-catalog.mjs';

const EXPECTED_ROUTES = 60;
const PAGE_FILE = /^\.\/pages\/[A-Za-z0-9_-]+\.(?:js|jsx)$/;
const NOT_EXECUTED = 'NOT_EXECUTED';

export const ROUTE_PERFORMANCE_TARGETS = Object.freeze({
  percentile: 75, lcpMs: 2500, inpMs: 200, cls: 0.1
});

/**
 * Generates an evidence-ready *inventory*, never fabricated quality results.
 * PAGE_REGISTRY is the single runtime route authority; the visual catalog
 * supplies the existing family/risk classifications. No new route catalog.
 */
export function buildRouteQualityBaseline({
  registry = PAGE_REGISTRY,
  catalog = MODULE_VISUAL_CATALOG,
  viewports = VISUAL_VIEWPORTS,
  sourceExists = (file) => fs.existsSync(file)
} = {}) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry) ||
      !Array.isArray(catalog) || catalog.length !== EXPECTED_ROUTES) {
    throw new Error('ROUTE_MATRIX_INVALID_AUTHORITIES');
  }
  const registryNames = Object.keys(registry);
  const catalogNames = catalog.map((item) => item.route);
  if (registryNames.length !== EXPECTED_ROUTES ||
      new Set(catalogNames).size !== EXPECTED_ROUTES ||
      registryNames.some((route) => !catalogNames.includes(route))) {
    throw new Error('ROUTE_MATRIX_RUNTIME_VISUAL_DRIFT');
  }
  const rows = catalog.map((item) => {
    const binding = registry[item.route];
    if (!Array.isArray(binding) || binding.length !== 2 ||
        typeof binding[0] !== 'string' || !PAGE_FILE.test(binding[0]) ||
        typeof binding[1] !== 'string' || !/^[A-Za-z_$][\w$]*$/.test(binding[1])) {
      throw new Error('ROUTE_MATRIX_UNSAFE_PAGE_BINDING');
    }
    const ownerFile = path.posix.join('frontend/src', binding[0].slice(2));
    if (!sourceExists(ownerFile)) throw new Error('ROUTE_MATRIX_PAGE_SOURCE_MISSING');
    if (!item.family || !item.label || !['critical', 'high', 'medium', 'low'].includes(item.priority)) {
      throw new Error('ROUTE_MATRIX_UNCLASSIFIED_ROUTE');
    }
    return {
      route: item.route,
      family: item.family,
      sourcePage: ownerFile,
      pageExport: binding[1],
      risk: item.priority,
      refactorOwner: 'NOT_REVIEWED',
      debt: 'NOT_REVIEWED',
      sourceStatus: 'SOURCE_PRESENT',
      functionalJourney: NOT_EXECUTED,
      authorization: NOT_EXECUTED,
      browserE2e: NOT_EXECUTED,
      accessibility: NOT_EXECUTED,
      apiP95: null,
      lcpP75: null,
      inpP75: null,
      clsP75: null,
      performanceStatus: NOT_EXECUTED,
      issue: 1294,
      browserContract: 'qa/exhaustive-route-v164.spec.mjs',
      visualContract: 'qa/module-visual-deep-v12.spec.mjs'
    };
  });
  if (!Array.isArray(viewports) || ![360, 390, 430, 768, 1024, 1440]
    .every((width) => viewports.some((entry) => entry.width === width))) {
    throw new Error('ROUTE_MATRIX_VIEWPORT_DRIFT');
  }
  return {
    schemaVersion: 1294,
    authority: ['frontend/src/data/pageRegistry.js', 'qa/support/module-visual-catalog.mjs'],
    sourceReuse: 'NONE',
    routesExpected: EXPECTED_ROUTES,
    routesInventoried: rows.length,
    routesVerifiedInBrowser: 0,
    performanceMeasurements: 0,
    performanceTargets: ROUTE_PERFORMANCE_TARGETS,
    viewportWidths: viewports.map((entry) => entry.width),
    states: ['loading', 'empty', 'error', 'success', 'disabled', 'permission'],
    themes: ['light', 'dark'],
    allEvidence: NOT_EXECUTED,
    rows
  };
}

function main() {
  if (process.argv.length > 2) throw new Error('ROUTE_MATRIX_UNSUPPORTED_ARGUMENT');
  if (process.argv[2] && process.argv[2] !== '--check') throw new Error('ROUTE_MATRIX_UNSUPPORTED_ARGUMENT');
  const candidateSha = String(process.env.CANDIDATE_SHA || '').trim().toLowerCase();
  if (!/^[a-f\d]{40}$/.test(candidateSha)) throw new Error('ROUTE_MATRIX_CANDIDATE_SHA_REQUIRED');
  const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  if (candidateSha !== actualHead) throw new Error('ROUTE_MATRIX_SHA_MISMATCH');
  const baseline = buildRouteQualityBaseline();
  const directory = path.join('artifacts', 'qa', 'route-quality-v1294', candidateSha);
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, 'baseline.json');
  fs.writeFileSync(filename, JSON.stringify({ candidateSha, ...baseline }, null, 2) + '\n');
  process.stdout.write(JSON.stringify({
    candidateSha, file: filename, routes: baseline.routesInventoried,
    browserVerified: baseline.routesVerifiedInBrowser,
    performanceMeasured: baseline.performanceMeasurements,
    evidenceStatus: baseline.allEvidence
  }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); }
  catch (error) { process.stderr.write('ROUTE_MATRIX_BLOCKED: ' + error.message + '\n'); process.exitCode = 1; }
}
