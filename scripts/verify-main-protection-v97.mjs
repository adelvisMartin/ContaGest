import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const repository = String(process.env.GITHUB_REPOSITORY || 'adelvisMartin/ContaGest').trim();
const branch = String(process.env.CG_GOVERNANCE_BRANCH || 'main').trim();
const token = String(process.env.GITHUB_TOKEN || '').trim();
const reportPath = resolve(process.env.CG_GOVERNANCE_REPORT || 'artifacts/release/governance-v97.json');

function gitText(args) {
  try { return execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', windowsHide: true }).trim(); }
  catch { return ''; }
}

const candidateSha = String(process.env.GITHUB_SHA || gitText(['rev-parse', 'HEAD']) || '').trim();
const candidateBranch = String(
  process.env.GITHUB_HEAD_REF
  || process.env.GITHUB_REF_NAME
  || gitText(['branch', '--show-current'])
  || 'DETACHED',
).trim();
const candidateDirty = Boolean(gitText(['status', '--porcelain=v1']));

const report = {
  schemaVersion: 2,
  issue: 97,
  repository,
  branch,
  candidateSha: candidateSha || null,
  candidateBranch,
  candidateDirty,
  checkedAt: new Date().toISOString(),
  status: 'NOT_EXECUTED',
  branchProtected: null,
  protectionReadable: null,
  checks: [],
  errors: [],
};

function persist() {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function fail(status, message, exitCode = 1) {
  report.status = status;
  report.errors.push(message);
  persist();
  console.error(`[governance-v97] ${status}: ${message}`);
  process.exitCode = exitCode;
}

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'contagest-release-governance-v97',
    },
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { raw }; }
  return { response, body };
}

if (!candidateSha || !/^[0-9a-f]{40}$/i.test(candidateSha)) {
  fail('BLOCKED', 'No se pudo ligar la verificación a un candidate SHA exacto.', 2);
} else if (candidateDirty) {
  fail('BLOCKED', 'El working tree está dirty; la evidencia live no corresponde de forma reproducible al candidate SHA.', 2);
} else if (!token) {
  fail('NOT_EXECUTED', 'GITHUB_TOKEN no está disponible; no se consultó protección live.', 2);
} else {
  try {
    const branchResult = await github(`/branches/${encodeURIComponent(branch)}`);
    if (!branchResult.response.ok) {
      fail(
        branchResult.response.status === 403 ? 'BLOCKED' : 'FAIL',
        `No se pudo leer metadata de branch: HTTP ${branchResult.response.status} ${branchResult.body?.message || ''}`.trim(),
        branchResult.response.status === 403 ? 2 : 1,
      );
    } else {
      report.branchProtected = Boolean(branchResult.body?.protected);
      report.checks.push({ name: 'branch-protected-flag', pass: report.branchProtected });

      if (!report.branchProtected) {
        fail('FAIL', `${branch} continúa con protected=false.`, 1);
      } else {
        const protectionResult = await github(`/branches/${encodeURIComponent(branch)}/protection`);
        if (!protectionResult.response.ok) {
          report.protectionReadable = false;
          fail(
            protectionResult.response.status === 403 ? 'BLOCKED' : 'FAIL',
            `Branch figura protegida, pero no se pudo inspeccionar la configuración: HTTP ${protectionResult.response.status} ${protectionResult.body?.message || ''}`.trim(),
            protectionResult.response.status === 403 ? 2 : 1,
          );
        } else {
          report.protectionReadable = true;
          const protection = protectionResult.body || {};
          const pullRequests = Boolean(protection.required_pull_request_reviews);
          const enforceAdmins = Boolean(protection.enforce_admins?.enabled);
          const forcePushBlocked = protection.allow_force_pushes?.enabled === false;
          const deletionBlocked = protection.allow_deletions?.enabled === false;
          const conversations = Boolean(protection.required_conversation_resolution?.enabled);
          const statusContexts = [
            ...(protection.required_status_checks?.contexts || []),
            ...(protection.required_status_checks?.checks || []).map((check) => check?.context).filter(Boolean),
          ];

          report.checks.push(
            { name: 'pull-request-required', pass: pullRequests },
            { name: 'admins-enforced', pass: enforceAdmins },
            { name: 'force-push-blocked', pass: forcePushBlocked },
            { name: 'deletion-blocked', pass: deletionBlocked },
            { name: 'conversation-resolution-required', pass: conversations },
          );
          report.requiredStatusChecks = [...new Set(statusContexts)].sort();
          report.snapshot = protection;

          const failures = report.checks.filter((check) => !check.pass);
          if (failures.length) {
            fail('FAIL', `Protección incompleta: ${failures.map((check) => check.name).join(', ')}`, 1);
          } else {
            report.status = 'PASS';
            persist();
            console.log(`[governance-v97] PASS ${repository}@${branch}; candidate=${candidateSha}; required checks=${report.requiredStatusChecks.length}`);
          }
        }
      }
    }
  } catch (error) {
    fail('BLOCKED', `No se pudo consultar GitHub: ${String(error?.message || error)}`, 2);
  }
}
