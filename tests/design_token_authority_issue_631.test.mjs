import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const canonicalPath = path.join(root, 'frontend/src/design-system/semanticTokens.v1.js');
const generatorPath = path.join(root, 'scripts/generate-design-tokens-v631.mjs');
const mainCssPath = 'frontend/public/design-system/contagest-semantic-tokens-v1.css';
const hipicoCssPath = 'frontend/public/hipico-control/assets/css/platform-tokens-v1.css';

const canonical = await import(pathToFileURL(canonicalPath));
const generator = await import(pathToFileURL(generatorPath));
const tokens = canonical.SEMANTIC_TOKENS_V1;

const requiredColorRoles = [
  'background', 'surface', 'surfaceSubtle', 'surfaceRaised', 'elevated', 'overlay',
  'textPrimary', 'textSecondary', 'textMuted', 'textInverse',
  'border', 'borderStrong', 'divider', 'focus',
  'brand', 'brandHover', 'brandSoft', 'accent',
  'success', 'successSoft', 'warning', 'warningSoft', 'danger', 'dangerSoft', 'info', 'infoSoft',
  'interactiveHover', 'interactivePressed', 'interactiveDisabled', 'interactiveSelected'
];

const indexOfOrFail = (source, needle, label) => {
  const index = source.indexOf(needle);
  assert.notEqual(index, -1, `${label} missing ${needle}`);
  return index;
};

test('canonical semantic token source is versioned and complete', () => {
  assert.equal(tokens.version, '1.0.0');
  assert.equal(tokens.contract, 'contagest-semantic-design-tokens');
  for (const mode of ['light', 'dark']) {
    for (const role of requiredColorRoles) assert.ok(tokens.color[mode][role], `${mode}.${role}`);
  }
  for (const category of ['typography', 'spacing', 'radius', 'elevation', 'controls', 'layout', 'zIndex', 'motion', 'density']) {
    assert.ok(tokens[category] && Object.keys(tokens[category]).length > 0, category);
  }
  assert.ok(tokens.products?.hipico?.light?.brand);
  assert.ok(tokens.products?.hipico?.dark?.brand);
  assert.equal(tokens.products.hipico.variantReason, 'equestrian-operations');
});

test('generated CSS adapters are byte-for-byte derived from the canonical source', () => {
  assert.equal(read(mainCssPath), generator.renderContaGestCss(tokens));
  assert.equal(read(hipicoCssPath), generator.renderHipicoCss(tokens));
});

test('ContaGest adapter preserves legacy variable contracts and theme semantics', () => {
  const css = read(mainCssPath);
  for (const token of [
    '--cg-v-bg', '--cg-v-surface', '--cg-v-text', '--cg-v-text-muted', '--cg-v-border',
    '--cg-v-brand', '--cg-v-success', '--cg-v-warning', '--cg-v-danger', '--cg-v-info',
    '--cg-v-focus', '--cg-v-space-2', '--cg-v-radius-md', '--cg-v-control-touch',
    '--cg-v-duration-fast', '--cg-v-ease'
  ]) assert.match(css, new RegExp(token.replaceAll('-', '\\-') + ':'));
  assert.match(css, /html\.dark,[\s\S]*html\[data-theme="dark"\]/);
  assert.match(css, /prefers-color-scheme:\s*dark[\s\S]*data-theme="system"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('MUI delegates theme authority and does not own another palette', () => {
  const runtime = read('frontend/src/components/muiRuntime.js');
  const adapter = read('frontend/src/components/muiThemeAdapter.js');
  assert.match(runtime, /from '\.\/muiThemeAdapter\.js'/);
  assert.doesNotMatch(runtime, /bg:\s*'#[0-9a-f]{6}'/i);
  assert.match(adapter, /semanticTokens\.v1\.js/);
  assert.match(adapter, /getContaGestThemeTokens/);
  assert.doesNotMatch(adapter, /#[0-9a-f]{3,8}\b/i);
});

test('main and Hípico load generated adapters with deterministic authority order', () => {
  const mainIndex = read('frontend/index.html');
  const hipicoIndex = read('frontend/public/hipico-control/index.html');
  assert.match(mainIndex, /\.\/design-system\/contagest-semantic-tokens-v1\.css/);
  const appCss = indexOfOrFail(hipicoIndex, './assets/css/app.css', 'Hípico index');
  const tokenCss = indexOfOrFail(hipicoIndex, './assets/css/platform-tokens-v1.css', 'Hípico index');
  assert.ok(tokenCss > appCss, 'Hípico token adapter must load after the transitional app.css fallback');
});

test('light dark and system themes use canonical profile, normalized preference and reactive MUI resolution', () => {
  const app = read('frontend/src/app.js');
  const runtime = read('frontend/src/components/muiRuntime.js');
  const ux = read('frontend/src/design-system/uxContract.v1.js');
  const themeCatalog = read('frontend/src/data/themeCatalog.js');
  assert.match(ux, /\['light','dark','system'\]/);
  assert.match(app, /THEME_OPTIONS\.map\(\(i\)=>i\.key\)/);
  assert.match(themeCatalog, /THEME_OPTIONS/);
  assert.match(app, /normalizeThemePreference\(theme\)/);
  assert.match(app, /resolveThemeMode\(normalized,Boolean\(systemThemeQuery\?\.matches\)\)/);
  assert.match(app, /SYSTEM_THEME_QUERY/);
  assert.match(runtime, /resolveThemeMode/);
  assert.match(runtime, /addEventListener\?\.\('change'/);
  assert.match(runtime, /removeEventListener\?\.\('change'/);
});

test('Hípico consumes shared primitives and derives its documented equestrian variant from the same canonical source', () => {
  const css = read(hipicoCssPath);
  const hipico = tokens.products.hipico;
  assert.equal(hipico.variantReason, 'equestrian-operations');
  const darkStart = css.indexOf(':root[data-theme="dark"]');
  const systemStart = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(darkStart > 0 && systemStart > darkStart, 'light, dark and system adapters must remain separate');
  const lightCss = css.slice(0, darkStart);
  const darkCss = css.slice(darkStart, systemStart);
  const expectRole = (source, role, value) =>
    assert.ok(source.includes(role+': '+value+';'), role+' must match canonical semanticTokens.v1.js');
  expectRole(lightCss, '--hc-touch', hipico.controls.touch);
  expectRole(lightCss, '--hc-radius-md', hipico.radius.md);
  expectRole(lightCss, '--hc-brand', hipico.light.brand);
  expectRole(darkCss, '--hc-brand', hipico.dark.brand);
  expectRole(darkCss, '--hc-radius-md', hipico.radius.md);
  assert.match(css, /data-theme="system"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('migration ledger makes all duplicate fallback owners explicit and expiring', () => {
  const ledger = JSON.parse(read('docs/architecture/design-token-authority-v1.json'));
  assert.equal(ledger.version, 1);
  assert.equal(ledger.canonicalSource, 'frontend/src/design-system/semanticTokens.v1.js');
  assert.ok(Array.isArray(ledger.mappings) && ledger.mappings.length >= 4);
  const transitional = ledger.mappings.filter((item) => item.status === 'deprecated-fallback');
  assert.ok(transitional.length >= 2);
  for (const item of transitional) {
    assert.ok(item.owner);
    assert.ok(item.reason);
    assert.match(item.reviewBy, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.removalCriteria);
  }
});
