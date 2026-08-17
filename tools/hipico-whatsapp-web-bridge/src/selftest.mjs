import { chromium } from 'playwright-core';

if (!chromium || typeof chromium.launch !== 'function' || typeof chromium.launchPersistentContext !== 'function') {
  throw new Error('playwright-core no expone Chromium con el contrato esperado.');
}

let browser;
let channel = 'chrome';
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
} catch (chromeError) {
  channel = 'msedge';
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (edgeError) {
    throw new Error(
      `No pude abrir Google Chrome ni Microsoft Edge con Playwright. Chrome: ${chromeError.message}. Edge: ${edgeError.message}`
    );
  }
}

const page = await browser.newPage();
await page.goto('data:text/html,<title>Control Hipico</title><h1>OK</h1>');
const title = await page.title();
await browser.close();

if (title !== 'Control Hipico') {
  throw new Error('El navegador no paso la prueba de control.');
}

console.log(`SELFTEST_OK playwright=1.62.1 channel=${channel}`);
