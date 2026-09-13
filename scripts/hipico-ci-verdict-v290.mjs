import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/i;
const JOB_ENV = Object.freeze({
  'static-release': 'HIPICO_GATE_STATIC',
  'postgres-e2e': 'HIPICO_GATE_POSTGRES',
  'browser-chromium': 'HIPICO_GATE_CHROMIUM',
  'security-regression': 'HIPICO_GATE_SECURITY',
  'android-debug': 'HIPICO_GATE_ANDROID',
  'browser-matrix': 'HIPICO_GATE_MATRIX'
});

export function classifyJob(job = {}) {
  const conclusion = String(job?.conclusion || '').trim().toLowerCase();
  const runnerId = Number(job?.runner_id || 0);
  const steps = Array.isArray(job?.steps) ? job.steps : [];
  const executed = runnerId > 0 || steps.length > 0;
  if (conclusion === 'success') return executed ? 'PASS' : 'FAIL';
  if (conclusion === 'failure') return executed ? 'FAIL' : 'BLOCKED';
  if (['skipped', 'cancelled', 'canceled'].includes(conclusion)) return 'NOT_EXECUTED';
  if (['timed_out', 'action_required', 'startup_failure'].includes(conclusion)) return executed ? 'FAIL' : 'BLOCKED';
  return 'NOT_EXECUTED';
}

export function summarizeBlocker(statuses = []) {
  return statuses.includes('BLOCKED') ? 'BLOCKED_INFRASTRUCTURE' : '';
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    redirect: 'error'
  });
  if (!response.ok) throw new Error(`HIPICO_CI_VERDICT_GITHUB_HTTP_${response.status}`);
  return response.json();
}

async function main() {
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  const repository = String(process.env.GITHUB_REPOSITORY || '').trim();
  const runId = String(process.env.GITHUB_RUN_ID || '').trim();
  const sha = String(process.env.HIPICO_CANDIDATE_SHA || process.env.GITHUB_SHA || '').trim().toLowerCase();
  if (!token) throw new Error('HIPICO_CI_VERDICT_TOKEN_REQUIRED');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('HIPICO_CI_VERDICT_REPOSITORY_INVALID');
  if (!/^\d+$/.test(runId)) throw new Error('HIPICO_CI_VERDICT_RUN_ID_INVALID');
  if (!SHA40.test(sha)) throw new Error('HIPICO_CI_VERDICT_SHA_REQUIRED');

  const api = `https://api.github.com/repos/${repository}`;
  const run = await githubJson(`${api}/actions/runs/${runId}`, token);
  if (String(run?.head_sha || '').trim().toLowerCase() !== sha) {
    throw new Error(`HIPICO_CI_VERDICT_SHA_MISMATCH:${String(run?.head_sha || '')}:${sha}`);
  }

  const response = await githubJson(`${api}/actions/runs/${runId}/jobs?per_page=100`, token);
  const jobs = Array.isArray(response?.jobs) ? response.jobs : [];
  const output = {};
  for (const [jobName, envName] of Object.entries(JOB_ENV)) {
    const matching = jobs.filter((job) => String(job?.name || '') === jobName);
    if (!matching.length) {
      output[envName] = 'NOT_EXECUTED';
      continue;
    }
    const statuses = matching.map(classifyJob);
    output[envName] = statuses.includes('FAIL')
      ? 'FAIL'
      : statuses.includes('BLOCKED')
        ? 'BLOCKED'
        : statuses.every((status) => status === 'PASS')
          ? 'PASS'
          : 'NOT_EXECUTED';
  }
  output.HIPICO_GATE_RESTART = output.HIPICO_GATE_POSTGRES;
  const physical = String(process.env.HIPICO_PHYSICAL_QA_STATUS || 'NOT_EXECUTED').trim().toUpperCase();
  output.HIPICO_GATE_PHYSICAL_QA = ['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED'].includes(physical)
    ? physical
    : 'NOT_EXECUTED';
  output.HIPICO_BLOCKER_REASON = summarizeBlocker(Object.values(output));

  const envFile = String(process.env.GITHUB_ENV || '').trim();
  if (envFile) {
    fs.appendFileSync(envFile, `${Object.entries(output).map(([key, value]) => `${key}=${value}`).join('\n')}\n`, 'utf8');
  }
  console.log(JSON.stringify({ schema: 'hipico-ci-verdict.v290-current', sha, runId, statuses: output }, null, 2));
}

const executedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) await main();
