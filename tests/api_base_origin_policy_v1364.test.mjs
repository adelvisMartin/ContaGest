import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovedApiBase } from '../frontend/src/services/apiBaseOriginPolicy.mjs';

const prod = {
  currentOrigin: 'https://contagest.example',
  configuredOrigins: ['https://api.contagest.example/api/v1'],
  fallback: 'https://api.contagest.example/api/v1'
};

const accepts = [
  ['approved production API', 'https://api.contagest.example/api/v1', 'https://api.contagest.example/api/v1'],
  ['approved trailing slash', 'https://api.contagest.example/api/v1/', 'https://api.contagest.example/api/v1'],
  ['same-origin', 'https://contagest.example/api/v1', 'https://contagest.example/api/v1'],
  ['relative same-origin', '/api/v1', '/api/v1']
];
for (const [label, input, expected] of accepts) {
  test('approved origins: ' + label, () => assert.equal(resolveApprovedApiBase(input, prod), expected));
}

const rejects = [
  'http://api.contagest.example/api/v1',
  'http://localhost:3030/api/v1',
  'https://api.contagest.example.evil.test/api/v1',
  'https://evil.test/api/v1',
  'https://user:secret@api.contagest.example/api/v1',
  'https://api.contagest.example/api/v1?token=secret',
  'https://api.contagest.example/api/v1#fragment',
  'https://api.contagest.example/api/v1/../admin',
  'javascript:alert(1)',
  '//evil.test/api/v1',
  'https://api.contagest.example/not-api',
  'https://api.contagest.example/api/v1//evil'
];
for (const input of rejects) {
  test('untrusted base never receives traffic: ' + input, () => {
    assert.equal(resolveApprovedApiBase(input, prod), prod.fallback);
  });
}

test('empty config remains same-origin in browser', () => {
  assert.equal(resolveApprovedApiBase('https://evil.test/api/v1', { currentOrigin: 'https://contagest.example' }), '/api/v1');
});
test('release native mode does not use a relative localhost fallback', () => {
  assert.equal(resolveApprovedApiBase('/api/v1', { ...prod, native: true }), prod.fallback);
  assert.equal(resolveApprovedApiBase('https://evil.test/api/v1', { native: true }), '');
});
test('dev mode permits local backend, production rejects it', () => {
  assert.equal(resolveApprovedApiBase('http://localhost:3030/api/v1', {
    fallback: '/api/v1', currentOrigin: 'http://localhost:8080', development: true
  }), 'http://localhost:3030/api/v1');
  assert.equal(resolveApprovedApiBase('http://127.0.0.1:3030/api/v1', {
    fallback: '/api/v1', currentOrigin: 'http://localhost:8080', development: true
  }), 'http://127.0.0.1:3030/api/v1');
});
test('untrusted entry cannot self-authorize using an http configured origin', () => {
  assert.equal(resolveApprovedApiBase('http://evil.test/api/v1', {
    currentOrigin:'https://contagest.example', configuredOrigins:['http://evil.test'], fallback:'/api/v1'
  }), '/api/v1');
});

test('1000 deterministic hostile API base combinations stay outside the trust boundary', () => {
  const hosts = [
    'evil.test', 'api.contagest.example.evil.test', 'contagest.example.evil.test',
    'localhost', '127.0.0.1', 'api.contagest.example.test', 'another-tenant.test',
    '10.0.0.10', 'xn--paypa-4ve.test', 'api.contagest.example.attacker.test'
  ];
  const schemes = ['http:', 'https:', 'ftp:', 'ws:', 'file:'];
  const paths = ['/api/v1', '/api/v1/../admin', '/api/v1?key=1', '/api/v1#frag', '/not-api'];
  const suffixes = ['', '?token=x', '#redirect', '/../../api/v1'];
  let checked = 0;
  for (const host of hosts) for (const scheme of schemes) for (const path of paths) for (const suffix of suffixes) {
    const input = scheme + '//' + host + path + suffix;
    assert.equal(resolveApprovedApiBase(input, prod), prod.fallback, input);
    checked += 1;
  }
  assert.equal(checked, 1000);
});

test('production HTTP shell cannot send credentialed API requests even to approved HTTPS backend', () => {
  const options = {
    currentOrigin:'http://contagest.example',
    configuredOrigins:['https://api.contagest.example'],
    fallback:'/api/v1',
    development:false,
    native:false
  };
  assert.equal(resolveApprovedApiBase('/api/v1', options), '');
  assert.equal(resolveApprovedApiBase('https://api.contagest.example/api/v1', options), '');
});

test('production HTTPS shell and explicit local development remain operational', () => {
  assert.equal(resolveApprovedApiBase('/api/v1', {
    currentOrigin:'https://contagest.example',fallback:'/api/v1'
  }), '/api/v1');
  assert.equal(resolveApprovedApiBase('http://localhost:3030/api/v1', {
    currentOrigin:'http://localhost:8080',
    fallback:'http://localhost:3030/api/v1',
    development:true
  }), 'http://localhost:3030/api/v1');
});
