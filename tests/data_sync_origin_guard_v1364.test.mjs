import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovedSyncBase } from '../frontend/src/services/apiBaseOriginPolicy.mjs';

const web = {currentOrigin:'https://contagest.example',configuredOrigins:['https://api.contagest.example/api/v1']};

test('legacy sync keeps same-origin relative and absolute backend URL contracts', () => {
  assert.equal(resolveApprovedSyncBase('/api/v1',web),'/api/v1');
  assert.equal(resolveApprovedSyncBase('https://contagest.example',web),'https://contagest.example');
  assert.equal(resolveApprovedSyncBase('https://contagest.example/api/v1',web),'https://contagest.example/api/v1');
});

test('approved remote HTTPS API accepts both canonical API prefix and legacy root', () => {
  assert.equal(resolveApprovedSyncBase('https://api.contagest.example',web),'https://api.contagest.example');
  assert.equal(resolveApprovedSyncBase('https://api.contagest.example/api/v1',web),'https://api.contagest.example/api/v1');
});

test('unapproved backend URL cannot be used to export sensitive records', () => {
  for (const value of [
    'https://malicious.example', 'https://malicious.example/api/v1',
    'https://contagest.example.evil.test/api/v1',
    'http://contagest.example/api/v1', 'http://malicious.example',
    'https://user:password@contagest.example',
    'https://contagest.example/api/v1?token=secret',
    'https://contagest.example/api/other',
    '//malicious.example', 'javascript:alert(1)', ''
  ]) assert.equal(resolveApprovedSyncBase(value,web),'',value);
});

test('HTTP production document and native release fail closed', () => {
  assert.equal(resolveApprovedSyncBase('/api/v1',{currentOrigin:'http://contagest.example'}),'');
  assert.equal(resolveApprovedSyncBase('/api/v1',{currentOrigin:'https://localhost',native:true}),'');
  assert.equal(resolveApprovedSyncBase('https://evil.test',{currentOrigin:'https://localhost',native:true}),'');
});

test('localhost development configuration remains available for an isolated backend', () => {
  assert.equal(resolveApprovedSyncBase('http://localhost:3030',{
    currentOrigin:'http://localhost:8080',development:true
  }), 'http://localhost:3030');
});
