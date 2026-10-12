import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HIPICO_STYLES, verifyHipicoCssGraph } from '../android/hipico-control-v1130/scripts/verify-css-graph.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = path.join(repo, 'frontend/public/hipico-control');
const html = fs.readFileSync(path.join(canonical, 'index.html'), 'utf8');

function withFixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hipico-css-graph-'));
  try {
    const css = path.join(root, 'assets/css');
    fs.mkdirSync(css, { recursive: true });
    for (const name of HIPICO_STYLES) {
      fs.copyFileSync(path.join(canonical, 'assets/css', name), path.join(css, name));
    }
    return fn(root, css);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('#119 current PWA stylesheet dependency graph is complete and ordered', () => {
  const result = verifyHipicoCssGraph(canonical, html);
  assert.deepEqual([...result.styles], [...HIPICO_STYLES]);
  assert.deepEqual([...result.direct], ['./assets/css/app.css', './assets/css/platform-tokens-v1.css']);
  assert.deepEqual([...result.imports], ['./ui-system-v3-compat.css', './ui-system-v4.css', './ui-system-v4-convergence.css']);
});

test('#119 Android gate rejects unexpected or missing styles', () => withFixture((root, css) => {
  fs.writeFileSync(path.join(css, 'unreviewed.css'), 'body{display:none}');
  assert.throws(() => verifyHipicoCssGraph(root, html), /HIPICO_CSS_UNEXPECTED_FILE_INVENTORY/);
  fs.rmSync(path.join(css, 'unreviewed.css'));
  fs.rmSync(path.join(css, 'ui-system-v4.css'));
  assert.throws(() => verifyHipicoCssGraph(root, html), /HIPICO_CSS_UNEXPECTED_FILE_INVENTORY/);
}));

test('#119 Android gate rejects stylesheet link injection, missing style and reordering', () => withFixture((root) => {
  const injected = html.replace('</head>', '<link rel="stylesheet" href="https://attacker.example/c.css"></head>');
  assert.throws(() => verifyHipicoCssGraph(root, injected), /HIPICO_CSS_DIRECT_LINKS_DRIFT/);
  assert.throws(() => verifyHipicoCssGraph(root, html.replace('./assets/css/platform-tokens-v1.css', './assets/css/app.css')), /HIPICO_CSS_DIRECT_LINKS_DRIFT/);
}));

test('#119 Android gate rejects unreviewed or reordered imports', () => withFixture((root, css) => {
  const entry = path.join(css, 'app.css');
  const original = fs.readFileSync(entry, 'utf8');
  fs.writeFileSync(entry, original.replace('./ui-system-v4.css', './unreviewed.css'));
  assert.throws(() => verifyHipicoCssGraph(root, html), /HIPICO_CSS_IMPORT_GRAPH_DRIFT/);
  fs.writeFileSync(entry, original.replace('url("./ui-system-v4.css")', 'url("./ui-system-v4.css") layer(legacy)'));
  assert.throws(() => verifyHipicoCssGraph(root, html), /HIPICO_CSS_LEGACY_LAYER_DRIFT/);
}));

test('#119 Android gate rejects hidden nested imports in approved styles', () => withFixture((root, css) => {
  fs.appendFileSync(path.join(css, 'ui-system-v4.css'), '\n@import url("https://untrusted.example/theme.css");\n');
  assert.throws(() => verifyHipicoCssGraph(root, html), /HIPICO_CSS_UNDECLARED_NESTED_IMPORT/);
}));
