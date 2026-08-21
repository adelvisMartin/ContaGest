import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const outDir = path.join(root, 'artifacts', 'qa');
const rel = (file) => path.relative(root, file).replaceAll('\\', '/');
const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);
const normalizeSpace = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const escapeCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

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

function count(source, regex) {
  return [...String(source).matchAll(regex)].length;
}

function extractPageRegistry() {
  const appPath = path.join(root, 'frontend', 'src', 'app.js');
  const source = read(appPath);
  const start = source.indexOf('const pageRegistry={');
  if (start < 0) throw new Error('No se encontró pageRegistry en frontend/src/app.js');
  const end = source.indexOf('\n};', start);
  if (end < 0) throw new Error('No se pudo delimitar pageRegistry.');
  const block = source.slice(start, end + 3);
  const entries = [];
  const pattern = /(?:^|,)\s*(?:'([^']+)'|"([^"]+)"|([\w-]+))\s*:\s*\['\.\/pages\/([^']+)'\s*,\s*'([^']+)'\]/gm;
  for (const match of block.matchAll(pattern)) {
    entries.push({ route:match[1] || match[2] || match[3], file:match[4], exportName:match[5] });
  }
  return entries;
}

const familyByRoute = new Map([
  ...['dashboard'].map((route)=>[route,'core']),
  ...['cotizacion','clientes','ventas','proveedores','compras'].map((route)=>[route,'commercial']),
  ...['inventario','historial','tasks','qr','inventario-scan','importacion-data','kardex'].map((route)=>[route,'operations']),
  ...['tributos','normativa','contabilidad','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable','libro-ventas','plan-cuentas','normativa-contable'].map((route)=>[route,'accounting']),
  ...['bancos'].map((route)=>[route,'finance']),
  ...['nomina','rrhh'].map((route)=>[route,'hr']),
  ...['reportes','analytics'].map((route)=>[route,'reporting']),
  ...['auditoria','demo-control','modulos-madurez','reglas-negocio','licencias','pretesting'].map((route)=>[route,'governance']),
  ...['configuracion','profile','mobile','marca','admin','backend','vistas'].map((route)=>[route,'admin']),
  ...['pedidos','pos-sede','tracking-pedidos','delivery-mapa'].map((route)=>[route,'food']),
  ...['salud','veterinaria','psicologia','odontologia'].map((route)=>[route,'health']),
  ...['gimnasio','rutinas','nutricion'].map((route)=>[route,'fitness']),
  ...['ayuda','asistente-ia','soporte','mensajes'].map((route)=>[route,'support'])
]);

function auditPage(entry) {
  const file = path.join(root, 'frontend', 'src', 'pages', entry.file);
  if (!exists(file)) return { ...entry, family:familyByRoute.get(entry.route) || 'other', exists:false, score:100, findings:[{ severity:'critical', code:'missing-page', detail:`No existe ${rel(file)}` }] };
  const source = read(file);
  const findings = [];
  const add = (severity, code, detail) => findings.push({ severity, code, detail });
  const kit = /components\/ui\/index\.js/.test(source);
  const legacyDs = /components\/designSystem\.js/.test(source);
  const inlineStyles = count(source, /\bstyle\s*=\s*["'`]/g);
  const styleBlocks = count(source, /<style\b/gi);
  const localCssImports = count(source, /import\s+[^;]*['"][^'"]*styles\//g);
  const rawTables = count(source, /<table\b/gi);
  const rawForms = count(source, /<form\b/gi);
  const rawControls = count(source, /<(?:input|select|textarea)\b/gi);
  const rawButtons = count(source, /<button\b/gi);
  const hardFont = count(source, /font-size\s*:\s*(?:clamp\([^)]*\)|\d+(?:\.\d+)?(?:px|rem))/gi);
  const hardWidth = count(source, /(?:min-|max-)?width\s*:\s*\d{2,}(?:px|rem)/gi);
  const hardColor = count(source, /#[0-9a-f]{3,8}\b/gi);
  const absolute = count(source, /position\s*:\s*(?:absolute|fixed)/gi);
  const materialSymbols = count(source, /material-symbols|material-icons/gi);
  const canonicalComponents = ['PageHeader','MetricGrid','MetricCard','Section','DataTable','Field','Select','Textarea','Button','Badge','EmptyState','Toolbar'].filter((name)=>new RegExp(`\\b${name}\\b`).test(source));

  if (styleBlocks) add('critical','embedded-style-block',`${styleBlocks} bloque(s) <style> dentro de la vista.`);
  if (inlineStyles) add('high','inline-style',`${inlineStyles} style= inline; impiden normalización central.`);
  if (localCssImports) add('high','page-css-import',`${localCssImports} import(s) CSS desde la propia página.`);
  if (hardFont) add('high','hardcoded-font-size',`${hardFont} tamaño(s) de fuente definidos en la vista.`);
  if (absolute) add('high','absolute-layout',`${absolute} regla(s) absolute/fixed dentro de la vista.`);
  if (hardWidth) add('medium','fixed-width',`${hardWidth} ancho(s) rígido(s) detectado(s).`);
  if (hardColor) add('medium','hardcoded-color',`${hardColor} color(es) hex detectado(s) en la vista.`);
  if (legacyDs) add('medium','legacy-design-system','Importa designSystem.js; debe migrar al kit canónico cuando se toque el módulo.');
  if (!kit && (rawForms || rawTables || rawButtons || rawControls)) add('medium','kit-adoption',`No importa components/ui/index.js pese a tener UI operativa (forms:${rawForms}, tables:${rawTables}, controls:${rawControls}, buttons:${rawButtons}).`);
  if (rawTables && !/\b(?:DataTable|Table|FiscalTable)\b/.test(source)) add('medium','raw-table',`${rawTables} tabla(s) HTML sin wrapper de tabla canónico detectado.`);
  if (rawForms && !/\b(?:Field|Select|Textarea|DS\.Form)\b/.test(source)) add('medium','raw-form',`${rawForms} formulario(s) con baja adopción del kit compartido.`);
  if (materialSymbols) add('low','icon-family',`${materialSymbols} referencia(s) Material Icons/Symbols; revisar consistencia con Font Awesome canónico.`);

  const severityWeight = { critical:24, high:14, medium:7, low:2 };
  const penalty = findings.reduce((sum,item)=>sum+(severityWeight[item.severity] || 0),0);
  return {
    ...entry,
    family:familyByRoute.get(entry.route) || 'other',
    exists:true,
    path:rel(file),
    bytes:Buffer.byteLength(source),
    score:Math.max(0,100-penalty),
    kit,
    canonicalComponents,
    metrics:{ inlineStyles,styleBlocks,localCssImports,rawTables,rawForms,rawControls,rawButtons,hardFont,hardWidth,hardColor,absolute,materialSymbols },
    findings
  };
}

function cssImports(file) {
  const source = read(file);
  const imports = [];
  for (const match of source.matchAll(/@import\s+(?:url\()?['"]([^'"]+\.css)['"]/g)) {
    if (/^(?:https?:)?\/\//.test(match[1])) continue;
    const resolved = path.resolve(path.dirname(file), match[1]);
    if (exists(resolved)) imports.push(resolved);
  }
  return imports;
}

function activeCssGraph(entryFile) {
  const visited = new Set();
  const visit = (file) => {
    const resolved = path.resolve(file);
    if (visited.has(resolved) || !exists(resolved)) return;
    visited.add(resolved);
    for (const imported of cssImports(resolved)) visit(imported);
  };
  visit(entryFile);
  return [...visited];
}

function extractSelectors(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
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
  const stylesDir = path.join(root, 'frontend', 'src', 'styles');
  const runtime = path.join(stylesDir, 'erp-runtime.css');
  const allCss = walk(stylesDir, (file)=>file.endsWith('.css'));
  const active = activeCssGraph(runtime);
  const activeSet = new Set(active.map(path.resolve));
  const fileReports = [];
  const duplicateMap = new Map();
  const selectorOwners = new Map();
  const tokenOwners = new Map();
  const legacyRisk = [];

  for (const file of allCss) {
    const source = read(file);
    const digest = hash(source);
    if (!duplicateMap.has(digest)) duplicateMap.set(digest, []);
    duplicateMap.get(digest).push(rel(file));
    const isActive = activeSet.has(path.resolve(file));
    const important = count(source, /!important\b/g);
    const gradients = count(source, /(?:linear|radial|conic)-gradient\s*\(/gi);
    const pseudos = count(source, /::(?:before|after)\b/g);
    const fixedPosition = count(source, /position\s*:\s*fixed\b/gi);
    const absolutePosition = count(source, /position\s*:\s*absolute\b/gi);
    const largeFonts = [...source.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m)=>Number(m[1])).filter((n)=>n>26);
    const hugeRadius = [...source.matchAll(/border-radius\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m)=>Number(m[1])).filter((n)=>n>24);
    const largeFixedWidths = [...source.matchAll(/(?:min-|max-)?width\s*:\s*(\d+(?:\.\d+)?)px/gi)].map((m)=>Number(m[1])).filter((n)=>n>480);
    const selectors = isActive ? extractSelectors(source) : [];
    const tokens = [...source.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m)=>m[1]);
    if (isActive) {
      for (const selector of selectors) {
        if (!selectorOwners.has(selector)) selectorOwners.set(selector, new Set());
        selectorOwners.get(selector).add(rel(file));
      }
      for (const token of tokens) {
        if (!tokenOwners.has(token)) tokenOwners.set(token, new Set());
        tokenOwners.get(token).add(rel(file));
      }
    }
    const isCanonical = rel(file) === 'frontend/src/styles/contagest-visual-system-v12.css';
    if (isActive && !isCanonical) {
      if (largeFonts.length) legacyRisk.push({ severity:'high', file:rel(file), code:'large-font', detail:`font-size >26px: ${[...new Set(largeFonts)].join(', ')}px` });
      if (hugeRadius.length) legacyRisk.push({ severity:'medium', file:rel(file), code:'large-radius', detail:`border-radius >24px: ${[...new Set(hugeRadius)].join(', ')}px` });
      if (gradients) legacyRisk.push({ severity:'medium', file:rel(file), code:'gradient', detail:`${gradients} gradiente(s) activos.` });
      if (pseudos) legacyRisk.push({ severity:'medium', file:rel(file), code:'pseudo-decoration', detail:`${pseudos} pseudo-elemento(s) activos.` });
      if (largeFixedWidths.length) legacyRisk.push({ severity:'medium', file:rel(file), code:'fixed-width', detail:`anchos rígidos >480px: ${[...new Set(largeFixedWidths)].slice(0,8).join(', ')}px` });
    }
    fileReports.push({
      path:rel(file), active:isActive, bytes:Buffer.byteLength(source), sha256:digest,
      imports:cssImports(file).map(rel), important, gradients, pseudos, fixedPosition, absolutePosition,
      largeFonts:[...new Set(largeFonts)], hugeRadius:[...new Set(hugeRadius)], largeFixedWidths:[...new Set(largeFixedWidths)]
    });
  }

  const duplicates = [...duplicateMap.entries()]
    .filter(([,files])=>files.length>1)
    .map(([sha256,files])=>({ sha256, files }));
  const selectorCollisions = [...selectorOwners.entries()]
    .filter(([,owners])=>owners.size>1)
    .filter(([selector])=>/(cgx-|hf-|cg-ui-|ds-|cgv-|pl-|kpi|surface|panel|table|form|button|input|select)/i.test(selector))
    .map(([selector,owners])=>({ selector, files:[...owners] }))
    .sort((a,b)=>b.files.length-a.files.length || a.selector.localeCompare(b.selector));
  const tokenCollisions = [...tokenOwners.entries()]
    .filter(([,owners])=>owners.size>1)
    .map(([token,owners])=>({ token, files:[...owners] }))
    .sort((a,b)=>b.files.length-a.files.length || a.token.localeCompare(b.token));

  return {
    runtime:rel(runtime),
    totalCssFiles:allCss.length,
    activeCssFiles:active.map(rel),
    inactiveCssFiles:allCss.filter((file)=>!activeSet.has(path.resolve(file))).map(rel),
    files:fileReports,
    duplicates,
    selectorCollisions,
    tokenCollisions,
    legacyRisk
  };
}

function buildMarkdown(report) {
  const modules = report.modules;
  const findings = modules.flatMap((module)=>module.findings.map((finding)=>({ route:module.route, file:module.path, ...finding })));
  const bySeverity = (severity) => findings.filter((item)=>item.severity===severity).length + report.css.legacyRisk.filter((item)=>item.severity===severity).length;
  const lines = [
    '# ContaGest · Visual Source & Cascade Audit',
    '',
    `Generado: ${report.generatedAt}`,
    '',
    '## Resumen',
    '',
    `- Rutas registradas: **${modules.length}**`,
    `- CSS encontrados: **${report.css.totalCssFiles}**`,
    `- CSS alcanzables desde erp-runtime.css: **${report.css.activeCssFiles.length}**`,
    `- Colisiones exactas de selector compartido: **${report.css.selectorCollisions.length}**`,
    `- Tokens redefinidos por más de un CSS activo: **${report.css.tokenCollisions.length}**`,
    `- Archivos con contenido duplicado: **${report.css.duplicates.length}**`,
    `- Hallazgos critical/high/medium/low: **${bySeverity('critical')} / ${bySeverity('high')} / ${bySeverity('medium')} / ${bySeverity('low')}**`,
    '',
    '## Iteración por módulo',
    '',
    '| Ruta | Familia | Archivo | Score | Kit | Hallazgos |',
    '|---|---|---|---:|:---:|---|'
  ];
  for (const module of modules) {
    lines.push(`| ${escapeCell(module.route)} | ${escapeCell(module.family)} | ${escapeCell(module.path || module.file)} | ${module.score} | ${module.kit?'sí':'no'} | ${escapeCell(module.findings.map((item)=>`${item.severity}:${item.code}`).join(', ') || '—')} |`);
  }
  lines.push('', '## Riesgos de cascada activos', '');
  if (!report.css.legacyRisk.length) lines.push('No se detectaron patrones legacy de riesgo por las reglas del auditor.');
  else for (const item of report.css.legacyRisk.slice(0,120)) lines.push(`- **${item.severity.toUpperCase()}** \`${item.file}\` · ${item.code}: ${item.detail}`);
  lines.push('', '## Colisiones de selector', '');
  if (!report.css.selectorCollisions.length) lines.push('No se detectaron selectores compartidos idénticos entre archivos CSS activos.');
  else for (const item of report.css.selectorCollisions.slice(0,120)) lines.push(`- \`${item.selector}\` → ${item.files.map((file)=>`\`${file}\``).join(', ')}`);
  lines.push('', '## Tokens redefinidos', '');
  if (!report.css.tokenCollisions.length) lines.push('No se detectaron custom properties compartidas entre múltiples CSS activos.');
  else for (const item of report.css.tokenCollisions.slice(0,100)) lines.push(`- \`${item.token}\` → ${item.files.map((file)=>`\`${file}\``).join(', ')}`);
  lines.push('', '## Archivos CSS duplicados', '');
  if (!report.css.duplicates.length) lines.push('No se detectaron archivos CSS con contenido idéntico.');
  else for (const item of report.css.duplicates) lines.push(`- ${item.files.map((file)=>`\`${file}\``).join(' = ')}`);
  lines.push('', '## Criterio', '', 'Este informe no sustituye Playwright. Su función es localizar deuda estructural, estilos duplicados, selectores que compiten, vistas que todavía construyen UI fuera del kit y patrones con alto riesgo de volver a producir solapamientos.');
  return `${lines.join('\n')}\n`;
}

fs.mkdirSync(outDir, { recursive:true });
const registry = extractPageRegistry();
const modules = registry.map(auditPage).sort((a,b)=>a.route.localeCompare(b.route));
const css = auditCss();
const report = { schemaVersion:1, generatedAt:new Date().toISOString(), strict, modules, css };
const jsonFile = path.join(outDir, 'visual-source-audit.json');
const mdFile = path.join(outDir, 'visual-source-audit.md');
fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdFile, buildMarkdown(report));

const sourceHigh = modules.flatMap((module)=>module.findings).filter((item)=>['critical','high'].includes(item.severity)).length;
const cssHigh = css.legacyRisk.filter((item)=>['critical','high'].includes(item.severity)).length;
console.log(`Visual source audit: ${modules.length} rutas · ${css.activeCssFiles.length}/${css.totalCssFiles} CSS activos · ${css.selectorCollisions.length} colisiones · ${sourceHigh + cssHigh} hallazgos high/critical.`);
console.log(`Reporte: ${rel(mdFile)}`);
if (strict && sourceHigh + cssHigh > 0) process.exitCode = 1;
