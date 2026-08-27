import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

console.log('[issue26] regenerando package-lock con npm...');
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
});

mkdirSync('frontend/dist', { recursive: true });
copyFileSync('package-lock.json', 'frontend/dist/issue26-package-lock.json');
writeFileSync('frontend/dist/index.html', '<!doctype html><meta charset="utf-8"><title>Issue 26</title><p>Lock generado por npm para QA.</p>', 'utf8');
console.log('[issue26] lock exportado');
