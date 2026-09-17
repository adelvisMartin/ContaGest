import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_EXPECTED_ROUTES = 58;
const PROTECTED_BACKEND_DOMAINS = new Set([
  'accounting', 'approvals', 'banking', 'bank-reconciliation', 'commercial',
  'fiscal', 'inventory', 'payroll', 'purchases', 'rbac', 'sales', 'user-security'
]);
const OPTIONAL_VERTICAL_SEGMENTS = ['/verticals/', '/hipico-bot/'];

const uniq = (values) => [...new Set(values)];
const normalize = (value) => value.split(path.sep).join('/');

export function extractPageRegistryRoutes(source) {
  const start = source.indexOf('const pageRegistry={');
  const end = source.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('pageRegistry no encontrado en frontend/src/app.js');
  const block = source.slice(start, end + 3);
  const routes = [];
  const pattern = /(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\[/gm;
  for (const match of block.matchAll(pattern)) routes.push(match[1] || match[2] || match[3]);
  return routes;
}

export function extractVisualCatalogRoutes(source) {
  return [...source.matchAll(/\{\s*route:\s*'([^']+)'/g)].map((match) => match[1]);
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) seen.has(value) ? repeated.add(value) : seen.add(value);
  return [...repeated].sort();
}

export function compareRouteAuthorities(runtimeRoutes, visualRoutes, { expectedCount = DEFAULT_EXPECTED_ROUTES } = {}) {
  const errors = [];
  const runtimeDuplicates = duplicates(runtimeRoutes);
  const visualDuplicates = duplicates(visualRoutes);
  const runtimeSet = new Set(runtimeRoutes);
  const visualSet = new Set(visualRoutes);
  const missingFromVisual = [...runtimeSet].filter((route) => !visualSet.has(route)).sort();
  const missingFromRuntime = [...visualSet].filter((route) => !runtimeSet.has(route)).sort();

  if (runtimeRoutes.length !== expectedCount) errors.push(`runtime route count ${runtimeRoutes.length} != ${expectedCount}`);
  if (visualRoutes.length !== expectedCount) errors.push(`visual route count ${visualRoutes.length} != ${expectedCount}`);
  if (runtimeDuplicates.length) errors.push(`duplicate runtime routes: ${runtimeDuplicates.join(', ')}`);
  if (visualDuplicates.length) errors.push(`duplicate visual catalog routes: ${visualDuplicates.join(', ')}`);
  if (missingFromVisual.length) errors.push(`missing from visual catalog: ${missingFromVisual.join(', ')}`);
  if (missingFromRuntime.length) errors.push(`missing from runtime registry: ${missingFromRuntime.join(', ')}`);

  return { ok: errors.length === 0, errors };
}

function importSpecifiers(source) {
  const values = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) values.push(match[1]);
  return uniq(values);
}

function protectedDomainFor(filePath) {
  const normalized = normalize(filePath);
  const marker = '/backend/src/modules/';
  const index = normalized.indexOf(marker);
  if (index < 0) return null;
  const segment = normalized.slice(index + marker.length).split('/')[0];
  return PROTECTED_BACKEND_DOMAINS.has(segment) ? segment : null;
}

export function findForbiddenBackendDependencies(files) {
  const findings = [];
  for (const file of files) {
    if (!protectedDomainFor(file.path)) continue;
    for (const specifier of importSpecifiers(file.source)) {
      const normalizedSpecifier = `/${specifier.replaceAll('\\', '/')}/`;
      if (OPTIONAL_VERTICAL_SEGMENTS.some((segment) => normalizedSpecifier.includes(segment))) {
        findings.push(`${normalize(file.path)} imports optional vertical dependency ${specifier}`);
      }
    }
  }
  return findings.sort();
}

function walkSourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) continue;
      output.push({ path: absolute, source: fs.readFileSync(absolute, 'utf8') });
    }
  }
  return output;
}

export function auditRepositoryArchitecture(root, { expectedRouteCount = DEFAULT_EXPECTED_ROUTES } = {}) {
  const runtimePath = path.join(root, 'frontend', 'src', 'app.js');
  const catalogPath = path.join(root, 'qa', 'support', 'module-visual-catalog.mjs');
  const errors = [];

  if (!fs.existsSync(runtimePath)) errors.push('missing frontend/src/app.js');
  if (!fs.existsSync(catalogPath)) errors.push('missing qa/support/module-visual-catalog.mjs');
  if (errors.length) return { ok: false, runtimeRouteCount: 0, visualRouteCount: 0, errors };

  const runtimeRoutes = extractPageRegistryRoutes(fs.readFileSync(runtimePath, 'utf8'));
  const visualRoutes = extractVisualCatalogRoutes(fs.readFileSync(catalogPath, 'utf8'));
  const parity = compareRouteAuthorities(runtimeRoutes, visualRoutes, { expectedCount: expectedRouteCount });
  errors.push(...parity.errors);

  const backendFiles = walkSourceFiles(path.join(root, 'backend', 'src', 'modules'));
  errors.push(...findForbiddenBackendDependencies(backendFiles));

  return {
    ok: errors.length === 0,
    runtimeRouteCount: runtimeRoutes.length,
    visualRouteCount: visualRoutes.length,
    backendFilesScanned: backendFiles.length,
    errors
  };
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const result = auditRepositoryArchitecture(process.cwd());
  console.log(`Architecture audit: runtime=${result.runtimeRouteCount} visual=${result.visualRouteCount} backendFiles=${result.backendFilesScanned ?? 0}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}
