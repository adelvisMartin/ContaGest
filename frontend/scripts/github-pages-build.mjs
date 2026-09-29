import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(frontendRoot, 'dist');
const PAGES_BASE = '/ContaGest/';
const HIPICO_CANONICAL_PATH = `${PAGES_BASE}hipico-control/`;

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

function writeLegacyHipicoRedirect() {
  const legacyDir = path.join(distDir, 'frontend', 'public', 'hipico-control');
  fs.mkdirSync(legacyDir, { recursive: true });
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0; url=${HIPICO_CANONICAL_PATH}">
  <meta name="robots" content="noindex">
  <title>Control Hípico</title>
</head>
<body>
  <p>Abriendo <a href="${HIPICO_CANONICAL_PATH}">Control Hípico</a>…</p>
  <script>
    (() => {
      const target = new URL(${JSON.stringify(HIPICO_CANONICAL_PATH)}, window.location.origin);
      target.search = window.location.search;
      target.hash = window.location.hash;
      window.location.replace(target.href);
    })();
  </script>
</body>
</html>\n`;
  fs.writeFileSync(path.join(legacyDir, 'index.html'), html, 'utf8');
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

const hipicoEntryPath = path.join(distDir, 'hipico-control', 'index.html');
if (!fs.existsSync(hipicoEntryPath)) throw new Error('HIPICO_ENTRY_MISSING');
writeLegacyHipicoRedirect();

fs.copyFileSync(indexPath, path.join(distDir, '404.html'));
fs.writeFileSync(path.join(distDir, '.nojekyll'), '', 'utf8');

console.log(`[github-pages-build] Control Hípico canonical entry: ${HIPICO_CANONICAL_PATH}`);
console.log('[github-pages-build] legacy compatibility redirect: frontend/public/hipico-control/');
console.log('[github-pages-build] artifact ready: frontend/dist');
