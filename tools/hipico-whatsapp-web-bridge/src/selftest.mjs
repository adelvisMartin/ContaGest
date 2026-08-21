import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'hipico-bridge-selftest-'));
let context;
let channel = 'chrome';
try {
  try {
    context = await chromium.launchPersistentContext(temp, { headless: true, channel: 'chrome', chromiumSandbox: true });
  } catch {
    channel = 'msedge';
    context = await chromium.launchPersistentContext(temp, { headless: true, channel: 'msedge', chromiumSandbox: true });
  }
  const page = context.pages()[0] || await context.newPage();
  await page.setContent('<h1>OK</h1>');
  const ok = await page.textContent('h1');
  if (ok !== 'OK') throw new Error('Browser DOM self-test failed');
  console.log(`SELFTEST_OK playwright=1.62.1 channel=${channel}`);
} finally {
  await context?.close().catch(() => {});
  await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
}
