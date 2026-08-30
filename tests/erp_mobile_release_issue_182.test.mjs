import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { evaluateServedMobileRelease } from '../qa/support/erp-mobile-release-v182.mjs';

const SHA='b'.repeat(40);
const routes=Array.from({length:58},(_,index)=>({route:`route-${index}`,status:'PASS',widths:[360,390,430],evidence:['shot.png']}));
const green={candidateSha:SHA,buildInfo:{product:'contagest-erp',candidateSha:SHA,bound:true},serviceWorker:{status:'PASS'},installUpgrade:{status:'PASS'},routes};

test('green served artifact can pass release evaluator',()=>assert.equal(evaluateServedMobileRelease(green).verdict,'PASS'));
test('served SHA mismatch fails',()=>{const result=evaluateServedMobileRelease({...green,buildInfo:{...green.buildInfo,candidateSha:'a'.repeat(40)}});assert.equal(result.verdict,'FAIL');assert.ok(result.reasons.includes('SERVED_SHA_MISMATCH'));});
test('local-unbound identity fails',()=>{const result=evaluateServedMobileRelease({...green,buildInfo:{...green.buildInfo,candidateSha:'local-unbound',bound:false}});assert.equal(result.verdict,'FAIL');assert.ok(result.reasons.includes('BUILD_IDENTITY_UNBOUND'));});
test('missing PWA/device evidence stays NOT_EXECUTED',()=>{const result=evaluateServedMobileRelease({...green,serviceWorker:{status:'NOT_EXECUTED'},installUpgrade:{status:'NOT_EXECUTED'}});assert.equal(result.verdict,'NOT_EXECUTED');});
test('blocked route evidence stays BLOCKED',()=>{const modified=routes.map((row,index)=>index?row:{...row,status:'BLOCKED'});assert.equal(evaluateServedMobileRelease({...green,routes:modified}).verdict,'BLOCKED');});
test('service worker never caches build-info identity',()=>{const sw=fs.readFileSync('frontend/public/sw.js','utf8');assert.match(sw,/url\.pathname === '\/build-info\.json'/);assert.match(sw,/cache:'no-store'/);assert.doesNotMatch(sw,/APP_SHELL[^;]*build-info\.json/);});
test('frontend build writes build identity before vite',()=>{const pkg=JSON.parse(fs.readFileSync('frontend/package.json','utf8'));assert.match(pkg.scripts.build,/build:identity/);assert.match(pkg.scripts['build:identity'],/write-build-info/);});
