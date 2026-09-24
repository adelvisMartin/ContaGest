import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const outDir = path.join(root, 'artifacts', 'qa');
const stylesDir = path.join(root, 'frontend', 'src', 'styles');
const runtimeFile = path.join(stylesDir, 'erp-runtime.css');
const indexFile = path.join(root, 'frontend', 'index.html');
const layoutFile = path.join(root, 'frontend', 'src', 'components', 'layout.js');

const CANONICAL_STYLE_FILES = new Set([
  'contagest-visual-system-v12.css',
  'erp-runtime.css',
  'module-adapters.css',
  'runtime-primitives-v13.css',
  'shell-contract.css',
  'shell-stability-v1127.css'
]);

const ALLOWED_RUNTIME_IMPORTS = [
  './shell-contract.css',
  './shell-stability-v1127.css',
  './runtime-primitives-v13.css',
  './module-adapters.css',
  './contagest-visual-system-v12.css'
];

const RETIRED_THEME_NAMES = [
  'sector','enterprise','executive','finance','sky','soft-blue','spectrum','ocean','forest','celestial'
];

const exists = (file) => fs.existsSync(file);
const read = (file) => fs.readFileSync(file, 'utf8');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const count = (source, regex) => [...String(source).matchAll(regex)].length;
const normalizeSpace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const escapeCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

function walk(dir, predicate = () => true) {
  if (!exists(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(target, predicate));
    else if (predicate(target)) files.push(target);
  }
  return files;
}

function extractPageRegistry() {
  const source = read(path.join(root, 'frontend', 'src', 'data', 'pageRegistry.js'));
  const start = source.indexOf('export const PAGE_REGISTRY = {');
  const end = source.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('No se pudo leer frontend/src/data/pageRegistry.js');

  const block = source.slice(start, end + 3);
  const entries = [];
  const pattern = /(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for (const match of block.matchAll(pattern)) {
    entries.push({ route:match[1] || match[2] || match[3], file:match[4], exportName:match[5] });
  }
  return entries;
}

function stripPrintOnlyStyles(source) {
  return String(source).replace(/<style\b[^>]*data-cg-print-only[^>]*>[\s\S]*?<\/style>/gi, '');
}

function auditPage(entry) {
  const file = path.join(root, 'frontend', 'src', 'pages', entry.file);
  const catalog = MODULE_VISUAL_CATALOG.find((item) => item.route === entry.route);
  const findings = [];
  const add = (severity, code, detail) => findings.push({ severity, code, detail });

  if (!exists(file)) {
    add('critical', 'missing-page', `No existe ${rel(file)}`);
    return {
      ...entry,
      family:catalog?.family || 'other',
      priority:catalog?.priority || 'high',
      exists:false,
      score:0,
      kit:false,
      metrics:{},
      findings
    };
  }

  const source = read(file);
  const runtimeSource = stripPrintOnlyStyles(source);
  const metrics = {
    printOnlyStyleBlocks:count(source, /<style\b[^>]*data-cg-print-only[^>]*>/gi),
    styleBlocks:count(runtimeSource, /<style\b/gi),
    inlineStyles:count(runtimeSource, /\bstyle\s*=\s*["'`]/g),
    localCssImports:count(source, /import\s+[^;]*['"][^'"]*[.]css['"]/g),
    rawTables:count(runtimeSource, /<table\b/gi),
    rawForms:count(runtimeSource, /<form\b/gi),
    rawControls:count(runtimeSource, /<(?:input|select|textarea)\b/gi),
    rawButtons:count(runtimeSource, /<button\b/gi),
    hardFont:count(runtimeSource, /font-size\s*:\s*(?:clamp\([^)]*\)|\d+(?:\.\d+)?(?:px|rem))/gi),
    hardWidth:count(runtimeSource, /(?:min-|max-)?width\s*:\s*\d{2,}(?:px|rem)/gi),
    hardColor:count(runtimeSource, /#[0-9a-f]{3,8}\b/gi),
    absolute:count(runtimeSource, /position\s*:\s*(?:absolute|fixed)/gi),
    materialSymbols:count(runtimeSource, /material-symbols|material-icons/gi),
    formIds:[...runtimeSource.matchAll(/<form\b[^>]*\bid=["']([^"']+)["']/gi)].map((m) => m[1]),
    submitBindings:[...source.matchAll(/mountSubmit\(['"]#([^'"]+)['"]/g)].map((m) => m[1])
  };

  const kit = /components\/ui\/index\.js/.test(source);
  const legacyDs = /components\/designSystem\.js/.test(source);

  if (metrics.styleBlocks) add('critical', 'runtime-style-block', `${metrics.styleBlocks} bloque(s) <style> afectan la UI runtime.`);
  if (metrics.localCssImports) add('critical', 'page-css-import', `${metrics.localCssImports} import(s) CSS desde la página.`);
  if (metrics.inlineStyles) add('medium', 'inline-style', `${metrics.inlineStyles} style= inline.`);
  if (metrics.hardFont) add('medium', 'hardcoded-font-size', `${metrics.hardFont} tamaño(s) definidos en markup/runtime.`);
  if (metrics.hardWidth) add('medium', 'fixed-width', `${metrics.hardWidth} ancho(s) rígido(s) definidos en markup/runtime.`);
  if (metrics.hardColor) add('medium', 'hardcoded-color', `${metrics.hardColor} color(es) hex definidos en la vista.`);
  if (metrics.absolute) add('medium', 'absolute-layout', `${metrics.absolute} layout(s) absolute/fixed.`);
  if (legacyDs) add('medium', 'legacy-design-system', 'Importa designSystem.js en lugar del kit canónico.');
  if (!kit && (metrics.rawForms || metrics.rawTables || metrics.rawButtons || metrics.rawControls)) {
    add('medium', 'kit-adoption', `UI operativa sin kit directo (forms:${metrics.rawForms}, tables:${metrics.rawTables}, controls:${metrics.rawControls}, buttons:${metrics.rawButtons}).`);
  }
  if (metrics.materialSymbols) add('low', 'icon-family', `${metrics.materialSymbols} referencia(s) Material Icons/Symbols.`);

  for (const formId of metrics.formIds) {
    const direct = new RegExp(`getElementById\\(['"]${formId}['"]\\)[\\s\\S]{0,260}?addEventListener\\(['"]submit`).test(source);
    const query = new RegExp(`querySelector\\(['"]#${formId}['"]\\)[\\s\\S]{0,260}?addEventListener\\(['"]submit`).test(source);
    if (!metrics.submitBindings.includes(formId) && !direct && !query) {
      add('high', 'unbound-form', `El formulario #${formId} no muestra binding submit estático.`);
    }
  }

  const weights = { critical:30, high:16, medium:6, low:2 };
  return {
    ...entry,
    family:catalog?.family || 'other',
    priority:catalog?.priority || 'medium',
    exists:true,
    path:rel(file),
    bytes:Buffer.byteLength(source),
    score:Math.max(0, 100 - findings.reduce((sum, item) => sum + (weights[item.severity] || 0), 0)),
    kit,
    metrics,
    findings
  };
}

function cssImports(file) {
  const imports = [];
  for (const match of read(file).matchAll(/@import\s+(?:url\()?['"]([^'"]+[.]css)['"]/g)) {
    if (/^(?:https?:)?\/\//.test(match[1])) continue;
    imports.push(match[1]);
  }
  return imports;
}

function activeCssGraph(entry) {
  const visited = new Set();
  const visit = (file) => {
    const absolute = path.resolve(file);
    if (visited.has(absolute) || !exists(absolute)) return;
    visited.add(absolute);
    for (const imported of cssImports(absolute)) {
      visit(path.resolve(path.dirname(absolute), imported));
    }
  };
  visit(entry);
  return [...visited];
}

function extractSelectors(source) {
  const clean = String(source).replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const raw = normalizeSpace(match[1]);
    if (!raw || raw.startsWith('@') || raw.includes('from ') || raw.includes('to ')) continue;
    for (const selector of raw.split(',').map(normalizeSpace).filter(Boolean)) {
      if (selector.length <= 260) selectors.push(selector);
    }
  }
  return selectors;
}

function auditCss() {
  const allCss = walk(stylesDir, (file) => file.endsWith('.css'));
  const active = activeCssGraph(runtimeFile);
  // Do not pass path.resolve directly to Array.map: map supplies index/array as
  // extra arguments and Node 22 correctly rejects those as invalid path values.
  const activeSet = new Set(active.map((file) => path.resolve(file)));
  const runtimeImports = cssImports(runtimeFile);
  const forbiddenRuntimeImports = runtimeImports.filter((item) => !ALLOWED_RUNTIME_IMPORTS.includes(item));
  const missingRuntimeImports = ALLOWED_RUNTIME_IMPORTS.filter((item) => !runtimeImports.includes(item));
  const runtimeOrderOk = JSON.stringify(runtimeImports) === JSON.stringify(ALLOWED_RUNTIME_IMPORTS);
  const unexpectedCss = allCss.filter((file) => !CANONICAL_STYLE_FILES.has(path.basename(file))).map(rel);
  const missingCanonical = [...CANONICAL_STYLE_FILES].filter((name) => !exists(path.join(stylesDir, name)));
  const legacyDirectoryFiles = walk(path.join(stylesDir, 'legacy'), (file) => file.endsWith('.css')).map(rel);
  const selectorOwners = new Map();
  const tokenOwners = new Map();
  const digestOwners = new Map();
  const files = [];

  for (const file of allCss) {
    const source = read(file);
    const digest = sha256(source);
    const isActive = activeSet.has(path.resolve(file));
    if (!digestOwners.has(digest)) digestOwners.set(digest, []);
    digestOwners.get(digest).push(rel(file));

    if (isActive) {
      for (const selector of extractSelectors(source)) {
        if (!selectorOwners.has(selector)) selectorOwners.set(selector, new Set());
        selectorOwners.get(selector).add(rel(file));
      }
      for (const token of [...source.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])) {
        if (!tokenOwners.has(token)) tokenOwners.set(token, new Set());
        tokenOwners.get(token).add(rel(file));
      }
    }

    files.push({
      path:rel(file),
      active:isActive,
      bytes:Buffer.byteLength(source),
      sha256:digest,
      imports:cssImports(file),
      important:count(source, /!important\b/g),
      gradients:count(source, /(?:linear|radial|conic)-gradient\s*\(/gi),
      pseudos:count(source, /::(?:before|after)\b/g)
    });
  }

  return {
    runtime:rel(runtimeFile),
    runtimeImports,
    runtimeOrderOk,
    totalCssFiles:allCss.length,
    activeCssFiles:active.map(rel),
    inactiveCssFiles:allCss.filter((file) => !activeSet.has(path.resolve(file))).map(rel),
    forbiddenRuntimeImports,
    missingRuntimeImports,
    unexpectedCss,
    missingCanonical,
    legacyDirectoryFiles,
    files,
    duplicates:[...digestOwners.entries()].filter(([, owners]) => owners.length > 1).map(([digest, owners]) => ({ sha256:digest, files:owners })),
    selectorCollisions:[...selectorOwners.entries()]
      .filter(([, owners]) => owners.size > 1)
      .filter(([selector]) => /(cgx-|hf-|cg-ui-|ds-|cgv-|pl-|kpi|surface|panel|table|form|button|input|select)/i.test(selector))
      .map(([selector, owners]) => ({ selector, files:[...owners] })),
    tokenCollisions:[...tokenOwners.entries()]
      .filter(([, owners]) => owners.size > 1)
      .map(([token, owners]) => ({ token, files:[...owners] }))
  };
}

function auditDocumentShell() {
  const index = read(indexFile);
  const layout = read(layoutFile);
  const inlineStyleBlocks = count(index, /<style\b/gi);
  const gradients = count(index, /(?:linear|radial|conic)-gradient\s*\(/gi);
  const legacyClassDefinitions = count(index, /\.(?:hf-|cgv-|admin-|kpi|menu-link|surface|panel-soft)[a-z0-9_-]*\s*\{/gi);
  return {
    inlineStyleBlocks,
    gradients,
    legacyClassDefinitions,
    noInlineGlobalCss:inlineStyleBlocks === 0,
    noGlobalKpiStrip:!/<section class="hf-kpi-strip"/.test(layout),
    noQuickbar:!/hf-quickbar|quickTabs/.test(layout),
    menuModeScoped:/modulesByArea\(state\.settings\?\.businessMode\|\|'admin',\{includeAll:false\}\)/.test(layout),
    compactPrimaryNav:/PRIMARY_ROUTES/.test(layout) && /hf-primary-nav/.test(layout),
    noEnterpriseTheme:!(/theme==='enterprise'|html\.enterprise/.test(layout + index))
  };
}

function auditTheme() {
  const catalog = read(path.join(root, 'frontend', 'src', 'data', 'themeCatalog.js'));
  const app = read(path.join(root, 'frontend', 'src', 'app.js'));
  const store = read(path.join(root, 'frontend', 'src', 'state', 'store.js'));
  const catalogKeys = [...catalog.matchAll(/\{\s*key:'([^']+)'/g)].map((m) => m[1]);
  return {
    catalogKeys,
    retiredCatalog:RETIRED_THEME_NAMES.filter((name) => new RegExp(`key:'${name}'`).test(catalog)),
    retiredApp:RETIRED_THEME_NAMES.filter((name) => new RegExp(`['"]${name}['"]`).test(app)),
    storeOfficialBinary:/OFFICIAL_THEMES\s*=\s*new Set\(\['light','dark'\]\)/.test(store),
    appBinary:/function applyTheme\(theme\)\{const normalized=theme==='dark'\?'dark':'light'/.test(app)
  };
}

function auditCriticalMigrations() {
  const registry = read(path.join(root, 'frontend', 'src', 'data', 'pageRegistry.js'));
  const health = read(path.join(root, 'frontend', 'src', 'pages', 'HealthcarePage.js'));
  const ledger = read(path.join(root, 'frontend', 'src', 'pages', 'LedgerPage.jsx'));
  const ledgerPrint = read(path.join(root, 'frontend', 'public', 'print', 'ledger-book.css'));
  const psych = read(path.join(root, 'frontend', 'src', 'pages', 'PsychologyPracticePage.js'));
  const adapters = read(path.join(root, 'frontend', 'src', 'styles', 'module-adapters.css'));
  const visual = read(path.join(root, 'frontend', 'src', 'styles', 'contagest-visual-system-v12.css'));
  return {
    veterinaryDedicated:/\bveterinaria\s*:\s*\[\s*['"]\.\/pages\/VeterinaryClinicPageV1123\.jsx['"]\s*,\s*['"]VeterinaryClinicPage['"]\s*\]/.test(registry),
    healthAnimalBranchRemoved:!/(animal\s*\?|kind:\s*'animal'|careImmunizationForm)/.test(health),
    ledgerUsesCanonical:/createRoot\(/.test(ledger) && /CgPageHeader/.test(ledger) && /CgDataTable/.test(ledger) && /CgMoney/.test(ledger),
    ledgerPrintStylesIsolated:/function htmlBook\(/.test(ledger) && /\/print\/ledger-book\.css/.test(ledger) && !/<style\b/i.test(ledger) && /@media\s+print/.test(ledgerPrint) && /table\s*\{/.test(ledgerPrint),
    psychAppointmentBound:/mountSubmit\('#psychAppointmentForm'/.test(psych) && /createAppointment/.test(psych),
    psychNoUuidLabel:/UUID_RE/.test(psych) && /Paciente sin nombre/.test(psych),
    psychCalendar:/cg-psych-calendar/.test(psych) && /cg-psych-calendar/.test(adapters),
    adminContract:/cg-rbac-permission-grid/.test(adapters) && /cg-admin-monitor-grid/.test(adapters),
    gymContract:/cg-gym-v1124-grid/.test(adapters) && /cg-gym-v1124-form/.test(adapters),
    adaptersTokenOnly:!/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i.test(adapters) && !/(?:linear|radial|conic)-gradient\s*\(/i.test(adapters),
    canonicalNoGradients:!/(?:linear|radial|conic)-gradient\s*\(/i.test(visual),
    metricValuesNotEllipsized:/text-overflow:clip!important/.test(visual) && /overflow:visible!important/.test(visual)
  };
}

function parityAudit(registry) {
  const appRoutes = registry.map((item) => item.route).sort();
  const catalogRoutes = MODULE_VISUAL_CATALOG.map((item) => item.route).sort();
  return {
    appRoutes,
    catalogRoutes,
    missingInCatalog:appRoutes.filter((route) => !catalogRoutes.includes(route)),
    missingInApp:catalogRoutes.filter((route) => !appRoutes.includes(route)),
    ok:appRoutes.length === catalogRoutes.length && appRoutes.every((route, index) => route === catalogRoutes[index])
  };
}

function buildMarkdown(report) {
  const findings = report.modules.flatMap((module) => module.findings.map((finding) => ({ route:module.route, ...finding })));
  const bySeverity = (severity) => findings.filter((item) => item.severity === severity).length;
  const migrationFailures = Object.entries(report.criticalMigrations).filter(([, ok]) => !ok).map(([key]) => key);
  const shellFailures = Object.entries(report.shell).filter(([, value]) => typeof value === 'boolean' && !value).map(([key]) => key);
  const lines = [
    '# ContaGest · Visual + Interaction Source Audit v16',
    '',
    `Generado: ${report.generatedAt}`,
    '',
    '## Gate',
    '',
    `- Rutas registradas: **${report.modules.length}** · catálogo QA: **${report.parity.ok ? 'PARIDAD' : 'DESCUADRE'}**`,
    `- CSS: **${report.css.totalCssFiles}** existentes · **${report.css.activeCssFiles.length}** activos`,
    `- CSS inesperados: **${report.css.unexpectedCss.length}** · legacy: **${report.css.legacyDirectoryFiles.length}**`,
    `- CSS global inline en index.html: **${report.shell.inlineStyleBlocks}**`,
    `- Gradientes en index.html: **${report.shell.gradients}**`,
    `- Fallos shell: **${shellFailures.length}** · invariantes críticas: **${migrationFailures.length}**`,
    `- Hallazgos de páginas critical/high/medium/low: **${bySeverity('critical')} / ${bySeverity('high')} / ${bySeverity('medium')} / ${bySeverity('low')}**`,
    '',
    '## Rutas / módulos',
    '',
    '| Ruta | Familia | Riesgo | Score | Forms | Submit bindings | Hallazgos |',
    '|---|---|---|---:|---:|---:|---|'
  ];
  for (const module of report.modules) {
    lines.push(`| ${escapeCell(module.route)} | ${escapeCell(module.family)} | ${escapeCell(module.priority)} | ${module.score} | ${module.metrics?.formIds?.length || 0} | ${module.metrics?.submitBindings?.length || 0} | ${escapeCell(module.findings.map((item) => `${item.severity}:${item.code}`).join(', ') || '—')} |`);
  }
  lines.push('', '## Shell / ownership', '');
  for (const [key, value] of Object.entries(report.shell)) {
    lines.push(`- ${typeof value === 'boolean' ? (value ? 'PASS' : 'FAIL') : 'INFO'} · ${key}: ${escapeCell(value)}`);
  }
  lines.push('', '## Invariantes críticas', '');
  for (const [key, value] of Object.entries(report.criticalMigrations)) lines.push(`- ${value ? 'PASS' : 'FAIL'} · ${key}`);
  lines.push('', '## Evidencia', '', 'Este auditor certifica fuente/ownership y señales estáticas de interacción. El estado visual/funcional real exige navegador; nunca se transforma un SOURCE PASS en BROWSER PASS.');
  return `${lines.join('\n')}\n`;
}

fs.mkdirSync(outDir, { recursive:true });
const registry = extractPageRegistry();
const modules = registry.map(auditPage).sort((a, b) => a.route.localeCompare(b.route));
const css = auditCss();
const theme = auditTheme();
const shell = auditDocumentShell();
const criticalMigrations = auditCriticalMigrations();
const parity = parityAudit(registry);
const report = { schemaVersion:16, generatedAt:new Date().toISOString(), strict, parity, modules, css, theme, shell, criticalMigrations };
const jsonFile = path.join(outDir, 'visual-source-audit.json');
const mdFile = path.join(outDir, 'visual-source-audit.md');
fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdFile, buildMarkdown(report));

const pageCritical = modules
  .flatMap((module) => module.findings)
  .filter((item) => ['critical','high'].includes(item.severity))
  // Submit/event ownership belongs to the functional/control gate. Keep
  // unbound-form visible in the report, but do not double-fail the visual gate.
  .filter((item) => item.code !== 'unbound-form')
  .length;
const structural =
  css.forbiddenRuntimeImports.length +
  css.missingRuntimeImports.length +
  css.unexpectedCss.length +
  css.missingCanonical.length +
  css.legacyDirectoryFiles.length +
  (css.runtimeOrderOk ? 0 : 1) +
  theme.retiredCatalog.length +
  theme.retiredApp.length +
  (theme.storeOfficialBinary ? 0 : 1) +
  (theme.appBinary ? 0 : 1) +
  (parity.ok ? 0 : 1) +
  Object.values(shell).filter((value) => typeof value === 'boolean' && !value).length +
  Object.values(criticalMigrations).filter((value) => !value).length;

console.log(`Visual v16 audit: ${modules.length} rutas · ${css.activeCssFiles.length}/${css.totalCssFiles} CSS activos · ${structural} fallos estructurales · ${pageCritical} hallazgos high/critical de página.`);
console.log(`Reporte: ${rel(mdFile)}`);
if (strict && (structural > 0 || pageCritical > 0)) process.exitCode = 1;
