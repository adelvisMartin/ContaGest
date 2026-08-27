import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const primitives = readFileSync(new URL('../frontend/src/components/ui/cg/CgPrimitives.jsx', import.meta.url), 'utf8');
const muiRuntime = readFileSync(new URL('../frontend/src/components/muiRuntime.js', import.meta.url), 'utf8');
const brand = readFileSync(new URL('../frontend/src/pages/BrandGuidelinesPage.js', import.meta.url), 'utf8');
const help = readFileSync(new URL('../frontend/src/pages/HelpPage.js', import.meta.url), 'utf8');
const agents = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');
const adr = readFileSync(new URL('../docs/design/ADR-100-MUI9-DESIGN-SYSTEM.md', import.meta.url), 'utf8');
const styleGuide = readFileSync(new URL('../docs/design/DESIGN_SYSTEM.md', import.meta.url), 'utf8');

test('issue #100 Cg primitives reuse the canonical ContaGest MUI theme instead of defining another palette', () => {
  assert.match(primitives, /createContaGestMuiTheme/);
  assert.match(primitives, /muiModeFor/);
  assert.doesNotMatch(primitives, /createTheme\s*\(/);
  assert.match(muiRuntime, /export function createContaGestMuiTheme/);
});

test('issue #100 initial Cg set covers foundation primitives and accessibility names', () => {
  for (const name of ['CgButton','CgIconButton','CgTextField','CgSelect','CgDialog','CgPageHeader','CgStatusChip','CgEmptyState','CgMoney','CgDataTable']) {
    assert.match(primitives, new RegExp(`export function ${name}\\b`));
  }
  assert.match(primitives, /CgIconButton requires an accessible label/);
  assert.match(primitives, /aria-label=\{label\}/);
  assert.match(primitives, /aria-labelledby="cg-dialog-title"/);
});

test('issue #100 pilots are low-risk surfaces and prevent legacy double promotion', () => {
  assert.match(brand, /cgDesignSystemPilot/);
  assert.match(help, /cgHelpMuiPilot/);
  assert.match(brand, /data-no-mui/);
  assert.match(help, /data-no-mui/);
  assert.match(brand, /mountCgFoundationPilot/);
  assert.match(help, /mountCgFoundationPilot/);
  assert.doesNotMatch(brand + help, /AccountingClose|Ledger|Banking|Tax/);
});

test('issue #100 preserves six CSS owners and introduces no new stylesheet', () => {
  assert.match(agents, /contains exactly six CSS owners/);
  assert.doesNotMatch(primitives, /\.css['"]/);
  assert.match(styleGuide, /exactamente los owners definidos por `AGENTS\.md`/);
  for (const owner of ['contagest-visual-system-v12.css','erp-runtime.css','module-adapters.css','runtime-primitives-v13.css','shell-contract.css','shell-stability-v1127.css']) {
    assert.match(styleGuide, new RegExp(owner.replaceAll('.', '\\.')));
  }
});

test('issue #100 keeps MUI X Pro/Premium and competing UI libraries out of the foundation', () => {
  assert.match(adr, /Pro\/Premium: \*\*fuera de alcance\*\*/);
  assert.match(adr, /MUI X Community/);
  for (const forbidden of ['@mui/x-data-grid-pro','@mui/x-data-grid-premium','@chakra-ui','antd','mantine','primereact','@shadcn']) {
    assert.doesNotMatch(primitives, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('issue #100 does not install MUI MCP/latest implicitly and keeps Playwright authority documented', () => {
  assert.match(adr, /este PR no los instala ni ejecuta/);
  assert.match(adr, /Playwright MCP continúa siendo la autoridad browser\/evidence/);
  assert.doesNotMatch(primitives, /@mui\/mcp/);
});
