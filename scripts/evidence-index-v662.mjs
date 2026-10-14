#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;
const STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED', 'NOT_APPLICABLE'];
export const DIMENSIONS = Object.freeze(['SOURCE_REVIEW','LOCAL_STATIC','LOCAL_UNIT','LOCAL_INTEGRATION','LOCAL_POSTGRES','LOCAL_BUILD','LOCAL_BROWSER_E2E','REMOTE_CI','REMOTE_DEPLOY','PHYSICAL_EXTERNAL']);
const uniqSort = (input) => {
  if (!Array.isArray(input) || input.some((n) => !Number.isInteger(n) || n < 1)) throw new Error('INDEX_INVALID_IDS');
  const values = [...new Set(input)].sort((a,b)=>a-b);
  if (values.length !== input.length) throw new Error('INDEX_DUPLICATE_IDS');
  return values;
};
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['generatedAt','manifestSha256'].includes(key))
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([key,item]) => [key,normalize(item)]));
  return value;
};
export const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');

export function generateIndex(inventory, sha) {
  if (!SHA.test(sha)) throw new Error('INDEX_SHA_INVALID');
  if (inventory?.schemaVersion !== 662 || inventory.rootIssue !== 624 ||
      !SHA.test(inventory.observedBaselineSha || '') || !inventory.observedAt ||
      !/^https:\/\/github\.com\//.test(inventory.sourceUrl || '')) throw new Error('INDEX_INVENTORY_INVALID');
  const expectedIssueIds = uniqSort(inventory.issueIds);
  const openIds = uniqSort(inventory.openIssueIds);
  if (openIds.some((n) => !expectedIssueIds.includes(n))) throw new Error('INDEX_OPEN_NOT_TRACKED');
  const entry = (issue) => ({
    issue, issueState: openIds.includes(issue) ? 'OPEN' : 'UNKNOWN',
    status:'NOT_EXECUTED', reason:'No exact-SHA acceptance and execution evidence has been attached.',
    branch:null, pr:null, mergeSha:null, acceptanceComplete:false, evidence:[]
  });
  const result = {
    schemaVersion:662,rootIssue:624,candidateSha:sha,sourceUrl:inventory.sourceUrl,
    observedBaselineSha:inventory.observedBaselineSha,observedAt:inventory.observedAt,
    expectedIssueIds, unresolvedParentReferences:uniqSort(inventory.unresolvedParentReferences || []),
    generatedAt:new Date().toISOString(),entries:expectedIssueIds.map(entry)
  };
  result.manifestSha256=digest(result);
  return result;
}
const safeArtifact = (value) => typeof value === 'string' &&
  /^[a-zA-Z0-9._/-]+$/.test(value) && !value.startsWith('/') &&
  !value.split('/').includes('..') && value.length <= 512;

export function validateIndex(index, {sha,inventory}={}) {
  const errors=[];
  const add = (code) => errors.push(code);
  if (index?.schemaVersion !== 662 || index.rootIssue !== 624) add('INDEX_SCHEMA_INVALID');
  if (!SHA.test(index?.candidateSha || '') || (sha && sha !== index.candidateSha)) add('EVIDENCE_SHA_MISMATCH');
  if (index?.manifestSha256 !== digest(index)) add('INDEX_HASH_INVALID');
  let expected=[];
  try {
    expected=uniqSort(index.expectedIssueIds);
    if (JSON.stringify(expected) !== JSON.stringify(index.expectedIssueIds)) add('INDEX_IDS_NOT_SORTED');
    if (inventory && (inventory.rootIssue !== 624 || inventory.schemaVersion !== 662 ||
      JSON.stringify(expected) !== JSON.stringify(uniqSort(inventory.issueIds)) ||
      inventory.observedBaselineSha !== index.observedBaselineSha)) add('INDEX_INVENTORY_DRIFT');
  } catch (error) {add(error.message);}
  if (!Array.isArray(index?.entries)) add('INDEX_ENTRIES_MISSING');
  const entries=Array.isArray(index?.entries)?index.entries:[];
  const seen=new Set();
  for (const entry of entries) {
    if (!Number.isInteger(entry?.issue) || !expected.includes(entry.issue)) {add('INDEX_UNKNOWN_ISSUE');continue;}
    if (seen.has(entry.issue)) add('INDEX_DUPLICATE_ENTRY:'+entry.issue);
    seen.add(entry.issue);
    if (!['OPEN','CLOSED','UNKNOWN'].includes(entry.issueState)) add('INDEX_BAD_ISSUE_STATE:'+entry.issue);
    if (!STATUSES.includes(entry.status)) add('INDEX_BAD_STATUS:'+entry.issue);
    if (!Array.isArray(entry.evidence)) {add('INDEX_EVIDENCE_NOT_ARRAY:'+entry.issue);continue;}
    if (!['PASS','NOT_APPLICABLE'].includes(entry.status) && String(entry.reason||'').length < 12) add('INDEX_REASON_MISSING:'+entry.issue);
    if (entry.pr !== null && (!Number.isInteger(entry.pr) || entry.pr < 1)) add('INDEX_BAD_PR:'+entry.issue);
    if (entry.mergeSha !== null && !SHA.test(entry.mergeSha || '')) add('INDEX_BAD_MERGE_SHA:'+entry.issue);
    for (const proof of entry.evidence) {
      if (!DIMENSIONS.includes(proof?.dimension) || !STATUSES.includes(proof?.status)) {
        add('INDEX_BAD_EVIDENCE:'+entry.issue);continue;
      }
      if (proof.sha && proof.sha !== index.candidateSha) add('EVIDENCE_SHA_MISMATCH:'+entry.issue);
      if (proof.status === 'PASS' && (proof.sha !== index.candidateSha ||
          !String(proof.command||'').trim() || !String(proof.environment||'').trim() ||
          !Array.isArray(proof.artifacts) || !proof.artifacts.length ||
          !proof.artifacts.every(safeArtifact))) add('INDEX_PASS_NO_PROOF:'+entry.issue);
      if (proof.status === 'BLOCKED' && (!String(proof.blockerKind||'').trim() ||
          !String(proof.reason||'').trim())) add('INDEX_BLOCKER_CAUSE_MISSING:'+entry.issue);
    }
    if (entry.status === 'PASS' && (entry.issueState !== 'CLOSED' ||
        entry.acceptanceComplete !== true || !Number.isInteger(entry.pr) ||
        !SHA.test(entry.mergeSha||'') || !entry.evidence.some((p)=>p.status==='PASS'))) {
      add('INDEX_CLOSE_NO_EVIDENCE:'+entry.issue);
    }
  }
  for (const number of expected) if (!seen.has(number)) add('INDEX_MISSING_ENTRY:'+number);
  if (!Array.isArray(index?.unresolvedParentReferences)) add('INDEX_PARENT_COVERAGE_MISSING');
  else try {uniqSort(index.unresolvedParentReferences);} catch (error) {add(error.message);}
  const incomplete=entries.filter((e)=>e.status!=='PASS').map((e)=>e.issue);
  return {
    schemaVersion:662,candidateSha:index?.candidateSha||null,
    validation:errors.length?'FAIL':'PASS',
    releaseCoverage:errors.length||incomplete.length||(index.unresolvedParentReferences||[]).length?'NO_GO':'INDEX_ONLY_REQUIRES_RC_GATES',
    counts:Object.fromEntries(STATUSES.map((s)=>[s,entries.filter((e)=>e.status===s).length])),
    incompleteIssues:incomplete,unresolvedParentReferences:index.unresolvedParentReferences||[],errors
  };
}
export function toRelease647(index,options) {
  const report=validateIndex(index,options);
  return {schemaVersion:647,candidateSha:report.candidateSha,
    sourceManifestSha256:index.manifestSha256,
    evidenceIndexValidation:report.validation,
    evidenceCoverage:report.releaseCoverage,
    decision:'NO_GO',
    note:'#647 must independently execute all release gates. An index never means RELEASE_READY.',
    blockers:[...report.errors,...report.incompleteIssues.map((n)=>'ISSUE_MISSING:'+n),
      ...report.unresolvedParentReferences.map((n)=>'PARENT_REF_UNREVIEWED:'+n)]};
}
function cli() {
  const [operation,inputPath,expectedSha,other]=process.argv.slice(2);
  if (!['generate','validate','rc-input'].includes(operation)) throw new Error('Usage: <generate|validate|rc-input> <file> <SHA> [output-or-inventory]');
  if (!SHA.test(expectedSha||'')) throw new Error('INDEX_SHA_INVALID');
  const actual=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if (actual!==expectedSha) throw new Error('EVIDENCE_SHA_MISMATCH_CURRENT_HEAD');
  const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  if (operation==='generate') {
    if (!other) throw new Error('INDEX_OUTPUT_REQUIRED');
    const result=generateIndex(input,expectedSha);
    const report=validateIndex(result,{sha:expectedSha,inventory:input});
    if (report.errors.length) throw new Error(report.errors.join(','));
    fs.mkdirSync(path.dirname(other),{recursive:true});
    fs.writeFileSync(other,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({output:other,validation:report.validation,releaseCoverage:report.releaseCoverage}));
    return;
  }
  const inventory=other?JSON.parse(fs.readFileSync(other,'utf8')):undefined;
  const result=operation==='validate'?validateIndex(input,{sha:expectedSha,inventory}):
    toRelease647(input,{sha:expectedSha,inventory});
  console.log(JSON.stringify(result,null,2));
  if ((operation==='validate' && result.validation==='FAIL') ||
      (operation==='rc-input' && result.evidenceIndexValidation==='FAIL')) process.exitCode=1;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  try {cli();} catch(error){console.error('[evidence-index-v662]',error.message);process.exitCode=1;}
