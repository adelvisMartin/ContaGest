#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY || 'adelvisMartin/ContaGest';
const issueNumber = 155;
const workflowFile = 'erp-system-qa-campaign-v155.yml';
const timeoutMs = Number(process.env.ERP155_TIMEOUT_MS || 5 * 60 * 60 * 1000);
const pollMs = Number(process.env.ERP155_POLL_MS || 15_000);
const closeIssue = process.argv.includes('--close-issue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sanitize = (value) => String(value || '')
  .replace(/gh[pousr]_[A-Za-z0-9_]+/g, '[REDACTED_TOKEN]')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]');

function gh(args, { json = false } = {}) {
  try {
    const raw = execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: process.env,
    }).trim();
    return json ? JSON.parse(raw || '{}') : raw;
  } catch (error) {
    throw new Error(sanitize(error?.stderr || error?.message || 'GH_COMMAND_FAILED').slice(0, 2000));
  }
}

const api = (endpoint) => gh(['api', endpoint], { json: true });

function issueState() {
  return String(api(`repos/${repo}/issues/${issueNumber}`)?.state || 'unknown').toLowerCase();
}

function mainSha() {
  const sha = String(api(`repos/${repo}/commits/main`)?.sha || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('MAIN_SHA_UNAVAILABLE');
  return sha;
}

function listRuns() {
  const payload = api(`repos/${repo}/actions/workflows/${workflowFile}/runs?event=workflow_dispatch&branch=main&per_page=30`);
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

async function waitForNewRun(beforeIds, candidateSha) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const match = listRuns().find((run) => !beforeIds.has(Number(run.id)) && String(run.head_sha || '') === candidateSha);
    if (match) return match;
    await sleep(pollMs);
  }
  throw new Error(`ERP155_RUN_NOT_FOUND:${candidateSha}`);
}

async function waitForCompletion(runId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = api(`repos/${repo}/actions/runs/${runId}`);
    if (run?.status === 'completed') return run;
    await sleep(pollMs);
  }
  throw new Error(`ERP155_TIMEOUT:${runId}`);
}

function persist(report) {
  const key = /^[0-9a-f]{40}$/i.test(String(report.candidateSha || '')) ? report.candidateSha : 'unbound';
  const dir = path.resolve('artifacts', 'qa', 'erp155-auto-finalize', key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const candidateSha = mainSha();
  const stateBefore = issueState();
  const report = {
    schemaVersion: 1,
    issue: issueNumber,
    candidateSha,
    generatedAt: new Date().toISOString(),
    stateBefore,
    workflow: workflowFile,
    runId: null,
    runUrl: null,
    conclusion: null,
    verdict: 'NOT_EXECUTED',
    issueClosed: false,
  };

  if (stateBefore === 'closed') {
    report.verdict = 'ALREADY_CLOSED';
    persist(report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const beforeIds = new Set(listRuns().map((run) => Number(run.id)));
  gh(['workflow', 'run', workflowFile, '--repo', repo, '--ref', 'main']);
  const created = await waitForNewRun(beforeIds, candidateSha);
  const completed = await waitForCompletion(Number(created.id));

  report.runId = Number(completed.id);
  report.runUrl = completed.html_url || null;
  report.conclusion = completed.conclusion || null;
  report.verdict = completed.status === 'completed' && completed.conclusion === 'success' && completed.head_sha === candidateSha
    ? 'PASS'
    : 'FAIL';

  if (report.verdict === 'PASS' && closeIssue) {
    gh([
      'issue', 'close', String(issueNumber), '--repo', repo, '--reason', 'completed', '--comment',
      `Campaña ERP #155 verificada sobre main@${candidateSha}. El workflow completo de 58 rutas × roles × estados × viewports terminó en success: ${report.runUrl}. El ticket se cierra con evidencia ejecutada por SHA.`,
    ]);
    report.issueClosed = true;
  }

  persist(report);
  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== 'PASS') process.exitCode = 2;
}

main().catch((error) => {
  const report = {
    schemaVersion: 1,
    issue: issueNumber,
    candidateSha: null,
    generatedAt: new Date().toISOString(),
    verdict: 'BLOCKED',
    error: sanitize(error?.message || error),
    issueClosed: false,
  };
  persist(report);
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 2;
});
