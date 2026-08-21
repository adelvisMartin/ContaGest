import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const runtime = read('frontend/src/styles/erp-runtime.css');
const visual = read('frontend/src/styles/contagest-visual-system-v12.css');
const uiReadme = read('frontend/src/components/ui/README.md');
const agents = read('AGENTS.md');

const normalize = (value) => value.replace(/\s+/g, ' ').trim();

test('canonical visual system is the final shared runtime authority', () => {
  const imports = [...runtime.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.equal(imports.at(-1), './contagest-visual-system-v12.css');
  assert.equal(imports.includes('./ui-normalization-v142.css'), false);
  assert.match(runtime, /New typography, spacing, cards, forms, tables, responsive behavior/);
});

test('visual system exposes one tokenized typography and geometry scale', () => {
  for (const token of [
    '--cg-v-text-2xs','--cg-v-text-xs','--cg-v-text-sm','--cg-v-text-md','--cg-v-text-lg',
    '--cg-v-text-section','--cg-v-text-page','--cg-v-text-kpi',
    '--cg-v-space-1','--cg-v-space-2','--cg-v-space-3','--cg-v-space-4',
    '--cg-v-radius-sm','--cg-v-radius-md','--cg-v-radius-lg',
    '--cg-v-control','--cg-v-control-touch','--cg-v-page-max','--cg-v-kpi-min'
  ]) assert.match(visual, new RegExp(token.replaceAll('-', '\\-')));

  assert.match(visual, /--cg-v-text-page:\s*clamp\(1\.25rem[\s\S]*1\.625rem\)/);
  assert.match(visual, /--cg-v-text-kpi:\s*clamp\(1rem[\s\S]*1\.25rem\)/);
  assert.match(visual, /--cg-v-text-section:\s*clamp\(1rem[\s\S]*1\.125rem\)/);
});

test('operational metrics cannot restore blobs, gradients or oversized amounts', () => {
  const compact = normalize(visual);
  assert.match(compact, /cgx-metric[\s\S]*grid-template-columns: 30px minmax\(0,1fr\)/);
  assert.match(compact, /cgx-metric[\s\S]*min-height: 76px/);
  assert.match(compact, /cgx-metric[\s\S]*font-size: var\(--cg-v-text-kpi\)/);
  assert.match(visual, /::before,[\s\S]*::after\s*\{[\s\S]*content:\s*none\s*!important/);
  assert.match(visual, /first-child[\s\S]*grid-column:\s*auto\s*!important/);
  assert.match(visual, /background-image:\s*none\s*!important/);
});

test('shared components own overflow rather than the document', () => {
  assert.match(visual, /html\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(visual, /body\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(visual, /cgx-table-wrap[\s\S]*overflow-x:\s*auto\s*!important/);
  assert.match(visual, /min-width:\s*0\s*!important/);
  assert.match(visual, /@media \(max-width: 760px\)/);
  assert.match(visual, /@media \(max-width: 520px\)/);
});

test('forms and tables use dense ERP dimensions', () => {
  assert.match(visual, /--cg-v-control:\s*38px/);
  assert.match(visual, /--cg-v-control-touch:\s*44px/);
  assert.match(visual, /--cg-v-table-row:\s*42px/);
  assert.match(visual, /font-variant-numeric:\s*tabular-nums lining-nums/);
  assert.match(visual, /position:\s*sticky;[\s\S]*top:\s*0/);
});

test('theming is semantic and keeps light/dark geometry identical', () => {
  assert.match(visual, /html\.dark,[\s\S]*html\[data-theme="dark"\]/);
  for (const semantic of ['--cg-v-bg','--cg-v-surface','--cg-v-text','--cg-v-text-muted','--cg-v-border','--cg-v-brand','--cg-v-focus']) {
    assert.ok((visual.match(new RegExp(semantic.replaceAll('-', '\\-'), 'g')) || []).length >= 2, `${semantic} must exist in light and dark tokens`);
  }
  assert.doesNotMatch(visual, /theme-(?:sky|soft-blue|spectrum|finance|executive)[\s,{]/);
});

test('motion remains short, functional and reduced-motion safe', () => {
  assert.match(visual, /--cg-v-duration-fast:\s*120ms/);
  assert.match(visual, /--cg-v-duration:\s*170ms/);
  assert.match(visual, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(visual, /animation-duration:\s*[1-9](?:\.\d+)?s/);
});

test('UI and agent documentation point at the canonical visual authority', () => {
  assert.match(uiReadme, /contagest-visual-system-v12\.css/);
  assert.match(uiReadme, /MetricGrid/);
  assert.match(agents, /contagest-visual-system-v12\.css/);
  assert.match(agents, /contagest-ui-audit/);
});
