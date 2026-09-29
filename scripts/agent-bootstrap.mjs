import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gatesForFiles } from '../qa/support/domain-risk-catalog.mjs';
import { detectDuplicateExclusiveClaims, extractExclusiveIssueClaims, graphifyFreshness, unique } from './agent-context-v2-lib.mjs';
import { routeTask } from './agent-system-v3-lib.mjs';

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
};
const has = (flag) => args.includes(flag);

function git(root, command, fallback = '') {
  try {
    return execFileSync('git', command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

function repositorySlug(root) {
  const remote = git(root, ['remote', 'get-url', 'origin']);
  const match = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  return match ? `${match[1]}/${match[2]}` : '';
}

async function githubJson(repository, endpoint, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'contagest-agent-bootstrap-v3',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`, { headers });
  if (!response.ok) throw new Error(`GitHub ${endpoint} => HTTP ${response.status}`);
  return response.json();
}

async function githubAllPages(repository, endpoint, token, maxPages = 10) {
  const results = [];
  const separator = endpoint.includes('?') ? '&' : '?';
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubJson(repository, `${endpoint}${separator}per_page=100&page=${page}`, token);
    if (!Array.isArray(batch)) throw new Error(`GitHub ${endpoint} pagination expected an array`);
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

async function resolveLiveState({ repository, queue, token }) {
  const metadata = await githubJson(repository, '', token);
  const defaultBranch = metadata.default_branch || 'main';
  const branch = await githubJson(repository, `/branches/${encodeURIComponent(defaultBranch)}`, token);
  const pullRequests = await githubAllPages(repository, '/pulls?state=open', token);
  const normalizedPullRequests = pullRequests.map((pullRequest) => ({
    number: pullRequest.number,
    title: pullRequest.title,
    body: pullRequest.body ?? '',
    state: pullRequest.state,
    headSha: pullRequest.head?.sha ?? null,
    headRef: pullRequest.head?.ref ?? null,
  }));

  let selectedWorkItem = null;
  for (const issueNumber of queue) {
    const issue = await githubJson(repository, `/issues/${issueNumber}`, token);
    if (issue.pull_request) continue;
    if (issue.state === 'open' && issue.state_reason !== 'not_planned') {
      selectedWorkItem = { number: issue.number, title: issue.title, state: issue.state };
      break;
    }
  }

  return {
    status: 'LIVE',
    defaultBranch,
    mainSha: branch.commit.sha,
    pullRequests: normalizedPullRequests,
    selectedWorkItem,
  };
}

function changedFiles(root, explicit, base) {
  if (explicit) return explicit.split(',').map((value) => value.trim()).filter(Boolean);
  const diff = git(root, ['diff', '--name-only', `${base}...HEAD`]);
  return diff ? diff.split(/\r?\n/).filter(Boolean) : [];
}

function routedDomainHints(domains) {
  const map = {
    'accounting-financial':['finance'],
    'identity-tenant-rbac':['auth-security'],
    'database-migration':['database'],
    'frontend-shell-design':['frontend-ui'],
    'health-sensitive':['clinical'],
    'pwa-offline':['frontend-ui'],
    integrations:['backend'],
    'release-infrastructure':['release'],
    'agent-system':['architecture'],
    'hipico-automation':['hipico'],
    'data-lifecycle':['database'],
    'api-governance':['backend'],
    observability:['backend'],
    'supply-chain':['auth-security','release'],
    'vertical-runtime':['clinical','frontend-ui'],
    'privacy-sensitive':['auth-security'],
  };
  return unique(domains.flatMap((domain) => map[domain.id] || []));
}

function routedBoundaries(domains) {
  const map = {
    'accounting-financial':['financial','persistence'],
    'identity-tenant-rbac':['auth','tenant'],
    'database-migration':['persistence','tenant'],
    'frontend-shell-design':['ui','browser'],
    'health-sensitive':['api','tenant','ui'],
    'pwa-offline':['ui','browser'],
    integrations:['api','provider'],
    'release-infrastructure':['provider','deploy'],
    'agent-system':['api'],
    'hipico-automation':['api','provider'],
    'data-lifecycle':['persistence','tenant'],
    'api-governance':['api'],
    observability:['api'],
    'supply-chain':['security','provider'],
    'vertical-runtime':['api','ui','browser','tenant'],
    'privacy-sensitive':['security','tenant'],
  };
  return unique(domains.flatMap((domain) => map[domain.id] || []));
}

function printHuman(summary) {
  const lines = [
    summary.marker,
    `repo/root: ${summary.repository || 'UNRESOLVED'} ${summary.repoRoot}`,
    `current: ${summary.branch} ${summary.headSha}`,
    `main: ${summary.mainSha || 'UNRESOLVED'} drift=${summary.mainDrift}`,
    `live: ${summary.liveState.status}`,
    `work: ${summary.selectedWorkItem ? `#${summary.selectedWorkItem.number} ${summary.selectedWorkItem.title}` : summary.liveState.status}`,
    `claims: ${summary.workClaims.length ? summary.workClaims.map((claim) => `#${claim.pullRequest}`).join(', ') : 'none'}`,
    `Graphify: ${summary.graphify.status}`,
    `risk domains: ${summary.riskDomains.join(', ') || 'none'}`,
    `agents: ${summary.agentProfiles.join(', ') || 'none'}`,
    `skills: ${summary.skills.join(', ') || 'none'}`,
    `evidence plan: ${summary.evidencePlan.join(', ') || 'none'}`,
    `gates: ${summary.gates.join(', ') || 'none'}`,
    `next action: ${summary.nextAction}`,
  ];
  console.log(lines.join('\n'));
}

async function main() {
  if (has('--help')) {
    console.log('ContaGest Agent System v3 discovery-only bootstrap. It reads local/live state, routes minimal skills and plans exact-SHA evidence. It does not mutate GitHub, create branches, merge, close issues, deploy, migrate production or install tools.');
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, '..');
  const headSha = git(root, ['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/i.test(headSha)) throw new Error('unable to resolve exact HEAD SHA');
  const branch = git(root, ['branch', '--show-current'], 'DETACHED');
  const queueDocument = JSON.parse(fs.readFileSync(path.join(root, '.agents/context/WORK_QUEUE.json'), 'utf8'));
  const queue = Array.isArray(queueDocument.queue) ? queueDocument.queue.filter(Number.isInteger) : [];
  const repository = repositorySlug(root) || process.env.GITHUB_REPOSITORY || '';
  const offline = has('--offline');

  let liveState = { status: 'BLOCKED_LIVE_STATE', defaultBranch: 'main', mainSha: '', pullRequests: [], selectedWorkItem: null };
  if (!offline && repository) {
    try {
      liveState = await resolveLiveState({ repository, queue, token: process.env.GITHUB_TOKEN || '' });
    } catch (error) {
      liveState = { ...liveState, reason: error.message };
    }
  }

  const localMainSha = git(root, ['rev-parse', 'main']);
  const mainSha = liveState.mainSha || localMainSha || null;
  const base = liveState.defaultBranch || 'main';
  const files = changedFiles(root, valueOf('--files'), base);
  const domains = gatesForFiles(files);
  const graphify = graphifyFreshness({
    headSha,
    metadataPath: path.join(root, 'graphify-out', 'source-sha.json'),
  });
  const duplicateState = detectDuplicateExclusiveClaims(liveState.pullRequests);
  const selected = liveState.selectedWorkItem;
  const workClaims = selected
    ? liveState.pullRequests
        .filter((pullRequest) => extractExclusiveIssueClaims(pullRequest.body).includes(selected.number))
        .map((pullRequest) => ({ pullRequest: pullRequest.number, headRef: pullRequest.headRef, headSha: pullRequest.headSha }))
    : [];

  const inferredRisk=domains.some((domain)=>domain.severity==='critical')?'P0':domains.some((domain)=>domain.severity==='high')?'P1':'P2';
  const taskType=valueOf('--type')||'feature';
  const route=routeTask({risk:valueOf('--risk')||inferredRisk,type:taskType,domains:routedDomainHints(domains).length?routedDomainHints(domains):['architecture'],boundaries:routedBoundaries(domains)});

  let nextAction = 'Resolve live GitHub state before selecting or creating work.';
  if (!duplicateState.ok) nextAction = 'Reconcile DUPLICATE_WORK_CLAIM before creating or merging work.';
  else if (selected && workClaims.length) nextAction = `Continue existing claim for #${selected.number}; do not create duplicate work.`;
  else if (selected) nextAction = `Proceed with live issue #${selected.number} using v3 routed gates/evidence.`;

  const summary = {
    marker: 'CONTAGEST_AGENT_BOOTSTRAP_V3',
    schemaVersion: 3,
    repository: repository || null,
    repoRoot: root,
    branch,
    headSha,
    mainSha,
    mainDrift: mainSha ? mainSha !== headSha : null,
    liveState: { status: liveState.status, reason: liveState.reason ?? null },
    selectedWorkItem: selected,
    workClaims,
    duplicateWorkClaims: duplicateState,
    graphify: {...graphify,authority:'navigation-only'},
    files,
    task:{type:route.type,risk:route.risk,boundaries:route.boundaries},
    riskDomains: domains.map((domain) => domain.id),
    agentProfiles: route.agents.map((id) => `.agents/agents/${id}.md`),
    skills: route.skills.map((skill)=>`.agents/skills/${skill}/SKILL.md`),
    evidencePlan: route.verification,
    gates: unique(domains.flatMap((domain) => domain.gates || [])),
    nextAction,
  };

  if (has('--json')) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);
}

main().catch((error) => {
  console.error(`CONTAGEST_AGENT_BOOTSTRAP_BLOCKED ${error.message}`);
  process.exitCode = 2;
});
