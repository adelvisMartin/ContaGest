import test from 'node:test';
import assert from 'node:assert/strict';
import { TRACKED_META_624_ISSUES, auditMeta624, scanLiveMeta624 } from './meta-backlog-gate-v624.mjs';

const SHA = 'a'.repeat(40);
const rows = () => TRACKED_META_624_ISSUES.map(number => ({ number, state: 'closed' }));
const snapshot = issues => ({ mainSha: SHA, observedAt: '2026-10-21T20:00:00.000Z', issues });

test('#624: OPEN financial/release child blocks global META completion', () => {
  const list = rows().map(row => row.number === 637 ? { ...row, state: 'open' } : row);
  const report = auditMeta624(snapshot(list));
  assert.equal(report.status, 'OPEN_CHILDREN');
  assert.deepEqual(report.openIssues, [637]);
  assert.equal(report.metaReadyForClosure, false);
});

test('#624: even every CLOSED child requires material DoD review, not automatic PASS', () => {
  const report = auditMeta624(snapshot(rows()));
  assert.equal(report.status, 'REVIEW_REQUIRED');
  assert.equal(report.metaReadyForClosure, false);
  assert.equal(report.counts.closed, TRACKED_META_624_ISSUES.length);
});

test('#624: missing, duplicate, unknown issue and malformed state fail closed', () => {
  const list = rows();
  assert.equal(auditMeta624(snapshot(list.slice(1))).status, 'INVALID_SNAPSHOT');
  assert.equal(auditMeta624(snapshot([...list, list[0]])).status, 'INVALID_SNAPSHOT');
  assert.equal(auditMeta624(snapshot([...list, {number: 999999, state:'closed'}])).status, 'INVALID_SNAPSHOT');
  assert.equal(auditMeta624(snapshot([{...list[0], state:'done'}, ...list.slice(1)])).status, 'INVALID_SNAPSHOT');
  assert.equal(auditMeta624({...snapshot(list), mainSha: 'UNBOUND'}).status, 'INVALID_SNAPSHOT');
});

test('#624: live scanner uses real GH states and binds both main reads to same SHA', async () => {
  const fetcher = async url => {
    if (url.endsWith('/git/ref/heads/main')) return {ok:true,json:async()=>({object:{sha:SHA}})};
    const id = Number(url.split('/').at(-1));
    return {ok:true,json:async()=>({number:id,state:id===638?'open':'closed'})};
  };
  const report = await scanLiveMeta624({fetcher, token:''});
  assert.equal(report.mainSha, SHA);
  assert.deepEqual(report.openIssues, [638]);
});

test('#624: errors and fake pull requests are never treated as CLOSED issues', async () => {
  const fetcher = async url => {
    if (url.endsWith('/git/ref/heads/main')) return {ok:true,json:async()=>({object:{sha:SHA}})};
    const id = Number(url.split('/').at(-1));
    if (id===625) return {ok:false,status:403};
    return {ok:true,json:async()=>({number:id,state:'closed'})};
  };
  await assert.rejects(scanLiveMeta624({fetcher,token:''}),/META624_GITHUB_READ_FAILED:403/);
  const fakePull = async url => url.endsWith('/git/ref/heads/main')
    ? {ok:true,json:async()=>({object:{sha:SHA}})}
    : {ok:true,json:async()=>({number:Number(url.split('/').at(-1)),state:'closed',pull_request:{}})};
  await assert.rejects(scanLiveMeta624({fetcher:fakePull,token:''}),/META624_GITHUB_ISSUE_INVALID/);
});

test('#624: concurrent main movement invalidates the live census', async () => {
  let refs = 0;
  const fetcher = async url => {
    if(url.endsWith('/git/ref/heads/main')) {
      refs++;
      return {ok:true,json:async()=>({object:{sha:refs===1?SHA:'b'.repeat(40)}})};
    }
    return {ok:true,json:async()=>({number:Number(url.split('/').at(-1)),state:'closed'})};
  };
  await assert.rejects(scanLiveMeta624({fetcher,token:''}),/META624_MAIN_MOVED_DURING_SCAN/);
});
