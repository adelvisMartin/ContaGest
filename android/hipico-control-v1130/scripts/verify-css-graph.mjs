import fs from 'node:fs';
import path from 'node:path';

export const HIPICO_STYLES = Object.freeze([
  'app.css',
  'platform-tokens-v1.css',
  'ui-system-v3-compat.css',
  'ui-system-v4-convergence.css',
  'ui-system-v4.css'
]);

const DIRECT_STYLES = Object.freeze([
  './assets/css/app.css',
  './assets/css/platform-tokens-v1.css'
]);

const IMPORT_STYLES = Object.freeze([
  './ui-system-v3-compat.css',
  './ui-system-v4.css',
  './ui-system-v4-convergence.css'
]);

function sameList(actual, expected) {
  return actual.length === expected.length && actual.every((entry, index) => entry === expected[index]);
}

export function verifyHipicoCssGraph(root, html) {
  const cssDir = path.join(root, 'assets', 'css');
  const files = fs.readdirSync(cssDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
    .map((entry) => entry.name).sort();
  if (!sameList(files, HIPICO_STYLES)) {
    throw new Error('HIPICO_CSS_UNEXPECTED_FILE_INVENTORY: ' + files.join(', '));
  }

  const linkTags = String(html).match(/<link\b[^>]*>/gi) || [];
  const direct = linkTags
    .filter((tag) => /\brel\s*=\s*["']stylesheet["']/i.test(tag))
    .map((tag) => tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || '');
  if (!sameList(direct, DIRECT_STYLES)) {
    throw new Error('HIPICO_CSS_DIRECT_LINKS_DRIFT');
  }

  const entrypoint = fs.readFileSync(path.join(cssDir, 'app.css'), 'utf8');
  const imports = [...entrypoint.matchAll(/@import\s+url\(\s*["']([^"']+)["']\s*\)\s*(?:layer\(\s*legacy\s*\))?\s*;/gi)];
  if (!sameList(imports.map((match) => match[1]), IMPORT_STYLES)
    || (entrypoint.match(/@import\b/gi) || []).length !== IMPORT_STYLES.length) {
    throw new Error('HIPICO_CSS_IMPORT_GRAPH_DRIFT');
  }
  if ((entrypoint.match(/@layer\s+legacy\s*;/gi) || []).length !== 1
    || entrypoint.indexOf('@layer legacy;') > entrypoint.indexOf('@import')
    || !/layer\(\s*legacy\s*\)/i.test(imports[0][0])
    || imports.slice(1).some((match) => /layer\(/i.test(match[0]))) {
    throw new Error('HIPICO_CSS_LEGACY_LAYER_DRIFT');
  }
  for (const name of HIPICO_STYLES.filter((item) => item !== 'app.css')) {
    const contents = fs.readFileSync(path.join(cssDir, name), 'utf8');
    if (/@import\b/i.test(contents)) throw new Error('HIPICO_CSS_UNDECLARED_NESTED_IMPORT: ' + name);
  }
  return Object.freeze({ styles: Object.freeze(files), direct: Object.freeze(direct), imports: Object.freeze([...IMPORT_STYLES]) });
}
