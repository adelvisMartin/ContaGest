import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import {
  FULL_CONTEXTS,
  applyWaivers,
  auditKeyboardAndFocus,
  auditReducedMotion,
  auditZoomProxy,
  blockingFindings,
  inspectRepresentativeState,
  loadWaivers,
  openAccessibilityRoute,
  scanAutomatedAccessibility,
  seedAccessibilitySession,
  selectedContexts,
} from './support/accessibility-harness-v99.mjs';

test.setTimeout(240_000);

const candidateSha = String(process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'local').trim();
const matrixMode = process.env.CG_A11Y_MATRIX === 'full' ? 'full' : 'ci';
const contexts = selectedContexts();
const waivers = loadWaivers();
const records = [];

function recordResult(entry) {
  records.push({ candidateSha, matrixMode, timestamp: new Date().toISOString(), ...entry });
}

function writeReport() {
  const reportPath = resolve('artifacts/qa/accessibility-v99/report.json');
  mkdirSync(dirname(reportPath), { recursive: true });
  const counts = records.reduce((acc, record) => {
    acc[record.status] = (acc[record.status] || 0) + 1;
    return acc;
  }, { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_EXECUTED: 0 });
  const report = {
    schemaVersion: 1,
    candidateSha,
    matrixMode,
    generatedAt: new Date().toISOString(),
    routeCount: MODULE_VISUAL_CATALOG.length,
    contexts: contexts.map((context) => context.name),
    counts,
    records,
    disclaimer: 'Automated baseline evidence only; this is not external WCAG certification.',
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(
    resolve('artifacts/qa/accessibility-v99/summary.md'),
    `# WCAG 2.2 AA baseline — ${candidateSha}\n\nMode: ${matrixMode}\n\n- PASS: ${counts.PASS}\n- FAIL: ${counts.FAIL}\n- BLOCKED: ${counts.BLOCKED}\n- NOT_EXECUTED: ${counts.NOT_EXECUTED}\n\nAutomated evidence is complementary to the manual checklist.\n`,
    'utf8',
  );
}

test.afterAll(() => writeReport());

for (const item of MODULE_VISUAL_CATALOG) {
  test(`${item.route} · WCAG 2.2 AA automated baseline`, async ({ page }) => {
    await seedAccessibilitySession(page);
    const routeFailures = [];

    for (let index = 0; index < contexts.length; index += 1) {
      const context = contexts[index];
      const pageErrors = [];
      const consoleErrors = [];
      const onPageError = (error) => pageErrors.push(String(error?.message || error));
      const onConsole = (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      };
      page.on('pageerror', onPageError);
      page.on('console', onConsole);

      try {
        await openAccessibilityRoute(page, item, context, index);
        await expect(page.locator('body')).toHaveAttribute('data-route', item.route);

        const representative = await inspectRepresentativeState(page, item);
        const automated = await scanAutomatedAccessibility(page, item);
        const keyboard = await auditKeyboardAndFocus(page, item);
        const reducedMotion = index === 0 ? await auditReducedMotion(page, item) : [];
        const zoom = item.priority === 'critical' && index === 0 ? await auditZoomProxy(page, item) : [];
        const findings = applyWaivers(
          [...automated, ...keyboard, ...reducedMotion, ...zoom],
          waivers,
          { route: item.route, context: context.name },
        );
        const blockers = blockingFindings(findings);
        const blocked = representative.required && !representative.rendered;
        const status = blocked ? 'BLOCKED' : blockers.length || pageErrors.length ? 'FAIL' : 'PASS';

        recordResult({
          route: item.route,
          family: item.family,
          priority: item.priority,
          context: context.name,
          viewport: { width: context.width, height: context.height },
          theme: context.theme,
          status,
          representative,
          findings,
          pageErrors,
          consoleErrors: consoleErrors.slice(0, 12),
        });

        if (status !== 'PASS') {
          routeFailures.push({ context: context.name, status, representative, blockers, pageErrors, consoleErrors: consoleErrors.slice(0, 6) });
        }
      } catch (error) {
        const detail = String(error?.message || error);
        recordResult({
          route: item.route,
          family: item.family,
          priority: item.priority,
          context: context.name,
          viewport: { width: context.width, height: context.height },
          theme: context.theme,
          status: 'BLOCKED',
          findings: [],
          pageErrors,
          consoleErrors: consoleErrors.slice(0, 12),
          error: detail,
        });
        routeFailures.push({ context: context.name, status: 'BLOCKED', error: detail });
      } finally {
        page.off('pageerror', onPageError);
        page.off('console', onConsole);
      }
    }

    if (matrixMode !== 'full') {
      const selected = new Set(contexts.map((context) => context.name));
      for (const context of FULL_CONTEXTS.filter((candidate) => !selected.has(candidate.name))) {
        recordResult({
          route: item.route,
          family: item.family,
          priority: item.priority,
          context: context.name,
          viewport: { width: context.width, height: context.height },
          theme: context.theme,
          status: 'NOT_EXECUTED',
          reason: 'Contexto reservado para matriz full/nightly.',
          findings: [],
        });
      }
    }

    expect(routeFailures, JSON.stringify(routeFailures, null, 2)).toEqual([]);
  });
}

test('harness detecta fixtures deliberadamente rotos', async ({ page }) => {
  await page.setContent(`
    <div class="login-shell">
      <button id="nameless"></button>
      <input id="missing-label" />
      <div id="duplicate"></div><span id="duplicate"></span>
      <div aria-hidden="true"><button id="hidden-focus">No debería enfocar</button></div>
    </div>
  `);
  const findings = await scanAutomatedAccessibility(page, { route: 'negative-fixture', standalone: true });
  const rules = new Set(findings.map((finding) => finding.rule));
  expect(rules.has('accessible-name')).toBe(true);
  expect(rules.has('form-label')).toBe(true);
  expect(rules.has('duplicate-id')).toBe(true);
  expect(rules.has('aria-hidden-focus')).toBe(true);
});

test('harness acepta navegación Tab y Shift+Tab normal sin falso positivo', async ({ page }) => {
  await page.setContent(`
    <div class="login-shell">
      <button id="first-ok">Primero</button>
      <button id="second-ok">Segundo</button>
      <button id="third-ok">Tercero</button>
    </div>
  `);
  const findings = await auditKeyboardAndFocus(page, { route: 'keyboard-positive', standalone: true });
  const blockingRules = new Set(findings.filter((finding) => ['critical', 'serious'].includes(finding.severity)).map((finding) => finding.rule));
  expect(blockingRules.has('reverse-tab')).toBe(false);
  expect(blockingRules.has('keyboard-trap')).toBe(false);
  expect(blockingRules.has('focus-not-obscured')).toBe(false);
});

test('harness detecta keyboard trap y foco oscurecido', async ({ page }) => {
  await page.setContent(`
    <div class="login-shell">
      <button id="first">Primero</button>
      <button id="second">Segundo</button>
      <div id="cover" style="position:fixed;inset:0;background:rgba(0,0,0,.01);z-index:99"></div>
    </div>
    <script>
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          document.querySelector('#first').focus();
        }
      });
    </script>
  `);
  const findings = await auditKeyboardAndFocus(page, { route: 'keyboard-negative', standalone: true });
  const rules = new Set(findings.map((finding) => finding.rule));
  expect(rules.has('keyboard-trap')).toBe(true);
  expect(rules.has('focus-not-obscured')).toBe(true);
});

test('contrast negative fixture queda detectado por umbral WCAG AA', async ({ page }) => {
  await page.setContent('<p id="low" style="color:rgb(150,150,150);background:rgb(255,255,255);font-size:16px">Contraste bajo</p>');
  const ratio = await page.locator('#low').evaluate((node) => {
    const parse = (value) => String(value).match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (rgb) => {
      const normalized = rgb.map((value) => value / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
    };
    const style = getComputedStyle(node);
    const foreground = lum(parse(style.color));
    const background = lum(parse(style.backgroundColor));
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(ratio).toBeLessThan(4.5);
});
