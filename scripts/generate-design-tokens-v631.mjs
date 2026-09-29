#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMANTIC_TOKENS_V1 } from '../frontend/src/design-system/semanticTokens.v1.js';

const GENERATED_NOTICE = 'Generated from frontend/src/design-system/semanticTokens.v1.js by scripts/generate-design-tokens-v631.mjs. Do not edit by hand.';
const mainOutput = 'frontend/public/design-system/contagest-semantic-tokens-v1.css';
const hipicoOutput = 'frontend/public/hipico-control/assets/css/platform-tokens-v1.css';
const block = (selector, entries) => `${selector} {\n${entries.map(([name, value]) => `  ${name}: ${value};`).join('\n')}\n}`;

function contaGestEntries(tokens, mode) {
  const color = tokens.color[mode];
  const elevation = tokens.elevation;
  const t = tokens.typography;
  const s = tokens.spacing;
  const r = tokens.radius;
  const c = tokens.controls;
  const l = tokens.layout;
  const m = tokens.motion;
  const shadow1 = mode === 'dark' ? elevation.lowDark : elevation.lowLight;
  const shadow2 = mode === 'dark' ? elevation.highDark : elevation.highLight;
  return [
    ['--cg-v-font-sans', t.family.sans], ['--cg-v-font-mono', t.family.mono],
    ['--cg-v-text-2xs', t.roles.metadata], ['--cg-v-text-xs', t.roles.label], ['--cg-v-text-sm', t.roles.dense], ['--cg-v-text-md', t.roles.body], ['--cg-v-text-lg', t.roles.headingSmall], ['--cg-v-text-section', t.roles.section], ['--cg-v-text-page', t.roles.page], ['--cg-v-text-kpi', t.roles.kpi],
    ['--cg-v-leading-tight', t.lineHeight.tight], ['--cg-v-leading-body', t.lineHeight.body], ['--cg-v-weight-regular', t.weight.regular], ['--cg-v-weight-medium', t.weight.medium], ['--cg-v-weight-semibold', t.weight.semibold], ['--cg-v-weight-strong', t.weight.strong], ['--cg-v-weight-bold', t.weight.bold],
    ['--cg-v-space-0', s.none], ['--cg-v-space-1', s.xs], ['--cg-v-space-2', s.sm], ['--cg-v-space-3', s.md], ['--cg-v-space-4', s.lg], ['--cg-v-space-5', s.xl], ['--cg-v-space-6', s.xxl], ['--cg-v-space-8', s.xxxl],
    ['--cg-v-radius-xs', r.xs], ['--cg-v-radius-sm', r.sm], ['--cg-v-radius-md', r.md], ['--cg-v-radius-lg', r.lg], ['--cg-v-radius-xl', r.xl],
    ['--cg-v-control-sm', c.small], ['--cg-v-control-dense', c.dense], ['--cg-v-control-tabs', c.tabs], ['--cg-v-control', c.default], ['--cg-v-control-touch', c.touch], ['--cg-v-control-chip', c.chip],
    ['--cg-v-page-max', l.pageMax], ['--cg-v-reading-max', l.readingMax], ['--cg-v-card-min', l.cardMin], ['--cg-v-kpi-min', l.kpiMin], ['--cg-v-table-row', l.tableRow],
    ['--cg-v-bg', color.background], ['--cg-v-surface', color.surface], ['--cg-v-surface-2', color.surfaceSubtle], ['--cg-v-surface-3', color.surfaceRaised], ['--cg-v-elevated', color.elevated], ['--cg-v-sidebar', color.sidebar], ['--cg-v-text', color.textPrimary], ['--cg-v-text-muted', color.textSecondary], ['--cg-v-text-subtle', color.textMuted], ['--cg-v-text-inverse', color.textInverse],
    ['--cg-v-border', color.border], ['--cg-v-border-strong', color.borderStrong], ['--cg-v-divider', color.divider], ['--cg-v-brand', color.brand], ['--cg-v-brand-hover', color.brandHover], ['--cg-v-brand-soft', color.brandSoft], ['--cg-v-accent', color.accent],
    ['--cg-v-success', color.success], ['--cg-v-success-soft', color.successSoft], ['--cg-v-warning', color.warning], ['--cg-v-warning-soft', color.warningSoft], ['--cg-v-danger', color.danger], ['--cg-v-danger-soft', color.dangerSoft], ['--cg-v-info', color.info], ['--cg-v-info-soft', color.infoSoft], ['--cg-v-focus', color.focus],
    ['--cg-v-interactive-hover', color.interactiveHover], ['--cg-v-interactive-pressed', color.interactivePressed], ['--cg-v-interactive-disabled', color.interactiveDisabled], ['--cg-v-interactive-selected', color.interactiveSelected], ['--cg-v-shadow-1', shadow1], ['--cg-v-shadow-2', shadow2], ['--cg-v-overlay', color.overlay],
    ['--cg-v-ease', m.easing], ['--cg-v-duration-fast', m.fast], ['--cg-v-duration', m.standard], ['--cg-v-z-sticky', tokens.zIndex.sticky], ['--cg-v-z-dropdown', tokens.zIndex.dropdown], ['--cg-v-z-overlay', tokens.zIndex.overlay], ['--cg-v-z-modal', tokens.zIndex.modal], ['--cg-v-z-toast', tokens.zIndex.toast],
    ['--cg-v-breakpoint-mobile', `${l.breakpoints.mobile}px`], ['--cg-v-breakpoint-tablet', `${l.breakpoints.tablet}px`], ['--cg-v-breakpoint-desktop', `${l.breakpoints.desktop}px`],
    ['--cg-font-sans', 'var(--cg-v-font-sans)'], ['--cg-font-mono', 'var(--cg-v-font-mono)'], ['--cg-text-xs', 'var(--cg-v-text-2xs)'], ['--cg-text-sm', 'var(--cg-v-text-xs)'], ['--cg-text-md', 'var(--cg-v-text-sm)'], ['--cg-text-base', 'var(--cg-v-text-md)'], ['--cg-text-lg', 'var(--cg-v-text-lg)'], ['--cg-text-xl', 'var(--cg-v-text-page)'],
    ['--cg-radius-sm', 'var(--cg-v-radius-sm)'], ['--cg-radius-md', 'var(--cg-v-radius-md)'], ['--cg-radius-lg', 'var(--cg-v-radius-lg)'], ['--cg-control-sm', 'var(--cg-v-control-sm)'], ['--cg-control', 'var(--cg-v-control)'],
    ['--cg-bg', 'var(--cg-v-bg)'], ['--cg-surface', 'var(--cg-v-surface)'], ['--cg-surface-soft', 'var(--cg-v-surface-2)'], ['--cg-text', 'var(--cg-v-text)'], ['--cg-text-muted', 'var(--cg-v-text-muted)'], ['--cg-border', 'var(--cg-v-border)'], ['--cg-primary', 'var(--cg-v-brand)'], ['--cg-primary-hover', 'var(--cg-v-brand-hover)'], ['--cg-success', 'var(--cg-v-success)'], ['--cg-warning', 'var(--cg-v-warning)'], ['--cg-danger', 'var(--cg-v-danger)'], ['--cg-focus', 'var(--cg-v-focus)'], ['--cg-shadow', 'var(--cg-v-shadow-1)'],
    ['--cgx-bg', 'var(--cg-v-bg)'], ['--cgx-surface', 'var(--cg-v-surface)'], ['--cgx-surface-soft', 'var(--cg-v-surface-2)'], ['--cgx-text', 'var(--cg-v-text)'], ['--cgx-muted', 'var(--cg-v-text-muted)'], ['--cgx-border', 'var(--cg-v-border)'], ['--cgx-brand', 'var(--cg-v-brand)']
  ];
}

function hipicoEntries(tokens, mode) {
  const hipico = tokens.products.hipico;
  const color = hipico[mode];
  const r = hipico.radius;
  const t = hipico.typography;
  const c = hipico.controls;
  return [
    ['--hc-font-sans', tokens.typography.family.sans], ['font-family', 'var(--hc-font-sans)'],
    ['--hc-text-2xs', t.metadata], ['--hc-text-xs', t.label], ['--hc-text-sm', t.body], ['--hc-text-touch', t.touch], ['--hc-text-heading', t.heading], ['--hc-text-section', t.section], ['--hc-text-page', t.page], ['--hc-text-kpi', t.kpi],
    ['--hc-control-sm', c.small], ['--hc-control', c.default], ['--hc-control-primary', c.primary], ['--hc-touch', c.touch],
    ['--hc-bg', color.background], ['--hc-surface', color.surface], ['--hc-surface-subtle', color.surfaceSubtle], ['--hc-surface-raised', color.surfaceRaised], ['--hc-border', color.border], ['--hc-border-strong', color.borderStrong], ['--hc-text', color.textPrimary], ['--hc-text-muted', color.textSecondary],
    ['--hc-brand', color.brand], ['--hc-brand-foreground', color.brandForeground], ['--hc-brand-hover', color.brandHover], ['--hc-brand-soft', color.brandSoft], ['--hc-accent', color.accent], ['--hc-success', color.success], ['--hc-success-soft', color.successSoft], ['--hc-warning', color.warning], ['--hc-warning-soft', color.warningSoft], ['--hc-danger', color.danger], ['--hc-danger-soft', color.dangerSoft], ['--hc-info', color.info], ['--hc-info-soft', color.infoSoft], ['--hc-focus', color.focus], ['--hc-group', color.group],
    ['--hc-radius-xs', r.xs], ['--hc-radius-sm', r.sm], ['--hc-radius-md', r.md], ['--hc-radius-lg', r.lg], ['--hc-radius-xl', r.xl], ['--hc-shadow-sm', color.shadowSmall], ['--hc-shadow-md', color.shadowMedium], ['--hc-duration-fast', tokens.motion.fast], ['--hc-duration', tokens.motion.standard], ['--hc-ease', tokens.motion.easing],
    ['--hc-breakpoint-mobile', `${tokens.layout.breakpoints.mobile}px`], ['--hc-breakpoint-tablet', `${tokens.layout.breakpoints.tablet}px`], ['--hc-breakpoint-desktop', `${tokens.layout.breakpoints.desktop}px`]
  ];
}

export function renderContaGestCss(tokens = SEMANTIC_TOKENS_V1) {
  const light = block(':root', [['color-scheme', 'light'], ...contaGestEntries(tokens, 'light')]);
  const dark = block('html.dark,\nhtml[data-theme="dark"]', [['color-scheme', 'dark'], ...contaGestEntries(tokens, 'dark')]);
  const system = block('  html[data-theme="system"]', [['color-scheme', 'dark'], ...contaGestEntries(tokens, 'dark')]);
  const reduced = block('  :root', [['--cg-v-duration-fast', tokens.motion.reduced], ['--cg-v-duration', tokens.motion.reduced]]);
  return `/* ${GENERATED_NOTICE} */\n/* Active unlayered token adapter; historical layered declarations are transitional fallbacks. */\n${light}\n\n${dark}\n\n@media (prefers-color-scheme: dark) {\n${system}\n}\n\n@media (prefers-reduced-motion: reduce) {\n${reduced}\n}\n`;
}

export function renderHipicoCss(tokens = SEMANTIC_TOKENS_V1) {
  const light = block(':root', [['color-scheme', 'light'], ...hipicoEntries(tokens, 'light')]);
  const dark = block(':root[data-theme="dark"]', [['color-scheme', 'dark'], ...hipicoEntries(tokens, 'dark')]);
  const system = block('  :root[data-theme="system"]', [['color-scheme', 'dark'], ...hipicoEntries(tokens, 'dark')]);
  const reduced = block('  :root', [['--hc-duration-fast', tokens.motion.reduced], ['--hc-duration', tokens.motion.reduced]]);
  const reducedElements = block('  *,\n  *::before,\n  *::after', [['scroll-behavior', 'auto !important'], ['transition-duration', '0.01ms !important'], ['animation-duration', '0.01ms !important'], ['animation-iteration-count', '1 !important']]);
  return `/* ${GENERATED_NOTICE} */\n/* Hípico consumes shared platform semantics plus the documented equestrian-operations variant. */\n${light}\n\n${dark}\n\n@media (prefers-color-scheme: dark) {\n${system}\n}\n\n@media (prefers-reduced-motion: reduce) {\n${reduced}\n${reducedElements}\n}\n`;
}

const outputs = () => [[mainOutput, renderContaGestCss()], [hipicoOutput, renderHipicoCss()]];

export function generateDesignTokenAdapters({ check = false, root = process.cwd() } = {}) {
  let stale = false;
  for (const [relativePath, expected] of outputs()) {
    const absolutePath = path.join(root, relativePath);
    if (check) {
      const actual = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : '';
      if (actual !== expected) { console.error(`[design-tokens][STALE] ${relativePath}`); stale = true; }
      continue;
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, expected);
    console.log(`[design-tokens][WRITE] ${relativePath}`);
  }
  if (check && stale) throw new Error('Generated design-token adapters are stale. Run node scripts/generate-design-tokens-v631.mjs.');
  if (check) console.log(`[design-tokens][PASS] version=${SEMANTIC_TOKENS_V1.version}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { generateDesignTokenAdapters({ check: process.argv.includes('--check') }); }
  catch (error) { console.error(`[design-tokens][FAIL] ${error.message}`); process.exitCode = 1; }
}
