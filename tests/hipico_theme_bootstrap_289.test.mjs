import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('theme preference is mirrored synchronously for prepaint bootstrap', async () => {
  const html = await read('frontend/public/hipico-control/index.html');
  const bootstrap = await read('frontend/public/hipico-control/assets/js/theme-bootstrap.js');
  assert.ok(html.indexOf('./assets/js/theme-bootstrap.js') < html.indexOf('./assets/css/app.css'));
  assert.match(bootstrap, /localStorage\.getItem\(['"]hipico-theme['"]\)/);
  assert.match(bootstrap, /localStorage\.setItem\(['"]hipico-theme['"]/);
  assert.match(bootstrap, /\['light',\s*'dark',\s*'system'\]/);
  assert.match(bootstrap, /document\.documentElement\.dataset\.theme/);
  assert.match(bootstrap, /MutationObserver/);
  assert.match(bootstrap, /attributeFilter:\s*\[['"]data-theme['"]\]/);
});
