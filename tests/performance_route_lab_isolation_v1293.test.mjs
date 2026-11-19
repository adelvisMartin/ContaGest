import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLocalLabOrigin, isAllowedLabRequest } from '../qa/support/performance-lab-isolation-v1293.mjs';

const approved = 'http://127.0.0.1:8080';

test('#1293 accepts local base URL and strips only a path, not the origin', () => {
  assert.equal(assertLocalLabOrigin(`${approved}/hipico-control/`), approved);
  assert.equal(assertLocalLabOrigin('http://[::1]:8080/test'), 'http://[::1]:8080');
  assert.equal(isAllowedLabRequest(`${approved}/api/auth/me`, approved), true);
  assert.equal(isAllowedLabRequest(`${approved}/assets/app.js?x=1`, approved), true);
});

test('#1293 blocks external, non-http and cross-port origins', () => {
  for (const url of [
    'https://example.com/api/test', 'https://fonts.example.com/css',
    'http://127.0.0.1:9090/api/test', 'http://localhost:8080/api/test',
    'file:///etc/passwd', 'data:text/html,hello', 'blob:https://example.com/abc',
    'not-a-url', 'http://user:secret@127.0.0.1:8080/api/data',
    'http://127.0.0.1.evil.com:8080/test',
  ]) assert.equal(isAllowedLabRequest(url, approved), false, url);
});

test('#1293 rejects remote or malformed harness base URLs', () => {
  for (const url of ['https://example.com', 'https://evil.local', 'file:///tmp',
    'http://user:pw@127.0.0.1:8080', 'not-a-url', 'http://127.0.0.1.evil.com:8080']) {
    assert.throws(() => assertLocalLabOrigin(url), /PERF1293_REMOTE_ORIGIN_FORBIDDEN/, url);
    assert.equal(isAllowedLabRequest(`${approved}/api/test`, url), false);
  }
});

test('#1293 detects redirect targets which page.route may not intercept', async () => {
  const { isAllowedLabRedirect } = await import('../qa/support/performance-lab-isolation-v1293.mjs');
  for (const location of ['/login', '../assets/app.js', `${approved}/api/auth/me`]) {
    assert.equal(isAllowedLabRedirect(location, `${approved}/nested/path`, approved), true, location);
  }
  for (const location of ['//example.com/test', 'https://example.com',
    'http://127.0.0.1:9090/test', 'http://localhost:8080/test', 'javascript:alert(1)',
    'http://[bad-host', '']) {
    assert.equal(isAllowedLabRedirect(location, `${approved}/nested/path`, approved), false, location);
  }
});
