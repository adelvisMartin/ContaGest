#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY || 'adelvisMartin/ContaGest';
const issueNumber = 134;
const closeIssue = process.argv.includes('--close-issue');
const timeoutMs = Number(process.env.ACTIONS_RECOVERY_TIMEOUT_MS || 30 * 60 * 1000);
const pollMs = Number(process.env.ACTIONS_RECOVERY_POLL_MS || 10_000);
const workflows = [
  { file: 'ci.yml', label: 'ContaGest CI' },
  { file: 'postgres-tenant-rules-v28.yml', label: 'PostgreSQL #28' },
];

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
    const detail = sanitize(error?.stderr || error?.message || 'GH_COMMAND_FAILED').slice(0, 2000);
    throw new Error(`GH_COMMAND_FAILED: ${detail}`);
  }
}

function api(endpoint) {
  return gh(['api', endpoint], { json: true });
}

function issueState() {
  const issue = api(`repos/${repo}/issues/${issueNumber}`);
  return String(issue?.state || 'unknown').toLowerCase();
}

function mainSha() {
  const commit = api(`repos/${repo}/commits/main`);
  const sha = String(commit?.sha || '').trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error('MAIN_SHA_UNAVAILABLE');
  return sha;
}

function listRuns(workflowFile) {
  const payload = api(`repos/${repo}/actions/workflows/${workflowFile}/runs?event=workflow_dispatch&branch=main&per_page=30`);
  return Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
}

function dispatch(workflowFile) {
  gh(['workflow', 'run', workflowFile, '--repo', repo, '--ref', 'main']);
}

async function waitForNewRun(workflowFile, beforeIds, targetSha) {
  const deadline = Date.now() + Math.min(timeoutMs, 5 * 60 * 1000);
  while (Date.now() < deadline) {
    const match = listRuns(workflowFile).find((run) =>
      !beforeIds.has(Number(run.id)) && String(run.head_sha || '') === targetSha
    );
    if (match) return match;
    await sleep(pollMs);
  }
  throw new Error(`DISPATCHED_RUN_NOT_FOUND:${workflowFile}:${targetSha}`);
}

async function waitForCompletion(runId) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = api(`repos/${repo}/actions/runs/${runId}`);
    if (run?.status === 'completed') return run;
    await sleep(pollMs);
  }
  throw new Error(`WORKFLOW_TIMEOUT:${runId}`);
}

function writeReport(report) {
  const shaKey = /^[0-9a-f]{40}$/i.test(String(report.candidateSha || '')) ? report.candidateSha : 'unbound';
  const outDir = path.resolve('artifacts', 'qa', 'actions-recovery-v134', shaKey);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'recovery.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outDir;
}

async function main() {
  const candidateSha = mainSha();
  const stateBefore = issueState();
  const report = {
    schemaVersion: 1,
    issue: issueNumber,
    repository: repo,
    candidateSha,
    generatedAt: new Date().toISOString(),
    recoveryRunner: {
      name: process.env.RUNNER_NAME || null,
      os: process.env.RUNNER_OS || null,
      arch: process.env.RUNNER_ARCH || null,
      executed: Boolean(process.env.GITHUB_ACTIONS),
    },
    stateBefore,
    workflows: [],
    verdict: 'NOT_EXECUTED',
    issueClosed: false,
  };

  if (stateBefore === 'closed') {
    report.verdict = 'ALREADY_CLOSED';
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const snapshots = new Map();
  for (const workflow of workflows) {
    snapshots.set(workflow.file, new Set(listRuns(workflow.file).map((run) => Number(run.id))));
  }

  for (const workflow of workflows) dispatch(workflow.file);

  const discovered = [];
  for (const workflow of workflows) {
    const run = await waitForNewRun(workflow.file, snapshots.get(workflow.file), candidateSha);
    discovered.push({ ...workflow, id: Number(run.id), htmlUrl: run.html_url || null });
  }

  for (const workflow of discovered) {
    const completed = await waitForCompletion(workflow.id);
    report.workflows.push({
      file: workflow.file,
      label: workflow.label,
      runId: workflow.id,
      url: completed.html_url || workflow.htmlUrl,
      headSha: completed.head_sha || null,
      status: completed.status || null,
      conclusion: completed.conclusion || null,
      attempt: completed.run_attempt || null,
    });
  }

  const allPass = report.workflows.length === workflows.length && report.workflows.every((entry) =>
    entry.status === 'completed' && entry.conclusion === 'success' && entry.headSha === candidateSha
  );

  report.verdict = allPass ? 'PASS' : 'FAIL';

  if (allPass && closeIssue) {
    const evidence = report.workflows.map((entry) => `- ${entry.label}: ${entry.url}`).join('\n');
    gh([
      'issue', 'close', String(issueNumber), '--repo', repo, '--reason', 'completed', '--comment',
      `Recuperación verificada sobre main@${candidateSha}. Un GitHub-hosted runner ejecutó este orquestador y los workflows requeridos terminaron realmente en success:\n${evidence}\n\n#134 se cierra por evidencia ejecutada, no por omitir checks.`,
    ]);
    report.issueClosed = true;
  }

  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  if (!allPass) process.exitCode = 2;
}

main().catch((error) => {
  const fallback = {
    schemaVersion: 1,
    issue: issueNumber,
    repository: repo,
    candidateSha: null,
    generatedAt: new Date().toISOString(),
    verdict: 'BLOCKED',
    error: sanitize(error?.message || error),
    issueClosed: false,
  };
  writeReport(fallback);
  console.error(JSON.stringify(fallback, null, 2));
  process.exitCode = 2;
});
