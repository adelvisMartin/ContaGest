#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectReferenceLinks } from './documentation-reference-links-v666.mjs';

// Explicitly curated critical surfaces; documents are reviewed before entering this gate.
export const CRITICAL_DOCUMENTS = Object.freeze([
  'README.md',
  'AGENTS.md',
  'docs/README.md',
  'docs/RELEASE_EVIDENCE.md',
  'docs/DATABASE_SECURITY_RECOVERY_RUNBOOK.md',
  'docs/STYLE_GUIDE_V1115.md',
  'docs/SELF_HOSTING_RUNBOOK.md',
  'docs/RUNBOOK_PRODUCTION_V566.md',
  'docs/qa/local-verification-runner-v630.md',
  'docs/qa/change-risk-classifier-v667.md',
  'docs/operations/ENVIRONMENT_MANIFEST_V665.md',
  'docs/architecture/PRODUCT_BOUNDARIES_CONTAGEST_HIPICO.md',
  'docs/release/BRANCH_PROTECTION.md',
  '.agents/skills/contagest-erp-orchestrator/SKILL.md',
  '.agents/skills/contagest-release-evidence/SKILL.md',
]);

export const SUPERSEDED_AUTHORITIES = Object.freeze({
  'docs/STYLE_GUIDE_V1115.md': 'AGENTS.md',
});

function withinRoot(root, requested) {
  const absolute = path.resolve(root, requested);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null;
  try {
    // A lexical path may still escape through a directory/file symlink.
    // Resolve the nearest existing ancestor to cover missing link targets too.
    const realRoot = realpathSync(root);
    let ancestor = absolute;
    const missing = [];
    while (!existsSync(ancestor)) {
      if (ancestor === root) return null;
      missing.unshift(path.basename(ancestor));
      ancestor = path.dirname(ancestor);
    }
    const realTarget = path.resolve(realpathSync(ancestor), ...missing);
    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) return null;
  } catch {
    // Broken symlinks, invalid roots and inaccessible components fail closed.
    return null;
  }
  return absolute;
}

function collectMatches(content, pattern) {
  const results = [];
  for (const match of content.matchAll(pattern)) {
    const line = content.slice(0, match.index).split('\n').length;
    results.push({ match, line });
  }
  return results;
}

function localLinkTarget(href) {
  const value = href.trim().replace(/^<|>$/g, '');
  if (!value || value.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|\/\/)/i.test(value)) return null;
  const raw = value.split(/[?#]/, 1)[0];
  if (!raw) return null;
  try { return decodeURIComponent(raw); }
  catch { return raw; }
}

function readScripts(root, packagePath, findings) {
  const resolved = withinRoot(root, packagePath);
  if (!resolved || !existsSync(resolved)) {
    findings.push({ code: 'PACKAGE_MISSING', doc: packagePath, line: 0, reference: packagePath });
    return {};
  }
  try { return JSON.parse(readFileSync(resolved, 'utf8')).scripts || {}; }
  catch {
    findings.push({ code: 'PACKAGE_INVALID', doc: packagePath, line: 0, reference: packagePath });
    return {};
  }
}

/** Filesystem-only, deterministic audit; never executes a documented command or fetches remote URLs. */
export function auditDocumentation({ root = process.cwd(), documents = CRITICAL_DOCUMENTS, superseded = SUPERSEDED_AUTHORITIES } = {}) {
  const base = path.resolve(root);
  const findings = [];
  const rootScripts = readScripts(base, 'package.json', findings);
  const workspaceScripts = new Map();
  const report = (code, doc, line, reference) => findings.push({ code, doc, line, reference });
  const uniqueDocs = [...new Set(documents)].sort();

  for (const doc of uniqueDocs) {
    const filename = withinRoot(base, doc);
    if (!filename) { report('DOCUMENT_TRAVERSAL', doc, 0, doc); continue; }
    if (!existsSync(filename)) { report('DOCUMENT_MISSING', doc, 0, doc); continue; }
    const contents = readFileSync(filename, 'utf8');
    if (superseded[doc] && !contents.includes('SUPERSEDED AUTHORITY: ' + superseded[doc])) {
      report('SUPERSEDED_UNMARKED', doc, 1, superseded[doc]);
    }
    for (const { match, line } of collectMatches(contents, /(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
      const value = localLinkTarget(match[1].split(/\s+["']/)[0]);
      if (!value) continue;
      const target = withinRoot(base, path.join(path.dirname(doc), value));
      if (!target) report('LINK_TRAVERSAL', doc, line, value);
      else if (!existsSync(target)) report('LINK_MISSING', doc, line, value);
    }
    // Reference-style links share the exact same root, symlink and URL policy
    // as inline links. Undefined labels are reported without guessing targets.
    for (const reference of collectReferenceLinks(contents)) {
      if (reference.kind === 'undefined') {
        report('LINK_REFERENCE_UNDEFINED', doc, reference.line, reference.reference);
        continue;
      }
      const value = localLinkTarget(reference.reference);
      if (!value) continue;
      const target = withinRoot(base, path.join(path.dirname(doc), value));
      if (!target) report('LINK_TRAVERSAL', doc, reference.line, value);
      else if (!existsSync(target)) report('LINK_MISSING', doc, reference.line, value);
    }
    for (const { match, line } of collectMatches(contents, /\bnpm\s+(?:(?:--workspace\s+|--workspace=)([a-zA-Z0-9_-]+)\s+)?run\s+([a-zA-Z0-9:_-]+)/g)) {
      const workspace = match[1];
      let scripts = rootScripts;
      if (workspace) {
        if (!workspaceScripts.has(workspace)) {
          if (!['backend', 'frontend'].includes(workspace)) report('WORKSPACE_UNKNOWN', doc, line, workspace);
          workspaceScripts.set(workspace, ['backend', 'frontend'].includes(workspace) ? readScripts(base, workspace + '/package.json', findings) : {});
        }
        scripts = workspaceScripts.get(workspace);
      }
      if (!Object.hasOwn(scripts, match[2])) report('NPM_SCRIPT_MISSING', doc, line, (workspace ? workspace + ':' : '') + match[2]);
    }
    for (const { match, line } of collectMatches(contents, /\bnode\s+((?:\.\/)?scripts\/[A-Za-z0-9_./-]+\.mjs)\b/g)) {
      const script = match[1].replace(/^\.\//, '');
      const target = withinRoot(base, script);
      if (!target || !existsSync(target)) report('NODE_SCRIPT_MISSING', doc, line, script);
    }
  }
  findings.sort((a, b) => a.doc.localeCompare(b.doc) || a.line - b.line || a.code.localeCompare(b.code) || a.reference.localeCompare(b.reference));
  return { schemaVersion: 666, status: findings.length ? 'FAIL' : 'PASS', scanned: uniqueDocs.length, findings };
}

function main() {
  if (process.argv.length > 2) throw new Error('DOC_INTEGRITY_UNSUPPORTED_ARGUMENT');
  const report = auditDocumentation();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (report.status !== 'PASS') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) { console.error('[documentation-integrity-v666] ' + error.message); process.exitCode = 1; }
}
