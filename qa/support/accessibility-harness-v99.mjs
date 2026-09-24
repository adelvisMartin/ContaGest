import { readFileSync } from 'node:fs';

export const QA_SESSION = Object.freeze({
  sessionMode: 'cookie',
  mode: 'cookie',
  tenantId: 'qa-tenant',
  tenant: { id: 'qa-tenant', name: 'ContaGest QA', rif: 'J-00000000-0', plan: 'enterprise' },
  user: {
    id: 'qa-admin',
    name: 'QA Admin',
    fullName: 'QA Admin',
    email: 'qa@contagest.local',
    role: 'admin',
    permissions: ['*'],
  },
  audience: 'staff',
  expiresAt: Date.now() + 8 * 60 * 60 * 1000,
});

export const CI_CONTEXTS = Object.freeze([
  { name: 'desktop-light', width: 1440, height: 900, theme: 'light', touch: false },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark', touch: true },
]);

export const FULL_CONTEXTS = Object.freeze([
  ...CI_CONTEXTS,
  { name: 'desktop-dark', width: 1440, height: 900, theme: 'dark', touch: false },
  { name: 'tablet-light', width: 768, height: 1024, theme: 'light', touch: true },
]);

const CRITICAL_COMPONENT_EXPECTATIONS = Object.freeze({
  login: ['form'],
  ventas: ['table, [role="grid"], form'],
  inventario: ['table, [role="grid"], form'],
  tributos: ['table, [role="grid"], form'],
  contabilidad: ['table, [role="grid"], form'],
  'libro-mayor': ['table, [role="grid"]'],
  'balance-sumas-saldos': ['table, [role="grid"]'],
  'hoja-trabajo': ['table, [role="grid"]'],
  'estados-financieros': ['table, [role="grid"]'],
  'cierre-contable': ['form, table, [role="grid"]'],
  bancos: ['table, [role="grid"], form'],
  nomina: ['table, [role="grid"], form'],
  compras: ['table, [role="grid"], form'],
  auditoria: ['table, [role="grid"]'],
  admin: ['table, [role="grid"], form'],
  'plan-cuentas': ['table, [role="grid"]'],
  'pos-sede': ['form, table, [role="grid"]'],
  kardex: ['table, [role="grid"]'],
  veterinaria: ['form, table, [role="grid"]'],
  psicologia: ['form, table, [role="grid"], .cg-psych-calendar'],
  odontologia: ['form, table, [role="grid"]'],
});

export function selectedContexts() {
  return process.env.CG_A11Y_MATRIX === 'full' ? FULL_CONTEXTS : CI_CONTEXTS;
}

export function loadWaivers() {
  const parsed = JSON.parse(readFileSync(new URL('../accessibility-waivers-v99.json', import.meta.url), 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

export async function seedAccessibilitySession(page) {
  await page.addInitScript((session) => {
    localStorage.setItem('contagest_auth_session', JSON.stringify(session));
    window.confirm = () => false;
    window.open = () => null;
  }, QA_SESSION);

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: QA_SESSION }) });
    }
    if (pathname.endsWith('/auth/captcha')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            token: 'qa-a11y-token',
            question: '2 + 2',
            prompt: 'Resuelve 2 + 2',
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
        }),
      });
    }
    const data = request.method() === 'GET' ? [] : {};
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
}

export async function persistTheme(page, theme) {
  if (!page.url().startsWith('http')) return;
  await page.evaluate((themeName) => {
    const key = 'contagest_ve_enterprise_v7_state';
    let previous = {};
    try {
      previous = JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch {}
    localStorage.setItem(key, JSON.stringify({ ...previous, settings: { ...(previous.settings || {}), theme: themeName } }));
  }, theme);
}

export async function openAccessibilityRoute(page, item, context, index = 0) {
  await page.setViewportSize({ width: context.width, height: context.height });
  if (index > 0) await persistTheme(page, context.theme);
  await page.goto(`/?module=${encodeURIComponent(item.route)}`, { waitUntil: 'domcontentloaded' });
  const root = item.standalone ? '.login-shell' : '#pages';
  await page.waitForSelector(root, { state: 'attached', timeout: 20_000 });
  await page.waitForFunction((selector) => {
    const host = document.querySelector(selector);
    if (!host) return false;
    return Boolean(host.querySelector('button,a[href],input,select,textarea,table,form,[role="button"],[role="tab"]'));
  }, root, { timeout: 20_000 }).catch(() => {});
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

export async function inspectRepresentativeState(page, item) {
  const selectors = CRITICAL_COMPONENT_EXPECTATIONS[item.route];
  if (!selectors) return { required: false, rendered: true, selector: null };
  const selector = selectors.join(', ');
  const rendered = await page.locator(selector).count().then((count) => count > 0);
  return { required: true, rendered, selector };
}

export async function scanAutomatedAccessibility(page, item) {
  return page.evaluate(({ standalone, route }) => {
    const root = document.querySelector(standalone ? '.login-shell' : '#pages');
    const findings = [];
    if (!root) return [{ rule: 'route-root', severity: 'critical', message: 'No se encontró root de la ruta', selector: route }];

    const visible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 1 && rect.height > 1;
    };
    const selectorFor = (node) => {
      if (!(node instanceof Element)) return String(node);
      if (node.id) return `#${CSS.escape(node.id)}`;
      const name = node.getAttribute('name');
      if (name) return `${node.tagName.toLowerCase()}[name="${name.replaceAll('"', '\\"')}"]`;
      const cls = [...node.classList].slice(0, 2).map((value) => `.${CSS.escape(value)}`).join('');
      return `${node.tagName.toLowerCase()}${cls}`;
    };
    const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const labelledByText = (node) => text((node.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent).join(' '));
    const accessibleName = (node) => text(
      node.getAttribute('aria-label') ||
      labelledByText(node) ||
      node.getAttribute('alt') ||
      node.getAttribute('title') ||
      (node instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(node.type) ? node.value : '') ||
      node.textContent,
    );
    const add = (rule, severity, node, message, wcag) => findings.push({ rule, severity, selector: selectorFor(node), message, wcag });

    const ids = [...document.querySelectorAll('[id]')].map((node) => node.id).filter(Boolean);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    for (const id of duplicates.slice(0, 20)) findings.push({ rule: 'duplicate-id', severity: 'serious', selector: `#${id}`, message: `ID duplicado: ${id}`, wcag: '4.1.1' });

    for (const node of root.querySelectorAll('button,a[href],input[type="button"],input[type="submit"],[role="button"],[role="link"],[role="menuitem"],[role="tab"]')) {
      if (!visible(node)) continue;
      if (!accessibleName(node)) add('accessible-name', 'serious', node, 'Control interactivo sin nombre accesible', '4.1.2');
    }

    for (const node of root.querySelectorAll('input:not([type="hidden"]),select,textarea')) {
      if (!visible(node) || node.disabled) continue;
      const id = node.id;
      const hasLabel = Boolean(
        node.getAttribute('aria-label') ||
        node.getAttribute('aria-labelledby') ||
        (id && root.querySelector(`label[for="${CSS.escape(id)}"]`)) ||
        node.closest('label') ||
        node.getAttribute('title'),
      );
      if (!hasLabel) add('form-label', 'serious', node, 'Campo de formulario sin label/nombre asociado', '1.3.1');
      if (node.getAttribute('aria-invalid') === 'true' && !node.getAttribute('aria-describedby')) {
        add('error-description', 'serious', node, 'Campo inválido sin aria-describedby hacia el error', '3.3.1');
      }
    }

    for (const node of root.querySelectorAll('[aria-labelledby],[aria-describedby],[aria-controls]')) {
      for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        const value = node.getAttribute(attr);
        if (!value) continue;
        for (const id of value.split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) add('aria-reference', 'serious', node, `${attr} referencia ID inexistente: ${id}`, '4.1.2');
        }
      }
    }

    for (const image of root.querySelectorAll('img')) {
      if (!image.hasAttribute('alt')) add('image-alt', 'serious', image, 'Imagen sin atributo alt', '1.1.1');
    }

    for (const hidden of root.querySelectorAll('[aria-hidden="true"]')) {
      const focusable = hidden.matches('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')
        ? hidden
        : hidden.querySelector('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (focusable && visible(focusable)) add('aria-hidden-focus', 'serious', focusable, 'Elemento enfocable expuesto dentro de aria-hidden=true', '4.1.2');
    }

    for (const table of root.querySelectorAll('table')) {
      if (!visible(table)) continue;
      if (!table.querySelector('th,[role="columnheader"],[role="rowheader"]')) {
        add('table-headers', 'serious', table, 'Tabla visible sin encabezados semánticos', '1.3.1');
      }
    }

    for (const node of root.querySelectorAll('[tabindex]')) {
      const value = Number(node.getAttribute('tabindex'));
      if (Number.isFinite(value) && value > 0) add('positive-tabindex', 'moderate', node, 'tabindex positivo altera el orden natural de teclado', '2.4.3');
    }

    if (!standalone && !document.querySelector('main,[role="main"],#pages')) {
      findings.push({ rule: 'main-landmark', severity: 'moderate', selector: route, message: 'No se detectó landmark principal', wcag: '1.3.1' });
    }

    if (innerWidth <= 430) {
      for (const node of root.querySelectorAll('button,a[href],[role="button"],[role="link"]')) {
        if (!visible(node)) continue;
        const rect = node.getBoundingClientRect();
        const hasText = Boolean(text(node.textContent));
        if (rect.height < 24 || (!hasText && rect.width < 24)) add('target-size-minimum', 'serious', node, `Target táctil menor a 24px (${Math.round(rect.width)}×${Math.round(rect.height)})`, '2.5.8');
        else if (rect.height < 44 || (!hasText && rect.width < 44)) add('target-size-advisory', 'moderate', node, `Target táctil menor al contrato ContaGest de 44px (${Math.round(rect.width)}×${Math.round(rect.height)})`, '2.5.8');
      }
    }

    const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((node) => Number(node.tagName.slice(1)));
    for (let index = 1; index < headings.length; index += 1) {
      if (headings[index] - headings[index - 1] > 1) {
        findings.push({ rule: 'heading-order', severity: 'moderate', selector: route, message: `Salto de encabezado h${headings[index - 1]}→h${headings[index]}`, wcag: '1.3.1' });
        break;
      }
    }

    return findings;
  }, { standalone: Boolean(item.standalone), route: item.route });
}

async function focusedState(page) {
  return page.evaluate(async () => {
    const node = document.activeElement;
    if (!(node instanceof HTMLElement) || node === document.body) {
      return { key: 'body', token: 'body', visible: true, obscured: false, outsideViewport: false };
    }

    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const key = node.id || node.getAttribute('name') || node.getAttribute('aria-label') || node.textContent?.trim().slice(0, 60) || node.tagName;
    const focusables = [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[tabindex]:not([tabindex="-1"])')];
    const token = node.id || node.getAttribute('name') || `${node.tagName}:${focusables.indexOf(node)}`;
    const left = Math.max(0, rect.left);
    const right = Math.min(innerWidth, rect.right);
    const topEdge = Math.max(0, rect.top);
    const bottom = Math.min(innerHeight, rect.bottom);
    const outsideViewport = right <= left || bottom <= topEdge;
    const pointX = outsideViewport ? 0 : left + (right - left) / 2;
    const pointY = outsideViewport ? 0 : topEdge + (bottom - topEdge) / 2;
    const top = outsideViewport ? null : document.elementFromPoint(pointX, pointY);
    const obscured = Boolean(top && top !== node && !node.contains(top) && !top.contains(node));

    return {
      key,
      token,
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      obscured,
      outsideViewport,
    };
  });
}

export async function auditKeyboardAndFocus(page, item) {
  const rootSelector = item.standalone ? '.login-shell' : '#pages';
  const focusableSelector = `${rootSelector} a[href], ${rootSelector} button:not([disabled]), ${rootSelector} input:not([disabled]):not([type="hidden"]), ${rootSelector} select:not([disabled]), ${rootSelector} textarea:not([disabled]), ${rootSelector} [tabindex]:not([tabindex="-1"])`;
  const count = await page.locator(focusableSelector).count();
  if (count === 0) {
    return [{ rule: 'keyboard-operability', severity: 'serious', selector: rootSelector, message: 'Ruta interactiva sin elementos enfocables por teclado', wcag: '2.1.1' }];
  }

  await page.locator('body').click({ position: { x: 2, y: 2 } }).catch(() => {});
  const samples = [];
  const findings = [];
  const iterations = Math.min(Math.max(count + 2, 4), 16);

  await page.keyboard.press('Tab');
  const first = await focusedState(page);
  samples.push(first);

  if (iterations > 1) {
    await page.keyboard.press('Tab');
    const second = await focusedState(page);
    samples.push(second);

    if (count > 1 && first.token !== 'body' && second.token !== 'body' && first.token !== second.token) {
      await page.keyboard.press('Shift+Tab');
      const backward = await focusedState(page);
      if (backward.token !== first.token) {
        findings.push({ rule: 'reverse-tab', severity: 'serious', selector: rootSelector, message: 'Shift+Tab no regresa al control anterior', wcag: '2.1.1' });
      }
      await page.keyboard.press('Tab');
    }
  }

  for (let index = samples.length; index < iterations; index += 1) {
    await page.keyboard.press('Tab');
    samples.push(await focusedState(page));
  }

  const unique = new Set(samples.filter((sample) => sample.token !== 'body').map((sample) => sample.token));
  if (count > 1 && unique.size < 2) {
    findings.push({ rule: 'keyboard-trap', severity: 'serious', selector: rootSelector, message: 'Tab no alcanzó al menos dos controles únicos', wcag: '2.1.2' });
  }
  for (const sample of samples) {
    if (!sample.visible) findings.push({ rule: 'focus-hidden', severity: 'serious', selector: String(sample.key), message: 'El foco llegó a un elemento no visible', wcag: '2.4.7' });
    if (sample.obscured || sample.outsideViewport) findings.push({ rule: 'focus-not-obscured', severity: 'serious', selector: String(sample.key), message: 'El elemento enfocado está fuera de viewport u oculto por otra capa', wcag: '2.4.11' });
  }

  return findings;
}

export async function auditReducedMotion(page, item) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const matches = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (!matches) return [{ rule: 'reduced-motion-media', severity: 'serious', selector: item.route, message: 'El navegador no aplicó prefers-reduced-motion: reduce', wcag: '2.3.3' }];
  const activeLongAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => {
    const timing = animation.effect?.getComputedTiming?.();
    return animation.playState === 'running' && Number(timing?.duration || 0) > 500;
  }).length);
  return activeLongAnimations > 0
    ? [{ rule: 'reduced-motion-animation', severity: 'moderate', selector: item.route, message: `${activeLongAnimations} animaciones >500ms siguen activas con reduced motion`, wcag: '2.3.3' }]
    : [];
}

export async function auditZoomProxy(page, item) {
  const original = page.viewportSize();
  if (!original) return [{ rule: 'zoom-root', severity: 'critical', selector: item.route, message: 'No se pudo determinar el viewport para el proxy de zoom 200%', wcag: '1.4.4' }];

  const effectiveWidth = Math.max(320, Math.floor(original.width / 2));
  await page.setViewportSize({ width: effectiveWidth, height: original.height });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  try {
    const result = await page.evaluate(({ standalone }) => {
      const root = document.querySelector(standalone ? '.login-shell' : '#pages');
      if (!root) return { missing: true, overflow: false, clipped: [] };
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 1 && rect.height > 1;
      };
      const clipped = [...root.querySelectorAll('button,label,input,select,textarea,h1,h2,h3,p')]
        .filter(visible)
        .filter((node) => getComputedStyle(node).overflow === 'hidden' && (node.scrollWidth > node.clientWidth + 3 || node.scrollHeight > node.clientHeight + 3))
        .slice(0, 8)
        .map((node) => node.id || node.getAttribute('name') || node.textContent?.trim().slice(0, 60) || node.tagName);
      return {
        missing: false,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
        clipped,
      };
    }, { standalone: Boolean(item.standalone) });

    const findings = [];
    if (result.missing) findings.push({ rule: 'zoom-root', severity: 'critical', selector: item.route, message: 'No se pudo evaluar el proxy de zoom 200% porque falta el root', wcag: '1.4.4' });
    if (result.overflow) findings.push({ rule: 'zoom-overflow', severity: 'serious', selector: item.route, message: `Proxy de zoom 200% (${effectiveWidth}px CSS) introduce overflow horizontal`, wcag: '1.4.10' });
    for (const selector of result.clipped) findings.push({ rule: 'zoom-clipping', severity: 'serious', selector: String(selector), message: 'Texto/control se recorta con proxy de zoom 200%', wcag: '1.4.4' });
    return findings;
  } finally {
    await page.setViewportSize(original);
  }
}

export function applyWaivers(findings, waivers, context) {
  const now = Date.now();
  return findings.map((finding) => {
    const waiver = waivers.find((candidate) =>
      candidate?.route === context.route &&
      candidate?.rule === finding.rule &&
      candidate?.selector === finding.selector &&
      candidate?.owner &&
      candidate?.justification &&
      Date.parse(candidate?.reviewAfter || '') > now,
    );
    return waiver ? { ...finding, waived: true, waiver } : { ...finding, waived: false };
  });
}

export function blockingFindings(findings) {
  return findings.filter((finding) => !finding.waived && ['critical', 'serious'].includes(finding.severity));
}
