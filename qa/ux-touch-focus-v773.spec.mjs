import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// #773: browser-level contract for the SINGLE shared UX CSS adapter.
// Isolated fixture validates computed styles, not full 58-route UX acceptance.
const css = readFileSync(new URL('../frontend/public/design-system/contagest-ux-contract-v1.css', import.meta.url), 'utf8');

function fixture() {
  return `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root { --cg-v-focus:#6572ff; --cg-v-brand:#5661e8; --cg-v-control-touch:44px; }
  ${css}
  </style></head><body>
    <button id="action">Continuar</button>
    <label for="date">Fecha</label><input type="date" id="date"/>
    <label for="text">Buscar</label><input type="text" id="text"/>
    <label for="option">Filtrar</label><select id="option"><option>Todos</option></select>
    <label for="description">Descripción</label><textarea id="description"></textarea>
    <label for="checkbox">Aceptar</label><input type="checkbox" id="checkbox"/>
    <input type="hidden" id="hidden"/>
  </body></html>`;
}

for (const width of [360, 390, 430]) {
  test(`#773 coarse mobile ${width}px: actionable fields are at least 44px high`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.setContent(fixture());
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      const controls = await page.evaluate(() => Object.fromEntries(
        ['action','date','text','option','description','checkbox']
          .map(id => [id, document.getElementById(id).getBoundingClientRect().height])
      ));
      for (const id of ['action','date','text','option','description']) {
        expect(controls[id], `${id} at ${width}px`).toBeGreaterThanOrEqual(44);
      }
      expect(controls.checkbox).toBeLessThan(44); // native checkbox is deliberately not stretched
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    } finally {
      await context.close();
    }
  });
}

test('#773 keyboard focus remains visible in forced-colors mode', async ({ page }) => {
  await page.setContent(fixture());
  await page.emulateMedia({ forcedColors: 'active' });
  await page.locator('#action').focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#date')).toBeFocused();
  const outline = await page.locator('#date').evaluate(el => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor };
  });
  expect(outline.style).toBe('solid');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  expect(outline.color).not.toBe('transparent');
  expect(outline.color).not.toBe('rgba(0, 0, 0, 0)');
});
