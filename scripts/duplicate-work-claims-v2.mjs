import fs from 'node:fs';
import { detectDuplicateExclusiveClaims } from './agent-context-v2-lib.mjs';

const args = process.argv.slice(2);
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : '';
};

function parseRepositorySlug(value) {
  const slug = String(value ?? '').trim();
  if (!/^[^/]+\/[^/]+$/.test(slug)) throw new Error('repository must be owner/name');
  return slug;
}

async function fetchOpenPullRequests({ repository, token }) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'contagest-agent-system-v2',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/repos/${repository}/pulls?state=open&per_page=100&page=${page}`;
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`GitHub pull-request lookup failed: HTTP ${response.status}`);
    const batch = await response.json();
    results.push(...batch.map((pullRequest) => ({
      number: pullRequest.number,
      body: pullRequest.body ?? '',
      state: pullRequest.state,
    })));
    if (batch.length < 100) break;
  }
  return results;
}

async function main() {
  if (args.includes('--help')) {
    console.log('Checks open pull requests for duplicate exclusive issue-closing claims. Fails closed on DUPLICATE_WORK_CLAIM.');
    return;
  }

  const fixture = valueOf('--fixture');
  const pullRequests = fixture
    ? JSON.parse(fs.readFileSync(fixture, 'utf8'))
    : await fetchOpenPullRequests({
        repository: parseRepositorySlug(valueOf('--repo') || process.env.GITHUB_REPOSITORY),
        token: process.env.GITHUB_TOKEN || '',
      });

  const result = detectDuplicateExclusiveClaims(pullRequests);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`DUPLICATE_WORK_CLAIM_GATE_BLOCKED ${error.message}`);
  process.exitCode = 2;
});
