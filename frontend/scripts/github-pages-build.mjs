import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(frontendRoot, 'dist');
const PAGES_BASE = '/ContaGest/';

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: frontendRoot,
    env,
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function walk(directory, visitor) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, visitor);
    else visitor(absolute);
  }
}

function rewriteRootRelativeHtml(html) {
  return html.replace(
    /\b(href|src|action)=(["'])\/(?!\/|ContaGest\/)([^"']*)\2/g,
    (_match, attribute, quote, remainder) => `${attribute}=${quote}${PAGES_BASE}${remainder}${quote}`
  );
}

const buildEnv = {
  ...process.env,
  GIT_SHA: process.env.GITHUB_SHA || process.env.GIT_SHA || process.env.COMMIT_SHA || '',
  GIT_BRANCH: process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || 'github-pages',
  NODE_ENV: 'production'
};

console.log(`[github-pages-build] base=${PAGES_BASE} sha=${buildEnv.GIT_SHA || 'unbound'}`);
run('npm', ['run', 'build:identity'], buildEnv);
run('vite', ['build', `--base=${PAGES_BASE}`], buildEnv);

walk(distDir, (absolute) => {
  if (!absolute.endsWith('.html')) return;
  const source = fs.readFileSync(absolute, 'utf8');
  const rewritten = rewriteRootRelativeHtml(source);
  if (rewritten !== source) fs.writeFileSync(absolute, rewritten, 'utf8');
});

const indexPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexPath)) throw new Error('GITHUB_PAGES_INDEX_MISSING');
fs.copyFileSync(indexPath, path.join(distDir, '404.html'));
fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf8');

console.log('[github-pages-build] artifact ready: frontend/dist');
