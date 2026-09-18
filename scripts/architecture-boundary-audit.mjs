import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_EXPECTED_ROUTES = 58;
const OPTIONAL_PACK_MODULES = new Set(['verticals', 'food', 'hipico', 'hipico-bot']);
const OPTIONAL_PACK_FAMILIES = new Map([
  ['verticals', 'verticals'],
  ['food', 'food'],
  ['hipico', 'hipico'],
  ['hipico-bot', 'hipico']
]);

const ROUTE_MANIFEST_ALLOWED_DOMAINS = new Set(['platform', 'financial', 'commercial', 'operations', 'vertical']);
export const ROUTE_MANIFEST_DUPLICATE_PATH_ALLOWLIST = new Map([
  ['/commercial', ['service-restrictions', 'commercial']],
  ['/verticals', ['vertical-core', 'veterinary-crud', 'vertical-extended']]
]);
export const ROUTE_MANIFEST_EXPECTED_ORDER = Object.freeze([
  'tenants','clients','suppliers','products','bank-accounts','employees','tax-periods','sales','purchases','payables',
  'approvals','accounting','reports','modules','currency','exports','chart-accounts','hr','banking','bank-reconciliation',
  'inventory','payroll','tasks','fiscal','analytics','qr','food','notifications','maps','ai','demos','pretesting',
  'licenses','license-devices','service-restrictions','commercial','commercial-access','imports','regulatory','rules','rbac',
  'user-security','vertical-core','veterinary-crud','vertical-extended','veterinary','media'
]);

const uniq = (values) => [...new Set(values)];
const normalize = (value) => value.split(path.sep).join('/');

export function extractPageRegistryRoutes(source) {
  const markers = ['export const PAGE_REGISTRY = {', 'const pageRegistry={'];
  const start = markers.map((marker) => source.indexOf(marker)).find((index) => index >= 0) ?? -1;
  const end = source.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('page registry authority no encontrada');
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

function routeManifestImports(source) {
  const imports = new Map();
  const pattern = /^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
  for (const match of source.matchAll(pattern)) imports.set(match[1], match[2]);
  return imports;
}

export function extractRouteManifestEntries(source) {
  const imports = routeManifestImports(source);
  const entries = [];
  const pattern = /^\s*\{\s*id:\s*'([^']+)',\s*domain:\s*'([^']+)',\s*path:\s*'([^']+)',\s*router:\s*(.+?)\s*\},?\s*$/gm;
  for (const match of source.matchAll(pattern)) {
    const routerExpression = match[4].trim();
    const routerName = /^[A-Za-z_$][\w$]*$/.test(routerExpression) ? routerExpression : null;
    entries.push({
      id: match[1],
      domain: match[2],
      path: match[3],
      routerExpression,
      routerName,
      importSource: routerName ? imports.get(routerName) ?? null : null
    });
  }
  return entries;
}

function validRouteManifestPath(value) {
  return value === '/' || /^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(value);
}

function optionalPackImportSource(specifier) {
  return typeof specifier === 'string' && /^\.\/(?:verticals|food|hipico|hipico-bot)(?:\/|$)/.test(specifier);
}

export function validateRouteManifestSource(
  source,
  {
    expectedOrder = ROUTE_MANIFEST_EXPECTED_ORDER,
    duplicatePathAllowlist = ROUTE_MANIFEST_DUPLICATE_PATH_ALLOWLIST
  } = {}
) {
  const errors = [];
  const entries = extractRouteManifestEntries(source);
  const declarationCount = [...source.matchAll(/^\s*\{\s*id:\s*'[^']+'/gm)].length;

  if (entries.length !== declarationCount) {
    errors.push(`unparseable route manifest entries: parsed ${entries.length} of ${declarationCount}`);
  }

  const duplicateIds = duplicates(entries.map((entry) => entry.id));
  if (duplicateIds.length) errors.push(`duplicate route manifest ids: ${duplicateIds.join(', ')}`);

  for (const entry of entries) {
    if (!ROUTE_MANIFEST_ALLOWED_DOMAINS.has(entry.domain)) {
      errors.push(`${entry.id}: invalid route manifest domain ${entry.domain}`);
    }
    if (!validRouteManifestPath(entry.path)) {
      errors.push(`${entry.id}: invalid route manifest path ${entry.path}`);
    }
    if (optionalPackImportSource(entry.importSource) && entry.domain !== 'vertical') {
      errors.push(`${entry.id}: optional-pack router ${entry.routerName} must use vertical domain`);
    }
    if (entry.domain === 'vertical' && entry.importSource && !optionalPackImportSource(entry.importSource)) {
      errors.push(`${entry.id}: vertical domain cannot mount core router ${entry.routerName}`);
    }
  }

  const idsByPath = new Map();
  for (const entry of entries) {
    const ids = idsByPath.get(entry.path) ?? [];
    ids.push(entry.id);
    idsByPath.set(entry.path, ids);
  }
  for (const [mountPath, ids] of idsByPath) {
    if (ids.length < 2) continue;
    const allowed = duplicatePathAllowlist.get(mountPath);
    if (!allowed) {
      errors.push(`undocumented duplicate mount ${mountPath}: ${ids.join(', ')}`);
      continue;
    }
    if (ids.length !== allowed.length || ids.some((id, index) => id !== allowed[index])) {
      errors.push(`duplicate mount ${mountPath} order [${ids.join(', ')}] != [${allowed.join(', ')}]`);
    }
  }

  if (expectedOrder) {
    const actualOrder = entries.map((entry) => entry.id);
    if (actualOrder.length !== expectedOrder.length || actualOrder.some((id, index) => id !== expectedOrder[index])) {
      errors.push(`route manifest order drift: [${actualOrder.join(', ')}]`);
    }
  }

  return { ok: errors.length === 0, entryCount: entries.length, errors };
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

function moduleSegmentFor(filePath) {
  const normalized = normalize(filePath);
  const marker = '/backend/src/modules/';
  const index = normalized.indexOf(marker);
  if (index < 0) return null;
  const tail = normalized.slice(index + marker.length);
  if (!tail.includes('/')) return null;
  return tail.split('/')[0] || null;
}

function protectedDomainFor(filePath) {
  const segment = moduleSegmentFor(filePath);
  return segment && !OPTIONAL_PACK_MODULES.has(segment) ? segment : null;
}

function relativeImportTargetModule(filePath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const absoluteTarget = path.resolve(path.dirname(filePath), specifier);
  return moduleSegmentFor(absoluteTarget);
}

function isTestOnlySource(filePath) {
  return /\.(?:test|integration)\.(?:ts|tsx|js|mjs)$/.test(normalize(filePath));
}

export function findForbiddenBackendDependencies(files) {
  const findings = [];
  for (const file of files) {
    if (isTestOnlySource(file.path) || !protectedDomainFor(file.path)) continue;
    for (const specifier of importSpecifiers(file.source)) {
      const targetModule = relativeImportTargetModule(file.path, specifier);
      if (targetModule && OPTIONAL_PACK_MODULES.has(targetModule)) {
        findings.push(`${normalize(file.path)} imports optional vertical dependency ${specifier}`);
      }
    }
  }
  return findings.sort();
}

export function findForbiddenOptionalPackDependencies(files) {
  const findings = [];
  for (const file of files) {
    if (isTestOnlySource(file.path)) continue;
    const sourceModule = moduleSegmentFor(file.path);
    const sourceFamily = sourceModule ? OPTIONAL_PACK_FAMILIES.get(sourceModule) : null;
    if (!sourceFamily) continue;

    for (const specifier of importSpecifiers(file.source)) {
      const targetModule = relativeImportTargetModule(file.path, specifier);
      if (!targetModule) continue;
      const targetFamily = OPTIONAL_PACK_FAMILIES.get(targetModule);
      if (targetFamily === sourceFamily) continue;
      findings.push(`${normalize(file.path)} imports ERP implementation dependency ${specifier}`);
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
  const registryPath = path.join(root, 'frontend', 'src', 'data', 'pageRegistry.js');
  const catalogPath = path.join(root, 'qa', 'support', 'module-visual-catalog.mjs');
  const manifestPath = path.join(root, 'backend', 'src', 'modules', 'route-manifest.ts');
  const errors = [];

  if (!fs.existsSync(registryPath)) errors.push('missing frontend/src/data/pageRegistry.js');
  if (!fs.existsSync(catalogPath)) errors.push('missing qa/support/module-visual-catalog.mjs');
  if (!fs.existsSync(manifestPath)) errors.push('missing backend/src/modules/route-manifest.ts');
  if (errors.length) return { ok: false, runtimeRouteCount: 0, visualRouteCount: 0, routeManifestEntries: 0, errors };

  const runtimeRoutes = extractPageRegistryRoutes(fs.readFileSync(registryPath, 'utf8'));
  const visualRoutes = extractVisualCatalogRoutes(fs.readFileSync(catalogPath, 'utf8'));
  const parity = compareRouteAuthorities(runtimeRoutes, visualRoutes, { expectedCount: expectedRouteCount });
  errors.push(...parity.errors);

  const manifestAudit = validateRouteManifestSource(fs.readFileSync(manifestPath, 'utf8'));
  errors.push(...manifestAudit.errors);

  const backendFiles = walkSourceFiles(path.join(root, 'backend', 'src', 'modules'));
  errors.push(...findForbiddenBackendDependencies(backendFiles));
  errors.push(...findForbiddenOptionalPackDependencies(backendFiles));

  return {
    ok: errors.length === 0,
    runtimeRouteCount: runtimeRoutes.length,
    visualRouteCount: visualRoutes.length,
    routeManifestEntries: manifestAudit.entryCount,
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
  console.log(`Architecture audit: runtime=${result.runtimeRouteCount} visual=${result.visualRouteCount} manifest=${result.routeManifestEntries ?? 0} backendFiles=${result.backendFilesScanned ?? 0}`);
  if (!result.ok) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  }
}
